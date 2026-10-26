# Issue 32: import JSON as a new editable Script

## Delivered behavior

The dashboard's **Import JSON** action opens the existing Base UI Sheet. Owners choose a file or paste JSON, then review the Script, Author Credit, counts, structural errors, export blockers, artwork warnings, and unsupported fields. The original JSON remains available through review and edit-back. Discarding unknown/Bloodstar fields requires an explicit checkbox acknowledgement. Cancel creates nothing. Review and commit have pending, failure, and retry states.

The UI uses existing Sheet, Field, Input, Textarea, Checkbox, Badge, Button and Spinner components, the app's TanStack Form hook, existing typography, and semantic theme tokens. It uses a full-width Sheet on small screens and the same constrained panel on desktop. Keyboard submission, acknowledgement, Escape, focus restoration, and narrow-screen operation are exercised in Chromium.

Preflight preserves valid unique lowercase alphanumeric Character IDs, independent Author Credit, reminders, setup, flavor, night instructions, supported edition/special fields, and supported metadata. It rejects ambiguous IDs/references, Official Characters, unsupported Teams, wrong field types, conflicting Jinx explanations, and malformed explicit Night Orders. Representable content-invalid drafts import with export blockers. Each night's explicit array wins independently; numeric fallback stable-sorts positive priorities and inserts the approved standard steps.

One atomic D1 batch writes the new owned Script, Characters, both orders, Jinxes, and owner-only integration/artwork data. The initial schema defines Character identity as `(script_id, id)` so repeated imports can retain IDs. Existing Character queries remain scoped to their Script. Integration fields survive authored updates and export; Jinxes supplied from just one endpoint are retained.

Artwork preserves single/array form, slot count/order, and each slot's original source and pending/failed reference state. This slice performs no external fetch. Exports substitute Alchemist generic icons in those slots and omit pending logo/background fields. Private source URLs never enter public reads or exported image fields. Owners can keep references for later replacement, explicitly use generic icons, or omit Script artwork through an owner-enforced mutation.

## Verification

- `bun run check`: formatting, lint, typecheck, and all 113 tests passed. Lint reports non-fatal spread warnings, including existing warnings.
- `bun run build`: production Vite build passed.
- `ALCHEMIST_ORIGIN=http://localhost:5173 bun run test:e2e e2e/import.spec.ts`: all five import journeys passed. The final mobile-width assertion was changed from exact equality to a subpixel tolerance; its targeted rerun passed.
- Workbench regression suite: all 17 scenarios passed across the run and the backend-dependent case's retry. The combined 22-case run initially had 21 passes and one failure because the backend was absent. After starting the local Worker, `--grep 'anonymous and malformed'` passed against it.
- Desktop and 375px-wide import screenshots visually inspected; inspection caught and corrected the shared Sheet's default width overriding the import panel. A browser assertion now checks the mobile panel's full width.
- Domain fixtures cover absent metadata, independent night precedence, positive numeric priority ties, duplicate names, special/edition round trips, unknown nested fields, unsupported Teams and references, malformed JSON/arrays, and single/array artwork fallbacks.
- Application-service and RPC tests cover ownership, unchanged supplied credit, IDs reused across Scripts, edit/export preservation, acknowledgement, invalid drafts, failed persistence, private artwork references, and explicit fallback repair.
- Real Miniflare D1 tests exercise migrations, imported data reload, foreign-key integrity, scoped edits and repair, and a trigger that fails the final import statement. The failed batch leaves no Script, Character, Night Order, Jinx, or import record.

## Environment and remaining external checks

T3 preview initialization returned: `Preview automation open failed: This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+). Run sudo env "PATH=$PATH" t3 browser setup on the host once to allow it, then try again.` Browser checks used the repository's Playwright workflow with its configured Chromium `--no-sandbox` launch option.

The local Worker started with the placeholder Google configuration from `.env.example`; Alchemy created the local database and applied migrations before serving requests. Actual Google sign-in, deployment, and loading exported one-sided Jinxes in the official BOTC app require the maintainer's real configuration/session and were not exercised. Firefox, WebKit, physical mobile devices, and remote artwork copying were not exercised. Remote artwork copying belongs to the subsequent artwork slice; this issue explicitly excludes fetching images.
