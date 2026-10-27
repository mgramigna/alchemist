# Character artwork upload and automatic styling verification

Issue: [#29](https://github.com/mgramigna/alchemist/issues/29). Decisions:
[#11 storage](https://github.com/mgramigna/alchemist/issues/11),
[#13 stylizer](https://github.com/mgramigna/alchemist/issues/13), and the approved
spec's local-cutout/procedural-texture scope in
[#18](https://github.com/mgramigna/alchemist/issues/18).

## Delivered behavior

- The Character form's **Icon** section accepts a PNG, JPEG, WebP or GIF up to
  10 MB. You can choose the file with a keyboard-operable button or drop it onto the
  section. The browser decodes it and cuts it out locally. It keeps the image's own
  transparency, removes light paper behind an ink drawing, or otherwise floods the
  backdrop in from the edges. It then renders the Team's 400×400 PNG variants:
  `[regular, flipped]`, or `[unaligned, good, evil]` for Travellers. Colors,
  procedural texture, outline and shadow are ported from the approved prototype
  (variant D). There is no keep-original-colors option.
- The **Look** picker (Auto, Solid, Shaded, Pale lines) is a native radio group
  with rendered thumbnails. Auto shows what it chose: Solid for transparent or ink
  art, Pale lines for photos. A note states which cutout was used. The Studio
  controls are #30.
- The server never trusts the browser's rendering. `Artwork.upload` checks
  ownership before writing anything. It sniffs the original's real image type
  (SVG and other types are refused) and requires the Team's exact variant set, in
  export order, as 400×400 PNGs read from the IHDR chunk. The original goes to the
  private `ArtworkSources` bucket under a new `<scriptId>/<id>` key. Every variant
  is published to the `PublishedArtwork` bucket under a fresh opaque
  `artwork/<ulid>.png` key, with an R2 precondition that refuses to overwrite.
  Only then does one D1 batch switch `character_artwork`. That switch is
  conditional on the previous original still being current, and it also drops any
  imported image reference awaiting repair.
- If source storage, publishing or the switch fails, the previous artwork stays
  current and the unused new original is deleted. Published images are never
  deleted. On success the replaced original is deleted (best effort, logged); this
  only ever applies to private originals. The UI keeps the prior icons and shows the
  failure with **Try again**, which reuses the chosen file.
- Style settings (`{ look }`) persist per Character. Artwork records the Team it
  was styled for. After a Team change, the editor fetches the private original
  (`Artwork.readSource`, owner-only) and re-renders it with the saved Look.
  `Artwork.restyle` publishes the new variants; it is refused with
  `ArtworkConflict` if the original was replaced meanwhile. Until the restyle
  lands, `characterIcons` shows generic icons and export reports an **Icon**
  blocker, so wrong-alignment variants are never shown or exported. Authored fields
  never pass through artwork mutations.
- **Use generic icons** (`Artwork.remove`) returns the Character to generic icons
  and deletes only the private original. Character deletion removes the artwork row
  in the same D1 batch and then the original. Script deletion does not exist yet
  (#35).
- Published variants are served by the Worker at `GET/HEAD /artwork/<ulid>.png`
  from the public bucket, with `Access-Control-Allow-Origin: *`,
  `Cache-Control: public, max-age=31536000, immutable`, an ETag (304 on match) and
  `nosniff`. Malformed paths and missing keys return 404 `no-store`; storage
  failures return 503. Variant paths are stored as root-relative paths, like the
  generic icons, and export resolves them against the app origin. The public
  bucket also carries a GET/HEAD `*` CORS rule, ready for the asset domain in #36.
- Owner reads include `artwork` (style, Team, variants and an opaque `sourceId`).
  Public reads include only `{ team, variants }`. Navigator, Night Order, Jinx and
  sheet icons all use `characterIcons`, so the preview and PNG capture show
  published artwork.

## Verification

- `bun run check`: formatting, lint, typecheck and all 148 tests pass. Lint
  reports only non-fatal warnings, including pre-existing spread warnings.
- `bun run build` passes.
- `bun run test:e2e` (managed local E2E stack, real local D1 and R2, local
  identity adapter): all 76 tests pass in Chromium, plus the Firefox capture checks.
  The four new `e2e/artwork.spec.ts` journeys cover:
  - uploads of transparent line art (PNG), ink on paper (JPEG) and a grainy photo
    (JPEG), with the expected cutout note and Auto choice for each;
  - the original read back byte for byte;
  - every published variant, including replaced ones, fetched anonymously with CORS
    and immutable headers and checked to be 400×400;
  - no source ID in the public read, and reload persistence;
  - each Team's variant set;
  - Look changes by keyboard;
  - a failed restyle and a failed upload (transport abort) that keep the prior
    icons and recover with Try again;
  - a Team change replaying the saved Look from the same original, with authored
    fields intact;
  - **Use generic icons**;
  - a 375px layout without horizontal overflow, and a non-image refused in the
    browser.
- Service tests (`packages/api/test/artwork.test.ts`) cover:
  - owner, viewer and export projections;
  - Traveller variants;
  - replacement retention;
  - a publish failure partway through, a source-write failure, then a retry;
  - validation of SVG, empty, wrong-set, wrong-size and non-PNG variants;
  - non-owner denial with nothing stored;
  - a stale Team blocking export, then restyle and conflict;
  - owner-only source reads, removal and Character deletion keeping published
    images;
  - an upload superseding an imported image reference.
- Adapter tests (`artwork-adapters.test.ts`) run real Miniflare D1 and R2:
  migrations, the conditional switch (wrong owner, double insert, stale expected
  original), owner and public projections, artwork removal with its Character, the
  R2 no-overwrite precondition, the public route's headers, 304, HEAD and 404s, and
  private originals unreachable through the public route.
- An HTTP RPC test confirms the bytes travel as base64 over the real NDJSON
  serialization. `stylize.test.ts` covers cutout detection, trimming, Auto
  resolution and each Team's variant order.
- Styled output was inspected visually from E2E screenshots. The ink chalice
  renders as a textured blue (regular) and red (flipped) silhouette with a cream
  outline. Minion's regular variant is Evil. The Traveller variants split
  blue/red, blue/gold and gold/red at the art's bounding-box center.

## Limits and unsatisfactory cases

- No real group uploads were available. The examples are the prototype's built-in
  samples, rendered to real PNG/JPEG files in the browser, plus added grain for the
  photo. They are representative, not proof of quality on arbitrary art.
- The photo sample cuts out correctly, but at token size it reads as a fairly dark,
  low-detail blob in every Look. Busy photo backgrounds that differ from the image
  border will not flood away cleanly. The approved remedies are Studio tuning (#30)
  or uploading a version with a transparent background. There is no manual eraser
  or hosted segmentation in v1.
- Lopsided art may look odd with the Traveller split at the bounding-box center.
  This is unchanged from the approved prototype and is to be assessed with real
  examples.
- Styling runs in the uploader's browser, so pixels may differ slightly between
  engines. Only Chromium exercised upload styling.

## Environment and external prerequisites

- Deployment creates two new R2 buckets, `ArtworkSources` (private) and
  `PublishedArtwork`. Nothing deletes published objects. However, removing the
  stack or bucket outside Alchemist would break old exports, so the stable bucket
  and public origin belong to #36. Exported URLs currently use the app origin. A
  dedicated asset domain, if chosen, must serve the same `artwork/<ulid>.png` keys.
- Not exercised: deployed R2 bindings, the official BOTC app loading published
  variants, physical mobile devices, and Firefox/WebKit upload styling.
