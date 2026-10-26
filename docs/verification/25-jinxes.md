# Jinx authoring verification

Issue: [#25](https://github.com/mgramigna/alchemist/issues/25).

## Delivered behavior

The Character editor includes a Jinx section using the existing field components,
Character tokens, dropdown menu, spacing, and autosave indicator. Selecting another
Character creates one shared relationship; either endpoint edits and deletes it.
Both names and icons appear in the editor, live preview, and public read-only view.
Blank explanations and explanations longer than 500 characters remain saved drafts
and appear in the shared export blockers. The storage limit is 2000 characters,
consistent with the separate draft and export bounds on other authored fields.

Pairs are canonicalized by Character ID. D1 enforces ordered distinct endpoints,
a unique pair per Script, and composite foreign keys to Characters in that Script.
Character deletion removes Jinxes and Night Order memberships in the same atomic
batch as the Character and Script change time.

## Results

Verified on 2026-10-26:

- `bun run check`: passed, including formatting, lint, types, and 52 tests.
- Production build using Node:
  `node packages/web/node_modules/vite/bin/vite.js build --config packages/web/vite.config.ts`:
  passed.
- Application-service tests: blank and over-limit drafts, shared export validation,
  reversed endpoint edits and deletion, same-Character and cross-Script rejection,
  non-owner rejection, public projection, and attached-Jinx removal passed.
- RPC tests: session requirements for all four Jinx operations and round trips
  through both endpoint orientations passed.
- Real Miniflare D1: all numbered migrations applied; concurrent duplicate attempts
  produced one relationship; constraints and owner scoping passed. An injected
  failure on the final Character deletion statement rolled back the Character,
  Jinxes, Night Order memberships, and Script change time. Deletion succeeded after
  removing the injected failure.
- Chromium Jinx journeys against the controlled RPC fixture passed (2 tests):
  keyboard creation and deletion, autofocus, blank/over-limit correction, save and
  reload from the opposite endpoint, failed creation/save/deletion recovery,
  navigation warning and retry, public read-only content, names/icons, and a
  375px viewport without horizontal overflow.
- The broader Workbench run passed 12 of 13 tests. Its anonymous-route test needs
  the matching local Worker and failed against the unrelated service on port 1337.
  The new Jinx journeys were subsequently rerun successfully after the final UI
  changes. Desktop and narrow-screen screenshots were inspected; Playwright writes
  them under the ignored `test-results/` directory.

## External prerequisites and limits

The local Alchemy Worker could not bind port 1337 because an existing process owns
it. That process was left untouched. Migration application in Alchemy's actual
local database and a live Worker HTTP smoke check remain unverified; Miniflare D1
and RPC adapter tests provide the persistence and transport evidence above.
To run those checks, provide the expected Worker on port 1337, apply migrations
through the normal Alchemy workflow, load the development fixture if needed, and
run the public API and anonymous-route Playwright checks.

T3's collaborative browser could not start because the host blocks its sandbox
with AppArmor. Browser checks used the repository's Playwright workflow instead.
Actual mobile devices and deployed Cloudflare/OAuth checks were not run.
