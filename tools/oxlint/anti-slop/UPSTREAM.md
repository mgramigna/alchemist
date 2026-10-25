# Anti-slop provenance

- Source repository: https://github.com/dmmulroy/anti-slop
- Source commit: `13909c9e07590f5a85d93c62712259fe14a883f7` (upstream HEAD at install, 2026-10-25; also the latest commit touching `skills/install-anti-slop/assets`).
- Copied from `skills/install-anti-slop/assets/anti-slop` with the skill's `scripts/install.mjs`. The installed files are byte-for-byte identical to that directory, including `vendor/eslint-stylistic/LICENSE` and `UPSTREAM.md`.
- Pristine snapshot: `tools/oxlint/upstream/anti-slop-13909c9.tar.gz` (extract with `tar -xzf`; contains `anti-slop/`). SHA-256 `b1969348b2803f61ecdde1e1fe881aadbd98fca4cb8fec44545b89d1752b811d`. Use it as the base for three-way merges on future updates.
- Installed entry points: `tools/oxlint/anti-slop/index.ts` and `tools/oxlint/anti-slop/effect/index.ts`.
- Dependencies: `oxlint` and `@oxlint/plugins` pinned together at `1.89.0`.

## Intentional deviations

None in the plugin source. `.oxlintrc.json` enables every generic rule, `oxc/no-accumulating-spread`, and all five Effect rules at `error`.
