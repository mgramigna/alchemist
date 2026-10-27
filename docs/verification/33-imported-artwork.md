# Issue 33: copy imported artwork and repair failed image slots

Issue: [#33](https://github.com/mgramigna/alchemist/issues/33). Decisions:
[#16 imported image ownership](https://github.com/mgramigna/alchemist/issues/16),
[#11 storage](https://github.com/mgramigna/alchemist/issues/11) and the approved
spec in [#18](https://github.com/mgramigna/alchemist/issues/18).

## Delivered behavior

- **Copy at import.** `Script.import` still commits the Script in one atomic D1
  batch. Then, server-side, it copies every pending artwork slot: Character
  images, `_meta.logo` and `_meta.background`. Up to four references are copied
  at a time, with up to three slots each. No artwork failure can fail the import
  or discard Character data. A failure, including a defect or a failed storage
  write, stays on its slot (or the slot stays `pending`) so it can be retried.
- **Unchanged appearance.** Copies are published byte for byte under fresh
  immutable `artwork/<ulid>.<ext>` keys in their own sniffed format. Nothing is
  recolored, restyled or resized. The first image copied for a field is also
  stored as its private original under `<scriptId>/<id>`. That original is the
  starting point for an explicit restyle (Look picker or Studio). It follows the
  existing replacement and Script deletion cleanup.
- **Shape preserved.** A copied Character image becomes `character_artwork` with
  `imported = 1` (migration `0005`) and one variant per supplied slot, in order.
  A failed slot holds the Team's generic icon for its position, cycling through
  the Team's variants. The import reference stays in `script_imports` while the
  imported images are current, with per-slot state `pending | copied | failed`
  and a `problem` message. Exports read it to keep a single image single and an
  array at its supplied length. Uploading, restyling, **Use generic icons** or
  removing the icons supersedes the reference. Script fields are copied into
  `script_artwork`; a failed one is omitted from `_meta`.
- **Re-imported exports.** URLs under `/artwork/` on the asset origin are read
  from published storage and keep their existing immutable path, with no network
  request. Generic icon URLs on the asset origin stay generic.
- **Bounded fetches** (`packages/api/src/image-fetch.ts`, the `ImageFetcher`
  service):
  - only `http(s)` URLs on default ports, without credentials;
  - refuses `localhost`, single-label names, special-use suffixes
    (`.local`, `.internal`, `.test`, `.example`, `.invalid`, `.localhost`),
    the RFC 2606 example domains, every IPv6 literal and non-public IPv4 ranges,
    including WHATWG-normalized numeric hosts such as `http://2130706433/`;
  - follows at most 3 redirects manually and checks every target before
    requesting it;
  - 15 s timeout overall;
  - refuses a declared `Content-Length` above 10 MB and stops reading the body
    once it exceeds 10 MB;
  - accepts only content whose bytes sniff as PNG, JPEG, WebP or GIF, whatever
    the Content-Type says;
  - every failure is a short, owner-facing message stored on the slot.
- **Repair.** `Script.retryImportedArtwork` is owner-only (`ScriptNotFound`
  otherwise). It fetches only the uncopied slots of one reference. Its write is
  one conditional D1 batch that applies only while the reference still exists
  and the Character's original is unchanged; otherwise it returns
  `ArtworkConflict` and keeps nothing new. Copied slots are never fetched again,
  so later changes or outages at the external host cannot alter them.
- **Workbench notice.** The notice lists only references with uncopied slots. It
  shows "n of m images copied" and each slot's state, problem and source as text
  (the browser never requests external sources). Each item has three controls:
  - **Retry**, which reports "Still couldn’t copy …" or confirms with a toast;
  - **Replace…**, which opens the Character, or Script details for logo and
    background;
  - **Use generic icons** / **Omit …**.

  Pending and failure states are per item, controls are labelled buttons, and the
  layout wraps at 375px. The Character icon editor labels imported icons
  "Imported icons, exactly as supplied", numbers them "Image 1…n", and leaves the
  Look picker unselected until the owner chooses a restyle.

- **Fix found on the way.** The anonymous JSON export (`findExport`) did not load
  `character_artwork`, so public downloads exported generic icons even for
  uploaded artwork. Both adapters now include the published variants.

## Verification

- `bun run check`: formatting, lint, typecheck and all 184 tests pass. Lint
  reports only the existing kind of non-fatal `no-misused-spread` warnings.
- `bun run test:e2e`: all 84 tests pass (Chromium plus the Firefox capture
  checks). The new import journey:
  - publishes a real image through the local Worker, then imports JSON that uses
    it as a single image, as one slot of an array next to an unreachable
    `.invalid` URL, and as the logo;
  - shows only the partly copied Character in the notice;
  - retries with the keyboard and reports the slot that still fails;
  - **Replace…** opens the Character, showing the copied variant
    byte-identical to the file and the generic fallback in slot 2;
  - the public export reuses the same published URLs, keeps single and array
    form and contains no external URL;
  - **Use generic icons** ends the repair and persists across reload;
  - no horizontal overflow at 375px.

  The existing journey now expects refused `example.org` references to show as
  failed copies.

- Service tests (`imported-artwork.test.ts`) cover:
  - mixed successful and failed variant arrays, and single versus array output
    in both exports;
  - published bytes equal to the source, the private original, and restyle
    source reads;
  - unreachable hosts and invalid references;
  - retry fetching only failed slots and ignoring host changes;
  - owner denial, and persisted retry state;
  - Script background repair, generic fallback, editor removal and upload
    supersession with conflict;
  - re-import of an export without fetching;
  - a storage failure during copy that keeps the import pending and retryable.
- Fetcher tests (`image-fetch.test.ts`) use a fake `HttpClient` and cover:
  - allowed and refused targets, including metadata, loopback, private and IPv6
    literals;
  - redirects, including a redirect into a private address (refused before the
    request) and redirect loops;
  - HTTP errors, declared and streamed oversize bodies, SVG and empty bodies.
- Real Miniflare D1 tests (`imported-artwork-d1.test.ts`) cover:
  - owner scoping and conditional first copy and retry;
  - reference replacement in place;
  - public and export projections;
  - the empty-slot condition for Script artwork;
  - generic fallback deleting only imported artwork;
  - editor removal dropping the reference;
  - uploads clearing the imported flag.

## Limits and external prerequisites

- Hostnames that resolve to private addresses are not resolved and checked by
  the application. The protection is the Workers runtime, which cannot reach
  private networks. A local `alchemy dev` Worker runs with the developer's
  network, so the hostname rules above are its only protection.
- A Script with many artwork references makes many subrequests in one import
  (up to about 600 fetches plus R2 writes for 200 Characters with 3 slots each).
  This was not tested against the deployed Workers subrequest limit. Remaining
  slots stay `pending` and can be retried individually.
- Successful images are published exactly as supplied, including embedded
  metadata, as with uploads.
- Not exercised:
  - fetching from real external hosts, deployed R2 bindings and the production
    `FetchHttpClient` with `redirect: "manual"`;
  - the official BOTC app loading copied images;
  - physical mobile devices.

  Deploy migration `0005` before serving the updated Worker.
