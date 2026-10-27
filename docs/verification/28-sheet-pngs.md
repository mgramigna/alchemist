# Sheet PNG download verification

Issue: [#28](https://github.com/mgramigna/alchemist/issues/28). Decision:
[ADR 0003](../adr/0003-client-side-sheet-png-capture.md).

## Delivered behavior

- The sheet preview has a **Download PNG** menu: Character sheet, Night sheet or
  Both sheets. It is shared by the Workbench and the public Script page. The menu
  names the paper size and resolution, for example "US Letter · 300 DPI". The paper
  is the one chosen in the preview, which defaults to US Letter.
- Capture uses modern-screenshot 4.7.0, which is loaded only when a download starts.
  Each requested sheet is rendered as its own copy of `CharacterSheet` or
  `NightSheet` at natural page size, in a portal moved off the page and hidden from
  assistive tech. The scaled or rotated preview is never captured. The output is
  300 DPI with no setting: 2550×3300 for Letter and 2481×3509 for A4.
- Files are named `<script-name>-character.png` and `<script-name>-night.png`. The
  stem is `scriptFileStem` in the domain package, which the JSON export now shares.
- Progress shows as a live status: "Loading sheet fonts…", "Preparing…", then
  "Capturing… N%" and "Finishing…". After capture the status names each saved file.
- Fit: once fonts and icons are final, `fitSheet` measures the copy again, stepping
  from 100% down to the 80% floor. It never scales up. A sheet that still overflows
  is blocked with its own alert and no retry, because only editing the content fixes
  it. The other sheet still downloads.
- Fonts: capture loads the sheet faces that the text needs (Libre Franklin normal and
  italic, Cinzel, Sorts Mill Goudy italic). It gives up after 15 s. If any face fails,
  every requested sheet is blocked, with a **Try again** button. A stylesheet font
  face that has failed never loads again, so the retry re-adds the sheet faces from
  their `@font-face` rules.
- Icons: each sheet icon carries a Team-colored fallback token inlined as a data URL.
  An icon that fails to load in the preview or the offscreen copy switches to the
  token. During capture, an icon still loading after 15 s also switches. So does an
  icon that modern-screenshot can't embed (its `placeholderImage`). The status warns
  how many icons were replaced. Icons never block a download.
- Nothing calls the server. Anonymous viewers capture the saved public Script they
  are viewing. The owner captures the live draft shown in their preview, which
  matches the spec's "matching their live preview".

## Results

Verified on 2026-10-26:

- `bun run check`: passed (format, lint, types, unit tests). New unit tests cover the
  filename stem, PNG names, pixel sizes, fallback tokens and `unicode-range` coverage.
- Full Playwright suite against a local Worker (`bun alchemy dev --stage local` with
  `APP_ORIGIN=http://localhost:1337` and placeholder Google credentials) after
  `bun run build`: **70 passed**. `playwright.config.ts` now runs every spec in
  Chromium, and `e2e/sheet-download.spec.ts` also runs in Firefox and WebKit. The
  spec covers the following in all three engines:
  - Both sheets at Letter (2550×3300), named files, keyboard-operated menu; then the
    night sheet at A4 (2481×3509). The offscreen copies are removed afterwards.
  - Fonts and icons delayed 1.5 s, with the download started before they arrive.
    Capture waits for them. A PNG scaled to CSS size differs from a screenshot of the
    preview by a mean of 0.2–1.4 per channel (the threshold is 6).
  - Failed Demon icons: the preview and both PNGs use the fallback token. The status
    warns about 1 icon on the Character sheet and 2 on the night sheet, with no alert.
  - An icon that never answers falls back after the timeout. The download completes.
  - Aborted fonts block both sheets with no download. After the network recovers,
    **Try again** downloads both.
  - Fonts that never answer block with a retry after the timeout, without hanging.
  - The long-content Script blocks only the Character sheet; the night sheet downloads.
  - 375px viewport: download without horizontal overflow.

  `e2e/workbench.spec.ts` adds an owner check: the PNG uses the unsaved draft name and
  makes no export request. The sheet fixtures moved to `e2e/support/sheets.ts` so
  both sheet specs share them.

- I inspected the dense-Script Character and night PNGs from Chromium (about 0.9 and
  1.2 MB) and the narrow-screen screenshot.

## External prerequisites and limits

- Pixels are not identical across engines. That is expected, because the output
  follows the viewer's engine. In headless WebKit a dense sheet takes several seconds.
- Real iOS Safari and Android Chrome checks were not run. They remain release
  acceptance in [#37](https://github.com/mgramigna/alchemist/issues/37). At 8.4 MP,
  2550×3300 is below iOS Safari's canvas limit, but that is untested on devices.
- Sheets still show only generic icons. When uploaded artwork arrives
  ([#29](https://github.com/mgramigna/alchemist/issues/29)), the public R2 bucket
  needs the CORS `GET` rule from ADR 0003 so capture can embed it. Without that rule
  those icons fall back with a warning.
- Some browsers ask before allowing a page to save several files, which affects
  **Both sheets**. Each sheet can also be downloaded on its own.
