# Issue #26: validated BOTC JSON download

Owners can download the saved Script from the Workbench. Shared domain rules supply the browser's blocker count/list and server enforcement. Character blockers open the affected Character and identify the field or token position; metadata and Night Order blockers lead to their controls. Draft persistence remains unchanged.

The export includes Script name/Author Credit, both complete night arrays, generic absolute image variants in the agreed slot order, both token lists (including duplicates), setup, flavor, both instruction fields and priorities derived solely from array positions (zero for non-members). Each unordered Jinx is emitted once on the lexicographically smaller Character ID, regardless of which endpoint edited it.

The checked-in official schema is pinned at `f10cd02e3401af227ce406287eaae7bb99a06a42`; see `packages/domain/src/schemas/README.md` for provenance and validation details. It requires 5–201 total entries (one metadata record plus 4–200 Characters), 50-character metadata strings, and at most 200 entries in each night array. These additional whole-Script limits are visible blockers. Effect imports and checks the entire document, with a small absolute-URI syntax pattern augmenting URI annotations. Scheme-specific host/port validation is deliberately outside that pattern.

Downloads require all autosave queues and structural mutations to finish successfully. Pending/failed saves display an explicit retry requirement and make no export request. A request temporarily disables editing; success downloads a JSON Blob, failure displays an error and restores controls. The API reads persisted owner-scoped data and uses configured APP_ORIGIN for generic asset URLs; clients cannot choose the host in RPC payloads or headers. No new persistence columns or editable numeric priorities were introduced.

Verification:

- `bun run check`: passes; 79 tests across 15 files. Includes owner service fixtures, invalid drafts, name uniqueness, metadata limits, complete/after-Dawn orders, derived priorities, duplicate reminders, Traveller variants, one-sided Jinxes, HTTP authentication/owner denial and successful JSON serialization. Schema fixtures assert explicit expectations for authored limits, invalid shapes, property rules and URI syntax in image strings/arrays and metadata logo/background/almanac fields.
- `bun run build`: passes (Node/Vite production build).
- Workbench Chromium run against the Node/Vite server: 15 passed; the pre-existing anonymous-link journey failed because this isolated server has no Worker backend for its unmocked Account.current request. All controlled owner journeys passed, including the new actual download check on a 375px viewport, keyboard activation, blocked pending/failed saves and retry. Download contents are parsed and compared with expected fields.

Release blockers / external prerequisites:

- Official-app interoperability is **unverified**. Before release, load an exported Script with a one-sided Jinx in the official app and confirm the rule is visible/works from both endpoints, both night orders (including after-Dawn entries) load correctly, and generic SVG variants display. Schema validity alone does not establish interoperability.
- Configure a stable production APP_ORIGIN before distributing exports. Verify anonymous HTTPS delivery of versioned generic icon URLs from that deployment. Localhost exports are suitable only for local checks.
- Production Worker deployment and actual mobile Safari/Android Chrome checks were not performed in this slice. Custom artwork and anonymous download are separate planned slices.

The follow-up [Effect Schema spike](26-effect-schema-spike.md) records the native-import comparison. Export text blockers and visible counters now use official Unicode code-point lengths; the saved service fixture and Chromium journey cover emoji at and above the limits. The two focused Chromium checks (JSON download and Unicode counters) pass.
