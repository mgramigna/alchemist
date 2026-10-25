<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

## Agent skills

### TanStack SPA

- For React routing, loaders, search params, or route guards, read `.agents/skills/tanstack-router/SKILL.md`.
- For form validation, fields, composition, or submission, read `.agents/skills/tanstack-form/SKILL.md`.
- For table columns, sorting, filtering, pagination, or selection, read `.agents/skills/tanstack-table/SKILL.md`.
- `.agents/skills` is canonical; `.claude/skills` links to the same skills. `CLAUDE.md` links to this file.
- After adding a package with skills, run `npx --no-install @tanstack/intent install` to refresh guidance. Package skills track installed dependency versions; discovery skills fall back to official docs when a release has no skills.

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
