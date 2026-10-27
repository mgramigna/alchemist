# Alchemist

A tool for designing and sharing homebrew Scripts for Blood on the Clocktower. Alchemist is in early development.

Built with React, TanStack Router, Tailwind CSS, and Effect. Alchemy manages the Cloudflare Worker and D1 database.

Alchemist is not affiliated with The Pandemonium Institute.

## Local development

Requires Bun 1.4.3 and Node.js 24.11.1 or newer.

```sh
bun install
cp .env.example .env
bun run dev
```

Open <http://localhost:5173>. The command starts the frontend and backend with automatic reload. Alchemy runs the Worker and database locally, so no Cloudflare credentials are needed. Local data persists in `.alchemy/` between restarts.

The local backend commands explicitly load the root `.env`, whose values take precedence
over shell environment variables. They also disable Bun's automatic env-file loading so
Alchemy's subprocesses cannot pick up `.env.production`. Edit `.env` to change local settings,
then restart the dev processes.
The example includes placeholder Google credentials so local pages and tests can run.
Replace them with real development credentials to sign in with Google.

Press Ctrl+C to stop both servers.

For Google sign-in configuration and the real-provider smoke check, see
[authentication setup](docs/authentication.md).

## Production

See [production deployment](docs/deployment.md) for Cloudflare/domain and Google
prerequisites, private configuration, state bootstrap, manual promotion and
required deployed smoke checks. Production uses `alchemist.town` and
`assets.alchemist.town`; credentials never belong in Git.

## Checks

```sh
bun run check
```

This runs formatting, lint, typechecking, and unit tests. Run the browser and API tests separately:

```sh
bun run test:e2e
```

Playwright builds the SPA and starts its own local Alchemy Worker and migrated D1 on
<http://localhost:1338>. It does not reuse your development server, deploy Cloudflare
resources, or require Google credentials. Each run gets a fresh stage; each test
creates its own user and data through real HTTP requests. Alchemy's local artifacts
remain under `.alchemy/`, separate from your normal development stage.

Install browsers once with `bunx --no-install playwright install chromium firefox`.
Chromium runs the full suite; Firefox also checks sheet downloads. WebKit is
currently excluded because its Secure-cookie behavior requires local HTTPS.

See [E2E testing](docs/e2e-testing.md) for the identity stub, test conventions, and
the boundary between local coverage and deployed smoke checks.
