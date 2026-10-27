# Artwork Studio verification

Issue: [#30](https://github.com/mgramigna/alchemist/issues/30). Decisions:
[#13 stylizer](https://github.com/mgramigna/alchemist/issues/13) (variant D: Studio
drawer beside the live result), [#11 storage](https://github.com/mgramigna/alchemist/issues/11),
and default 6 of the approved spec in [#18](https://github.com/mgramigna/alchemist/issues/18)
(local cutout, transparent-upload fallback, no eraser or hosted segmentation).

## Delivered behavior

- **Customize in Studio** opens a drawer from the Character's **Icon** section. It
  loads the retained private original and shows a live, unpublished preview of every
  variant for the current Team. The large preview of the first variant can be:
  - dragged to move the art;
  - scrolled on to resize it;
  - focused and moved with the arrow keys (Shift for bigger steps), or resized
    with + and −.
- The preview stays in view while the controls scroll; see
  [#69](69-studio-preview.md).
- Controls follow the prototype's Studio:
  - **Cutout**: Auto-detect, Use transparency as-is, Remove backdrop from the edges,
    Remove light paper; plus a tolerance slider. An after-cutout preview names the
    mode used.
  - **Color**: Solid fill or Shaded, and pale interior lines. These override the
    Look; choosing a Look again clears the override.
  - **Team shades**: Outsider cyan / Minion orange for those Teams' regular variants.
  - **Finish**: texture, pale outline, shadow opacity, blur and offset.
  - **Size and position**: sliders that mirror the direct manipulation.

  Choices are native radio groups and sliders, so they all work from the keyboard.

- Nothing is published while adjusting. **Save** renders the Team's variants from
  the original and calls the existing `Artwork.restyle` mutation. The current
  variants switch only after every new image is published under fresh immutable
  URLs. Earlier URLs are never overwritten or deleted. A failed save keeps the
  drawer open with the draft, leaves the current icons in place, and offers
  **Try again**. **Cancel** discards the draft.
- `ArtworkStyle` keeps `look` and adds an optional, range-checked key per Studio
  setting. A key is absent while it matches automatic styling, so existing
  `{ look }` rows decode unchanged and no migration is needed. The ranges are
  enforced by the RPC schema, so out-of-range or unknown values (such as a
  `cutout: "eraser"`) are refused before reaching the service. Viewers still
  receive only `{ team, variants }`.
- When any setting differs from automatic, the Icon section shows
  **Customized: …** (for example "Team shades, outline, size, position") and
  **Reset to auto**, which republishes with `{ look: "auto" }`. The drawer shows the
  same summary for the draft, and its Reset to auto resets only the draft. A Studio
  color shows as a checked **Custom (Studio)** tile in the Look picker.
- Team changes replay the full saved style from the original, using the existing
  stale-artwork flow from #29. Reopening the Studio or reloading the page restores
  the saved settings.
- **Transparent replacement:** if no cutout works, **Upload transparent artwork**
  in the drawer uploads a new original. It keeps the draft's finish settings but
  detects the cutout afresh. Images without transparency are refused with an
  explanation and a retry that reopens the Studio. There is no manual eraser or
  hosted segmentation in this slice.
- The Traveller split stays at the center of the art's bounding box, as approved.
  Moving or resizing the art moves the split with it.

## Verification

- `bun run check`: formatting, lint (warnings only, matching existing
  spread/schema warnings), typecheck and all tests pass.
- `bun run test:e2e`: the full suite passes in Chromium, plus the Firefox capture
  checks. The new `e2e/studio.spec.ts` uses the representative line-art, ink and
  photo samples, rendered to real PNG/JPEG files. It measures published variants
  by decoding the served PNGs, without calling the stylizer:
  - **Keyboard and pointer:** sliders, the Team shades switch, arrow-key movement,
    dragging and scroll-resizing. The draft is shown but not published until saved.
    After saving, the published Outsider icon is narrower (size 60%, no outline),
    shifted right by the offset, and measurably cyan rather than Good blue.
  - **Persistence:** reload restores the settings in the Studio. A Team change to
    Minion republishes Minion orange with the same style. Reset to auto returns the
    automatic width. Every URL published along the way still serves.
  - **Cutout tuning:** on the photo, switching cutouts updates the after-cutout
    preview, and Cancel saves nothing. A failed save (transport abort) keeps the
    icons and recovers with Try again. A Look choice replaces the Studio color and
    keeps the cutout. A non-transparent replacement is refused; a transparent one
    becomes the new original and keeps the size setting.
  - **Narrow screens:** at 375 px the drawer fills the width with no horizontal
    overflow. All three Traveller previews show, and the save works by keyboard.
  - Repeated four times with parallel workers without failures.
- Service test (`artwork.test.ts`): a full Studio style persists and is returned
  to owners, hidden from viewers, kept across a Team change and replay, and reset
  to `{ look: "auto" }`. Each restyle gets distinct URLs, and all of them stay
  published.
- Adapter test: Studio settings round-trip through real Miniflare D1.
- HTTP RPC test: out-of-range numbers and unknown cutout and color values are
  refused over the real NDJSON serialization; a valid style round-trips.
- Unit tests (`studio.test.ts`): settings equal to automatic are dropped (including
  color that matches the Look), the Customized summary, and Team-shade palettes.
- Screenshots of the draft drawer, the customized Icon section and the 375 px
  drawer were inspected.

## Limits and follow-ups

- Real group uploads were still unavailable. The samples are representative, not
  proof of cutout quality on arbitrary art. Busy photo backdrops that differ from
  the image border remain the case for the transparent-upload fallback.
- Styling runs in the owner's browser. Only Chromium exercised the Studio, and
  physical mobile devices were not tested. Touch dragging uses pointer events with
  `touch-action: none`, but this is unverified on real devices.
- `components/sheets.css` styled `[data-slot="sheet-footer"]` and
  `[data-slot="sheet-title"]` for the printable sheet. Those selectors also matched
  the UI kit's drawer `SheetFooter` and `SheetTitle`, centering drawer titles
  (including Import's) and stripping footer padding. Both rules are now scoped under
  the printable sheet's `[data-slot="sheet"]` root.
- No external prerequisites beyond those recorded for #29.
