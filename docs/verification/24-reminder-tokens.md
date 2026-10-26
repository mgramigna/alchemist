# Reminder Tokens, setup and flavor verification

Issue: [#24](https://github.com/mgramigna/alchemist/issues/24).

## Delivered behavior

The existing Character form now has separate ordered Reminder Tokens and Global
Reminder Tokens sections, an Affects setup checkbox, and optional flavor text.
It reuses the Workbench's section layout, field controls, outline Add buttons,
ghost up/down/remove buttons, inline errors, and shared autosave status. The reorder
controls follow the Night Order editor's keyboard pattern, with focus following
add, move and removal and changes announced through a polite live region.

Duplicate labels remain separate entries. Drafts preserve blank labels, labels over
the export limit, lists over the export count, and long flavor text. Inline errors
and the shared export summary use the same domain validation. Summary entries
identify the list and token position. Setup defaults false; flavor defaults blank.
Team changes preserve all four fields.

Export limits follow the official
[Script schema](https://github.com/ThePandemoniumInstitute/botc-release/blob/main/script-schema.json):
20 tokens per list, 30 characters per ordinary label, 25 per global label, and
500 characters for flavor. Blank token labels also block export. Storage bounds
are deliberately wider: 100 tokens per list, 100 characters per label, and 2000
characters of flavor. The UI prevents exceeding those storage bounds.

The existing authenticated Character update RPC carries the fields through the
application service and owner-scoped D1 adapter. Migration 0007 adds JSON arrays,
a boolean setup flag, and flavor text with defaults for existing Characters.
Character writes and the Script change time still share one atomic D1 batch.

## Results

Verified on 2026-10-26:

- `bun run check`: formatting, lint, types, and all 55 tests passed.
- Production build with Node:
  `node packages/web/node_modules/vite/bin/vite.js build --config packages/web/vite.config.ts`
  passed.
- Chromium Workbench checks:
  `ALCHEMIST_ORIGIN=http://127.0.0.1:5173 bun run test:e2e e2e/workbench.spec.ts --grep-invert 'anonymous and malformed'`
  passed all 14 tests. The excluded anonymous-route check needs a live matching
  Worker. The two new token journeys cover keyboard add/edit/reorder/remove,
  duplicate positions, list isolation, inline and shared validation, setup toggle,
  Team preservation, invalid draft save/reload, failed-save retry, 21-token draft
  persistence and correction, and a 375px viewport without horizontal overflow.
  Desktop and narrow-screen screenshots were inspected.
- Domain checks cover blank and over-length labels, list count limits, duplicate
  labels, separate ordinary/global limits, optional flavor, exact export bounds,
  and distinct summary entries for each token problem.
- Application-service checks cover default values, invalid draft round trips,
  preservation on Team change, and non-owner rejection.
- RPC checks cover field round trips, anonymous rejection, and non-owner rejection.
- Real Miniflare D1 applies every numbered migration and verifies ordered duplicate
  drafts, separate lists, over-limit values, setup/flavor, subsequent reads, Team
  changes, owner scoping, and Script change time.

## External prerequisites and limits

T3's collaborative browser could not start because the host blocks its AppArmor
sandbox. Browser checks use the repository's Playwright workflow against the local
Vite server with the established controlled owner RPC fixture; real persistence
and authorization are tested separately through Miniflare D1 and application/RPC
seams. Screenshots are written under the ignored `test-results/` directory.

Applying migration 0007 to the actual Alchemy database and live Worker HTTP,
Google OAuth, deployed Cloudflare, and physical mobile-device checks require the
matching running environment and were not performed here.
