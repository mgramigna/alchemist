# E2E testing

## Run

```sh
bunx --no-install playwright install chromium firefox # once
bun run test:e2e
bun run test:e2e e2e/workbench.spec.ts --project chromium --workers 1
```

No separately running dev server, Google credentials, or Cloudflare deployment is
needed. Playwright builds the frontend, starts `alchemy.e2e.ts` in development
mode, waits for `http://localhost:1338`, and stops the server afterward. Port 1338
must be free: `reuseExistingServer` is deliberately disabled. Failure traces are
retained in `test-results/`.

Each invocation uses a UUID stage in the separate `alchemist-e2e` stack, so local
D1 starts with migrations and the development fixture, not a developer's existing
database. Each authenticated test uses a unique Google subject and creates its
own records. Parallel tests must not modify the shared development fixture.
Alchemy's state and local runtime artifacts remain under ignored `.alchemy/`;
this does not create cloud resources. Do not delete that shared directory while
using a development server or without considering any locally stored deployment
state.

Chromium runs the whole suite. Firefox also runs the sheet download checks.
WebKit is intentionally excluded for now: its handling of production-style
Secure cookies on HTTP localhost would require a local HTTPS setup. Do not
weaken production cookies to accommodate a test browser.

## What is real

The built frontend talks over HTTP to the actual local Worker. The shared
`infra/application.ts` composition supplies the same `AuthLive`, RPC handlers,
authorization, D1 adapters, and migrated local D1 as the normal Worker. This is
local Cloudflare emulation, not a claim that the hosted environment is identical.

**Do not fabricate or fulfill RPC responses in Playwright.** Arrange data through
real authenticated RPCs and assert saved results through reloads or real reads.
Use `e2e/support/api.ts` for setup/readback; it validates real wire responses and
uses the browser context's cookie jar. Prefer user interactions for the behavior
under test. Unit/service tests are the place for mocked application dependencies.

A targeted network abort or delayed request is allowed to exercise a visible
failure/loading/retry state. Continue other RPCs to the server, then remove the
interception and verify recovery. Asset/font failure injection is also allowed.
Do not reimplement a backend in a Playwright route handler.

## Google OAuth boundary

`GoogleIdentityProvider` is the Effect service seam. Only its external adapter is
replaced by `packages/api/test/support/google.ts` in `infra/e2e-worker.ts`.

`signIn(page, { sub?, name? })` starts the real `/auth/google` flow, retains its
browser cookie and state, chooses a local test identity, and visits the real
callback. The adapter validates the code's shape, nonce, and verifier challenge.
The real application then consumes the one-time D1 flow and issues its normal
hashed, expiring session. Authentication, ownership checks, profile persistence,
sign-out, and cookie flags are not stubbed. Passing the same `sub` explicitly
allows a test to sign back into the same account.

The local adapter intentionally accepts unsigned test identities. It is not a
Google token verifier. Production's `infra/worker.ts` never imports it; there is
no environment toggle that activates it in the normal Worker. The separate E2E
stack rejects non-development mode before yielding any resources, and the E2E
Worker requires the exact local test origin. Do not expose this test server
through a tunnel or otherwise make it publicly reachable.

Automated tests cover normal sign-in, cookie-bound callbacks, nonce/verifier
mismatch, replay rejection, reload persistence, sign-out, and cross-user access.
The real Google adapter has its own token/claim tests. Neither establishes that
Google credentials, consent settings, or deployed bindings are configured right.

## Deployed smoke checks

Keep the large browser suite local. After a staging deployment, check the real
hostname's assets/API routing, D1 bindings and migrations, HTTPS cookie behavior,
and a small persistence round trip using dedicated test data. Follow the
[real Google smoke checklist](authentication.md#verification) before production
promotion. These are separate live checks, not a reason to deploy a fresh stack
for every browser test. The managed local E2E suite intentionally does not accept
an arbitrary remote `ALCHEMIST_ORIGIN` or enable its identity stub remotely.
