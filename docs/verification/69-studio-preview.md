# Studio preview verification

Issue: [#69](https://github.com/mgramigna/alchemist/issues/69). Decision: the
prototype on branch `prototype/69-studio-layouts` compared four layouts (a sticky
compact preview, a side-by-side split, a floating mini preview and tabbed controls);
the split won for larger screens, provided it stays usable on phones.

## Delivered behavior

- From the `md` breakpoint the Studio drawer widens to `max-w-4xl`. The preview
  column (large preview, variant previews and drag/resize help) sits beside the
  controls, and each column scrolls on its own.
- Below `md`, the preview pins above the controls with a smaller stage and variant
  previews. The drag/resize help stays as the preview's accessible description but
  is visually hidden.
- On short narrow screens (under 40rem tall, the new `tall` variant in
  `style.css`), the preview scrolls with the controls rather than crowding them out.

## Verification

- `e2e/studio.spec.ts`:
  - **Narrow screens:** at 375 × 812, scrolling to the last slider leaves the whole
    preview in view.
  - **Wide screens:** at 1280 × 720, changing the last slider updates the preview
    while it stays fully in view, to the left of the controls.
- Screenshots of both layouts were inspected.
