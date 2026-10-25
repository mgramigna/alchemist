## Agent skills

### Commands

- Bun is the package manager and the Vitest runner (`bun run test` uses `bun --bun vitest run`). Run app code and builds with Node. Do not use `bun test`; it bypasses the root Vitest config.
- Root verification: `bun run check` (runs `fmt:check`, `lint`, `typecheck`, `test`). Run it before handing off unless the user says to skip verification.
- Effect diagnostics come from type-aware Oxlint (`bun run lint`), not `tsc`. The Effect language service has `diagnostics: false` so editors don't report them twice.
- Shared versions live in the root `workspaces.catalog`; reference them from packages with `"catalog:"`. All `effect` / `@effect/*` v4 packages stay on the same version.

### Issue tracker

Issues and specs live in GitHub Issues for `mgramigna/alchemist`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
