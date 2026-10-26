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

Alchemy loads the root `.env` automatically; shell environment variables take precedence.
The example includes placeholder Google credentials so local pages and tests can run.
Replace them with real development credentials to sign in with Google.

Press Ctrl+C to stop both servers.

For Google sign-in configuration and the real-provider smoke check, see
[authentication setup](docs/authentication.md).

## Checks

```sh
bun run check
```

This runs formatting, lint, typechecking, and unit tests. With the dev server running, run the browser and API tests:

```sh
bun run test:e2e
```

Install the test browser once with `bunx --no-install playwright install chromium`.
