# Capture sheet PNGs in the browser with modern-screenshot

Alchemist renders the character sheet and night sheet PNGs in the viewer's browser. It captures the same React sheet component the editor previews, using modern-screenshot, at a fixed 300 DPI page geometry (US Letter or A4) with self-hosted OFL fonts. There is no rendering service. Anyone with a share link can download sheets without signing in, the export matches the preview they are looking at, and the Worker carries no per-render cost or rate limit. The trade-off is that output follows the viewer's browser engine, so Safari or Firefox may break lines slightly differently from Chrome. Overflow is therefore measured in the viewer's browser at export time.

## Considered Options

- **Cloudflare Browser Rendering:** identical output for everyone, but paid, rate-limited, and needs a service call plus a readiness protocol for an SPA view.
- **Satori + resvg:** browserless, but a second layout engine, so exports would drift from the React preview.
- **html-to-image and SnapDOM:** the same client-side approach, but both diverged from a native Chromium render of the chosen layout. html-to-image wrapped text narrower than the frozen box sizes; SnapDOM broke the night sheet's step bands. modern-screenshot matched the native render.

## Consequences

- The public R2 bucket serving icons needs a CORS rule allowing `GET` from the app's origins, because capture reads icon pixels.
- A Character icon that fails to load is replaced on the sheet by its generic token with a warning. A sheet font that fails to load blocks export with a retry, since a fallback font silently changes layout.

Context: [Choose the PNG sheet renderer](https://github.com/mgramigna/alchemist/issues/17), [How should script sheets be rendered to PNG?](https://github.com/mgramigna/alchemist/issues/5), [Prototype the script sheet layout](https://github.com/mgramigna/alchemist/issues/14).
