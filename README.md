# Alchemist

Design and share Custom Scripts for Blood on the Clocktower. Alchemist is not affiliated with The Pandemonium Institute.

The first application slice opens a persisted, empty Script anonymously at `/scripts/:id`, displaying its saved name and independent Author Credit. Unknown IDs have a not-found page. Authoring and authentication arrive in later slices.

## Local development

Requires Bun 1.4.3 and Node 24.11.1 or newer. Bun installs packages and runs Vitest; Node runs Vite, Alchemy, and app tooling.

```sh
bun install
bun run dev --stage local
```

Open <http://localhost:1337/scripts/01k8ac00000000000000000001>. Alchemy emulates D1 and the single Worker locally; Cloudflare credentials are unnecessary. `bun run dev` builds the SPA before starting Alchemy. API changes reload automatically. After web changes, stop and restart `bun run dev --stage local` to rebuild the SPA and refresh Alchemy’s asset manifest. Rebuilding assets while Alchemy is running can leave its manifest pointing at the previous bundle.

The fixture lives in `packages/api/fixtures/public-script.sql`, imported only when Alchemy's `dev` mode is true. Production migrations contain no fixture data. Its Author Credit deliberately differs from its owner's display name.

## Access from another Tailscale device

On the `solana` VM, the app can stay bound to localhost while Tailscale Serve proxies port 1337 within the tailnet:

```sh
tailscale serve --bg --http=1337 http://127.0.0.1:1337
```

With `bun run dev --stage local` running on solana, open <http://solana.tail4554c2.ts.net:1337/scripts/01k8ac00000000000000000001> from a device connected to the same tailnet. On the VM itself, the localhost URL also works. Use the DNS hostname for Tailscale Serve rather than the numeric IP. The proxy persists across restarts; the app must still be running. This leaves the existing HTTPS service on port 443 intact.

Disable only this proxy with `tailscale serve --http=1337 off`.

## Boundaries

- `packages/domain`: browser-safe schemas and public representation; `@alchemist/domain/rpc` contains the public RPC contract.
- `packages/api`: Scripts application service, Effect SQL D1 adapter, thin RPC handlers, and conventional Worker entrypoint.
- `packages/web`: React SPA consuming the shared contract through AtomRpc. Its registry belongs to the React root.
- `alchemy.run.ts`: resources, migrations, dev-only fixture import, bindings, and built assets. Application code never imports Alchemy.

`POST /api/public/rpc` uses Effect's explicit HTTP transport and NDJSON serialization. API and auth paths always enter the Worker, including navigation requests and unsupported methods; their errors never fall through to SPA HTML. The remaining paths use the SPA asset binding, so refreshing a public link works.

The public response contains only `id`, `name`, `authorCredit`, and `characters` (empty in this slice). SQL selects only public columns, and the application service projects the public schema again. Each request acquires its own SQL client, handlers, and scoped HTTP RPC server inside the router request scope. Scope cleanup follows response consumption/abort; no bindings or identity are retained between requests. The isolate-level router does no database I/O during construction.

## Migrations and verification

Committed migrations in `packages/api/migrations` are immutable once applied. Add a new numbered SQL file for subsequent changes. Alchemy owns the `__alchemy_migrations` ledger; do not use Effect's transaction-based migrator or a separate Wrangler database.

The `Scripts` D1 resource applies migrations, then imports the dev fixture. `App` binds that resource through `env.DB`, establishing the dependency on its reconciled output. On the first local run on 2026-10-25, `0001_scripts.sql` was applied at 23:00:21 UTC, the resource completed before the Worker started at 23:00:23 UTC, and HTTP read the fixture from that same database. A second reconciliation reported no changes. The actual `.alchemy/local/d1/cloudflare-runtime-D1DatabaseObject/*.sqlite` file contained `__alchemy_migrations` with `0001_scripts.sql`, plus `users`, `scripts`, and the expected fixture row. Local state is under `.alchemy/`; keep it to preserve your local database.

With the local server running in another terminal:

```sh
bun run check
bun run smoke
bun run test:browser
```

`check` runs formatting, type-aware lint, typechecking (including deployment wiring), and service/RPC tests. `smoke` uses the real typed HTTP client against local D1, checks persisted public fields and not-found errors, refresh routing, invalid RPC input, and reserved API/auth error paths. Browser checks cover the persisted view, refresh, loading, errors/retry, keyboard access, and a 375px viewport. Install Chromium with `node node_modules/@playwright/test/cli.js install chromium` if it is not already available.

Verified locally on 2026-10-25: `bun run check` passed (four service/RPC tests), `bun run build` passed, `bun run smoke` passed against Alchemy’s migrated D1, and all four `bun run test:browser` checks passed. Restarting Alchemy preserved the fixture and left D1 unchanged. T3’s browser sandbox was blocked by host AppArmor, so browser verification used Playwright Chromium.

## Deployed smoke

Production provisioning has not been performed. It requires Cloudflare account credentials and the intended application origin/environment policy. The current stack uses local Alchemy state; retain that directory and choose a shared state policy before introducing CI. Migrations precede binding the Worker in deployment too; deployment failure does not roll back applied migrations.

After configuring credentials, deploy with `bun run deploy --stage production`. No dev fixture is imported. Once a real Script exists, run:

```sh
bun run smoke https://YOUR_APP_ORIGIN REAL_SCRIPT_ID
```

The supplied Script must exist, and the all-zero unknown ID used by the smoke check must remain absent. The deployed command verifies the response shape/ID, typed not-found, SPA refresh, malformed RPC handling, and reserved API/auth routes. It does not require the development fixture's title or Author Credit. Deployed D1/Worker behavior remains an external verification prerequisite.
