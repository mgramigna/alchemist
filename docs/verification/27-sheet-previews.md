# Character and night sheet preview verification

Issue: [#27](https://github.com/mgramigna/alchemist/issues/27).

## Delivered behavior

`CharacterSheet` and `NightSheet` render Variant B from
[#14](https://github.com/mgramigna/alchemist/issues/14) at the natural page size:
816×1056 CSS pixels for US Letter and 794×1123 for A4. The Workbench preview and the
public Script page use the same components and the same `SheetContent`. In the
Workbench that content is the live draft; on the public page it is the saved public
read. The PNG download in #28 is meant to capture these same components.

- Character sheet: a dark title band (Cinzel name, Sorts Mill Goudy italic Author
  Credit). Good Teams are on the left; Evil, then Travellers, then Jinxes are on the
  right. Each Team has a colour rail, and Travellers use a blue-to-red rail. The
  sheet uses regular or unaligned generic icons and has the
  non-affiliation footer. Small Scripts stay top-aligned.
- Night sheet: First Night upright and Other Nights rotated 180°, with the Script
  name on a dark spine. Rows follow both saved orders exactly, including standard-step
  bands (Minion and Demon Info in red), entries after Dawn, and a faded
  "No instructions written" on blank rows. It carries the footer too, because each
  PNG is downloaded on its own.
- Fit: sizes scale with `--fit`, which steps from 100% down to 80%. The preview
  reports when a sheet is shrunk, and shows an alert when it still overflows at 80%.
  It re-measures when fonts finish loading.
- Preview: tabs for Characters, First Night and Other Nights. The Other Nights tab
  turns the whole night sheet so that night reads upright. The preview has Letter/A4
  and Fit width/100% toggles; at 100% the page scrolls inside its pane.
  In the Workbench, rows are buttons: clicking or pressing Enter selects the
  Character, and the selected row is highlighted and scrolled into view. Opening a
  night switches the preview to it. Selecting a Character that isn't on the current
  night switches the preview to the Character sheet.
- Fonts are self-hosted from the OFL-licensed Fontsource packages
  (`@fontsource-variable/cinzel` was added); each package ships its `LICENSE`.
- The public Script representation now includes Night Orders and both Night
  Instructions fields, so anonymous viewers can see the night sheet. The D1 public
  read gets them in the same batch snapshot as the Script.

## Results

Verified on 2026-10-26:

- `bun run check`: passed (format, lint, types, 116 tests). New unit tests cover
  column grouping, night rows, and which sheet a selection turns to. The
  application-service and real-D1 tests check that the public read returns the saved
  orders and instructions.
- Full Playwright suite in Chromium against a locally running Worker
  (`bun alchemy dev --stage local` with `APP_ORIGIN=http://localhost:1337` and
  placeholder Google credentials) after `bun run build`: 45 passed. The new
  `e2e/sheets.spec.ts` covers:
  - Short Script: layout, fonts loaded, Letter and A4 sizes, top alignment.
  - Night orders: exact order, blank and after-Dawn rows, the rotated Other Nights
    half, and turning the whole sheet.
  - Dense Script (28 Characters, Travellers, Jinxes): fits without an alert.
  - Long-content Script: shrinks to 80% and shows the overflow alert.
  - 375px viewport: keyboard tab switching and 100% zoom without page overflow.

  The Workbench journey covers click and keyboard selection from the preview, plus
  the highlight.

- Fixed a flaky Workbench helper: `addCharacter` now looks for the menu item inside
  the menu it just opened, so it can't hit the previous menu while that one is
  still closing. The affected test passed 20 of 20 repeated runs.
- I inspected the dense Character, dense night and narrow-screen screenshots.

## External prerequisites and limits

- I only checked Chromium. Firefox, WebKit and real mobile devices are left for the
  capture work in #28 and the release checks in #37.
- Running the Worker locally needs `APP_ORIGIN` and Google client variables
  (see `.env.example`).
