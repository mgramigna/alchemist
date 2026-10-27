# Script logo and background verification

Issue: [#31](https://github.com/mgramigna/alchemist/issues/31). Decisions:
[#11 storage](https://github.com/mgramigna/alchemist/issues/11) (logos and
backgrounds share the Character artwork policy) and the approved spec in
[#18](https://github.com/mgramigna/alchemist/issues/18).

## Delivered behavior

- **Script details** has a **Script artwork** section with **Logo** and
  **Background** slots. Each shows a preview of the published image (or "No
  logo"/"No background"), an **Upload**/**Replace** button that opens the file
  chooser from the keyboard, drag and drop, and **Remove**. PNG, JPEG, WebP and GIF
  up to 10 MB are accepted, the same as Character uploads.
- No Character styling is applied. The browser sends the original. The server
  sniffs its real type (SVG and others are refused) and checks ownership before
  writing anything. It stores the original in the private `ArtworkSources` bucket
  under `<scriptId>/<id>` and publishes the same bytes to `PublishedArtwork` under
  a fresh `artwork/<ulid>.<png|jpg|webp|gif>` key, using the no-overwrite
  precondition. Only then does one D1 batch switch the `script_artwork` row
  (migration `0003`). That switch is conditional on the slot's previous original
  still being current, and it drops any imported reference for the same slot.
- If the source write, publishing or the switch fails, the previous artwork stays
  current and the unused new original is deleted. The UI keeps the prior preview
  and shows the failure with **Try again**, which reuses the chosen file. Replacing
  or removing artwork deletes only the replaced private original. Published images
  are never deleted, so earlier exports keep loading. Removal is also conditional
  on the expected original (`ArtworkConflict` otherwise). Removing an empty slot
  changes nothing.
- `Script.readArtwork` (owner-only), `Script.uploadArtwork` and
  `Script.removeArtwork` return published paths only. The public read gains
  `artwork: { logo, background }` with the same paths. Source IDs and formats
  never leave the API. The share page shows the logo above the Script name.
- Both JSON exports (owner and public) write `_meta.logo` and `_meta.background`
  as absolute URLs against the asset origin, and leave them out when the slot is
  empty. Unresolved imported references are still omitted.
- The Worker's `/artwork/*` route now serves each published format with the
  Content-Type taken from its extension. CORS, immutable caching, ETag/304,
  `nosniff`, 404 and 503 behavior are unchanged.
- The character and night sheets are unchanged. They do not show logos or
  backgrounds.
- Script deletion does not exist yet (#35). Originals are keyed under the Script
  ID so that deletion can remove them. Published images will remain.

## Verification

- `bun run check`: formatting, lint, typecheck and all tests pass. Lint reports
  only non-fatal warnings, the same kinds as before.
- `bun run test:e2e`: the full suite (Chromium plus the Firefox capture checks)
  passes after updating the public wire-shape assertion in
  `public-script-api.spec.ts` for the new `artwork` field. The two new
  `e2e/script-artwork.spec.ts` journeys run against the real local Worker, D1 and
  R2:
  - logo (PNG) and background (JPEG) chosen with the keyboard;
  - published bytes and Content-Type identical to the files, with anonymous CORS
    and immutable caching;
  - export metadata URLs;
  - the public read and the share page logo;
  - reload persistence;
  - replacement and removal, after which earlier URLs still return 200 and the
    export drops `background`;
  - a failed upload and a failed removal (transport abort) that keep the prior
    state and recover with **Try again**;
  - a non-image refused in the browser;
  - no horizontal overflow at 375px.
- Service tests (`packages/api/test/script-artwork.test.ts`) cover:
  - owner, viewer and both export projections, including schema validity;
  - published bytes and types equal to the originals;
  - private originals keyed by Script;
  - replacement retention and removal;
  - publish and source-write failures followed by a retry;
  - SVG, empty and oversized input;
  - non-owner upload, removal and read denied with nothing stored;
  - an upload superseding only the matching imported reference.
- Adapter tests (`artwork-adapters.test.ts`, real Miniflare D1 and R2) cover:
  - the conditional insert and switch: wrong owner, a double first upload and a
    stale original;
  - the conditional delete;
  - public and export projections;
  - `updated_at`;
  - imported-reference supersession;
  - the Worker serving a JPEG with `image/jpeg`;
  - 404s for unsupported extensions.

## Limits

- Images are published byte for byte, including any embedded metadata such as
  EXIF location in photos. Owners who care should strip metadata before
  uploading. Re-encoding would change "exactly as uploaded" and is not done.
- There is no dimension or aspect-ratio guidance. How the official app crops a
  logo or background was not verified.
- Not exercised: deployed R2 bindings, the official BOTC app loading the exported
  logo and background, and physical mobile devices.
