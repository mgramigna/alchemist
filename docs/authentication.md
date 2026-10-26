# Google sign-in and current browser sessions

Implements [issue #20](https://github.com/mgramigna/alchemist/issues/20) and the decisions in [#10](https://github.com/mgramigna/alchemist/issues/10#issuecomment-6404106281).

## Configure Google

Create a Google OAuth **Web application** client in a maintainer-owned Google Cloud project. Configure the consent screen for the intended audience (external/open sign-up in production). While Google keeps the consent screen in testing, add the accounts used for the manual smoke test as test users.

Register this exact authorized redirect URI:

```text
<APP_ORIGIN>/auth/google/callback
```

`APP_ORIGIN` is the browser-facing origin, including scheme and port, with no path or trailing slash. Use HTTPS in production. Do not use a different host, port, trailing slash, or callback path. The Worker checks the request origin and always sends the configured callback to Google; request headers cannot select a redirect URI.

Supply these deployment environment values to Alchemy:

- `APP_ORIGIN`: stable production app origin.
- `GOOGLE_CLIENT_ID`: web application's OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: web application's client secret. The Effect Worker constructor resolves `Config.Redacted`, which Alchemy binds as a Worker secret. Keep it in private environment/secret configuration, never Git, browser code, or an issue comment.

The Worker constructor requires all three values in every environment and fails during startup/planning if any are missing. For local development, copy the committed `.env.example` to the ignored root `.env`. Alchemy loads `.env` automatically, and shell environment variables override the file. Placeholder credentials let public pages, account forms and automated tests run; completing Google sign-in requires real development credentials. No test identity or bypass endpoint is deployed.

For the Vite frontend, use:

```sh
cp .env.example .env
bun run dev
```

Register `http://localhost:5173/auth/google/callback` with the development Google client. Alternatively, `APP_ORIGIN=http://localhost:1337 bun run dev:worker` serves the built SPA at `http://localhost:1337`; register that callback and use that origin. Use the same hostname throughout (do not alternate localhost and 127.0.0.1). Cookies retain `Secure` in development; use a browser that treats localhost as a trustworthy origin, or configure HTTPS. Remote development also needs a trustworthy browser-facing HTTPS origin and its own exactly registered callback.

When accessing Vite on the development VM, set `APP_ORIGIN` to the exact URL used in the browser (for example, `http://solana:5173` for anonymous local testing). The `/api` and `/auth` development proxies preserve the browser-facing Host; do not enable `changeOrigin`, because the Worker's strict origin check must see the external origin rather than port 1337. After changing `.env`, restart both dev processes. If the Worker still reports a different configured origin, check for an exported `APP_ORIGIN` in the launching shell, which takes precedence over `.env`. Real remote sign-in still requires HTTPS for the Secure cookies.

See [Google's OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect) for client/consent setup and provider claims.

## Behavior and boundaries

`GET /auth/google` generates independent random state, browser binding, nonce, and an S256 PKCE verifier/challenge. D1 holds the verifier/nonce for a ten-minute attempt, keyed by hashed state and browser binding. The browser gets a host-only login cookie. Callback claims the unexpired row with one atomic `DELETE … RETURNING` before exchanging the code; replayed or concurrent callbacks cannot reuse it. Starting another login prunes expired attempts and sessions.

The Google adapter exchanges the code server-side and uses [jose](https://github.com/panva/jose) with Google's rotating public JWKS. It checks RS256 signatures, issuer, audience/authorized party, expiration, issued-at time, subject and nonce. Only Google `sub` and the initial display name leave the adapter. Email, avatar and Google tokens are not persisted. A later sign-in resolves the same internal User and preserves their edited display name. A missing profile name defaults to “Alchemist”; names are limited to 100 characters.

Sessions use 32 random bytes. D1 stores only their SHA-256 hashes, internal User IDs, creation times, and fixed expiry times. The `__Host-alchemist-session` cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`, with a 30-day maximum age and no Domain. Reads and edits check expiry without extending it. Sign-out deletes only the current session and clears its cookie.

Authentication uses the bare D1 binding, deliberately **without** the D1 Sessions API: [Cloudflare documents that these queries always use the primary](https://developers.cloudflare.com/d1/best-practices/read-replication/). Do not move auth queries onto replica-backed sessions. Mutations require an exact matching Origin and reject cross-site Fetch Metadata. Account RPC services and browser identity are scoped to each HTTP request. Public Script reads remain anonymous and expose only the existing public representation.

Display-name edits update only the User; they do not rewrite existing Script Author Credits. The account service derives the target User from the session, never from a browser-supplied User ID. Future Script mutations still require Script Owner enforcement in their application services.

## Alchemy and application composition

The [Alchemy Effect RPC guide](https://alchemy.run/cloudflare/apis/effect-rpc/) recommends shared schema/RPC declarations, pure handler construction, `RpcServer.toHttpEffect`, and matching serialization on server and client. The application follows those practices using NDJSON and HTTP routes for the two RPC groups.

ADR 0002 permits Alchemy in the infrastructure composition root. `alchemy.run.ts` assembles the stack. `infra/worker.ts` uses Alchemy's Effect Worker constructor to resolve configuration, register the D1 binding, and construct production application layers. The constructor requires configuration; local placeholder values come from `.env` rather than code defaults. Alchemy discovers and binds configuration during construction, as described in its [configuration guide](https://alchemy.run/cloudflare/security/secrets-env/); application handlers do not read `process.env`.

`packages/api/src/app.ts` owns the HTTP/RPC composition and takes `Auth`, `Scripts`, and `AppConfig` services. The Worker supplies production layers; tests supply alternative layers to the same application. The domain package's `index.ts` is only a barrel; schemas/errors live in `script.ts` and `auth.ts`, and `rpc.ts` imports those leaves directly. Application and domain modules do not import Alchemy.

The composition root uses Alchemy's `SQL.D1Layer` over `QueryDatabase`. This registers a deferred binding during construction and acquires one SQL client per execution scope when queries run. No SQL is executed while planning the Worker. The database resource's local fixture imports are determined only when a deployment context is present; the Worker can reconstruct the resource identity without that deployment-only context. Assets and SPA fallbacks use Alchemy's configured static asset routing; API and auth paths remain Worker-first.

The D1 adapter uses `SqlClient.SqlClient` for query construction/execution. It requests Effect's `D1Client` extension only for atomic batches, which the generic client does not expose. Both tags come from one Alchemy `SQL.D1Layer` at the Worker boundary; query routing to the primary is a property of that binding, independent of which service tag the adapter yields.

## Verification

Automated checks for this slice:

- `bun run check`: formatting, type-aware lint, typecheck, and 18 passing tests. Auth service tests use Effect's controlled clock and identity provider. Signed Google-token fixtures cover invalid signatures/claims and key rotation. HTTP tests check cookies and invalid callbacks.
- HTTP RPC serialization, concurrent identity isolation, cookies, sign-out and cross-origin rejection use the real HTTP application with swapped Effect service layers, a controlled identity provider, and a controlled clock. They do not start a Worker emulator.
- Three focused persistence tests use Miniflare solely for real workerd-backed D1 migrations, atomic `DELETE … RETURNING`, identity upsert/session SQL, and batch rollback. Swapping `AuthStore` proves workflow behavior but cannot establish those SQL/driver semantics. Miniflare is test-only.
- `bun run build`: production SPA build passes. The Alchemy local Worker starts, applies migrations and serves the built SPA.
- `bun run test:e2e` against `APP_ORIGIN=http://localhost:1337 bun run dev:worker`: 15 passing checks, including native Worker configuration/cookie checks, keyboard/narrow-screen account editing, blank-name validation, retained failed input/retry, loading/failure states, sign-out, and existing public reads. Browser profile states use controlled RPC responses; persistence/authorization are tested against real D1 separately.

External prerequisite: real Google credentials and an exactly registered callback have not been supplied. After configuring them, perform this manual smoke test before production promotion:

1. Sign in from the configured origin; confirm Google's consent request uses only `openid profile` and returns home signed in.
2. Edit the display name, sign out, and sign back in. Confirm the edited name survives.
3. Sign in through another browser profile. Sign out of the first browser; confirm the second stays signed in and the first loses account access immediately.
4. Inspect browser cookies for the flags above. Confirm the callback cannot be replayed and a denied Google consent does not sign in.

The local Effect Worker was checked with placeholder credentials loaded from `.env` through constructor configuration binding. Missing configuration fails during construction. The configured check exercises the real D1 OAuth-start batch and exact redirect/cookie behavior without contacting Google. The secret stays `Redacted` until the token-exchange adapter builds its request body.

The Google network exchange and deployed production bindings remain external smoke checks; automated tests do not claim to establish those.
