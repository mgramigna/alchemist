# Issue #34: anonymous sharing and export feedback

The public `/scripts/:id` page combines the saved Script name and Author Credit,
read-only sheet previews, BOTC JSON eligibility/download, and both PNG downloads.
The application footer supplies the non-affiliation notice. No sign-in is required.
Reloading the link fetches the owner's latest saved state and refreshes JSON eligibility.

`Script.exportPublic` is an anonymous read operation. It takes a Script ID and uses
the configured application origin for generic image URLs. Its application service
reads a consistent D1 batch containing the Script, Characters, Night Orders, Jinxes
and preserved import data, then applies the same domain validation and serialization
as owner export. Only the resulting JSON or validation problems cross this boundary;
private artwork sources and repair references remain on the server. Supported
imported edition/special data and image slot cardinality survive export. No new
persistence schema or migrations are needed.

JSON blockers identify the affected Character, field and token position. JSON
loading/retry and validation are separate from sheet fitting and capture. A blocked
JSON download leaves PNGs available; an overflowing Character sheet leaves the
night sheet and valid JSON available; failed sheet fonts leave JSON available and
provide a PNG retry. Owner mutations and import repair remain authenticated and
owner-scoped.

## Verification

- `bun run check`: passed, 130 tests across 19 files. Includes anonymous HTTP JSON
  serialization, shared owner/public export results, invalid drafts, imported-data
  preservation without artwork source leakage, missing/deleted exports, D1 export
  snapshots, and existing mutation authentication/ownership checks.
- `bun run build`: passed (Node/Vite production build).
- Browser verification uses `ALCHEMIST_ORIGIN=http://localhost:5173` and the Node/Vite
  dev server. `e2e/sharing.spec.ts` routes browser RPC requests through the real
  application HTTP handler, services and a migrated Miniflare D1 database. Only
  identity lookup is controlled; the recipient uses a separate browser context
  with no session. This does not exercise real Google OAuth or deployed bindings.
- Chromium: all six new sharing journeys pass (including the focused rerun of
  loading/retry after fixing route-handler cleanup). The copied-link journey
  downloads and parses JSON, checks both 300 DPI PNGs, verifies an anonymous
  mutation returns `AuthRejected`, sees saved owner edits after reload, and sees
  not-found after persisted deletion. The other journeys cover JSON blockers,
  independent overflow, failed-font recovery, JSON transport retry, loading,
  public-read retry, and unknown links.
- The 12 existing Chromium sheet-preview/download checks pass, including both
  paper sizes, delayed/failed/hanging resources, overflow and narrow-screen use.
  Commands: `bun run test:e2e e2e/sharing.spec.ts --project chromium` and
  `bun run test:e2e e2e/sheets.spec.ts e2e/sheet-download.spec.ts --project chromium`,
  with the origin override above. Capture implementation is unchanged; Firefox
  and WebKit were not rerun in this slice.
- The shared page was visually inspected at 375px. Controls, preview and footer fit
  without horizontal scrolling. Keyboard activation downloads the JSON file.

## External prerequisites

The T3 collaborative browser could not start because this host blocks its sandbox
(AppArmor); browser checks use the repository's Playwright workflow instead.
Real Google sign-in, deployed Worker smoke checks, actual iOS Safari/Android Chrome,
and loading the JSON into the official BOTC app remain release checks. Stable
production application/asset origins and anonymous asset delivery/CORS are still
required before distributing production exports; see ADR 0003 and verification #26.
