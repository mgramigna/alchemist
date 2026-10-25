# PROTOTYPE: script sheet layout (#14)

Throwaway. Answers "what should the rendered character sheet and night sheet look like?"
Three structurally different variants, each rendering both sheets, switchable via `?variant=A|B|C`.
PNG export uses html-to-image (in-browser DOM capture, one of the #5 paths).

```sh
cd prototypes/script-sheet-layout
bun install
node server.mjs        # http://localhost:4173/?variant=A  (← → or the bottom bar to switch)
node render.mjs        # 300dpi PNGs for every variant × script into out/chromium/
node contact.mjs       # out/chromium/contact.jpg
```

`render.mjs` flags: `--browser firefox|webkit`, `--icons cross` (icons from a second origin with CORS),
`--page a4`, `--native` (Playwright element screenshot for comparison), `--geo 1`, `--dsf 3.125`.

- A, Classic: parchment, Pirata One headings, each Team as a 2-column grid; night sheet is First Night | Other Nights.
- B, Alignment split: dark title band, Good left / Evil + Travellers + Jinxes right, Team colour rails; night sheet has Other Nights rotated 180°.
- C, Token poster: print-economy, centred token cells, player-count setup table; night sheet is two numbered tables.

Sample Characters are original. Fonts are OFL (licences in `fonts/`). Icons are generated placeholder sigils.

## Capture engine comparison (#17)

`?engine=html-to-image|modern-screenshot|snapdom` switches the capture library; `render.mjs --engine <name>` renders with it.
`diff-engines.mjs <variant>` pixel-diffs each engine against a native Chromium screenshot at 300dpi
(`render.mjs --native --dsf 3.125`, a stand-in for Cloudflare Browser Rendering); `compare-engines.mjs x,y,w,h <sheet> <name>` crops side by side.

- modern-screenshot 4.7.0: matches native (≤0.15% strong-diff pixels, none forming layout bands); works in Chromium, Firefox, WebKit. **Chosen.**
- html-to-image 1.11.13: text wraps narrower than the live layout while box sizes stay fixed, leaving stray gaps.
- SnapDOM 3.4.0: breaks the night-sheet step bands (step name overlaps its text).

The native reference screenshots include the prototype's floating switcher bar near the bottom; ignore that band in diffs.
