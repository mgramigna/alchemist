# Rendering Script sheets to PNG

Research for [issue #5](https://github.com/mgramigna/alchemist/issues/5), checked 2026-10-25. This records facts and trade-offs for the decision ticket; it does not select an implementation. No rendering prototype or deployment was performed.

## Bottom line

- DOM capture can reuse the React sheet layout without a rendering service, but export fidelity depends on browser SVG/canvas behavior and successful font/image embedding. Public R2 URLs still need CORS for browser resource reads. [html-to-image](https://github.com/bubkoo/html-to-image), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
- Satori + resvg provides a browserless SVG-to-PNG path in a browser or Worker. Its layout engine differs from Chromium; Worker feasibility depends on Wasm integration and measured CPU/memory at print resolution. [Satori](https://github.com/vercel/satori), [resvg](https://github.com/thx/resvg-js), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Cloudflare Browser Rendering, now documented as Browser Run, captures managed Chromium. Free: 10 browser minutes/day. Paid: 10 hours/month included, then $0.09/hour; sessions also have a concurrency charge above the included allowance. This buys a common browser engine, with service latency and limits. [Fonts/environment](https://developers.cloudflare.com/browser-run/features/custom-fonts/), [pricing](https://developers.cloudflare.com/browser-run/pricing/).
- Sorts Mill Goudy is both declared by the official tool and available under OFL 1.1. Pirata One/Cinzel and Libre Franklin/Oswald offer free stylistic alternatives for display and sans-serif text; they are not confirmed exact replacements for Dumbledor/Trade Gothic. [Official CSS](https://script.bloodontheclocktower.com/assets/index-B6MUkqMw.css), [Goudy license](https://github.com/google/fonts/blob/main/ofl/sortsmillgoudy/OFL.txt). Other licenses and fit assessments are below.

## Layout and fidelity target

The brief specifies a front with title/author and two columns of Characters under Townsfolk/Outsiders/Minions/Demons headings. The back has First Night on the left, Other Nights rotated 180° on the right, jinxes centrally, Dusk/Minion Info/Demon Info/Dawn markers, and a four-team setup table for 5–15+ players. Those are requirements from the brief, not features supplied by any renderer.

All options need an explicit page size, column allocation, spacing, icon bounds, and overflow policy. Inference: fixed page geometry is easier to compare against a reference than a responsive editor screenshot. Rotation alone does not rule out Satori: its documented CSS includes `rotate` and `transformOrigin`. [Satori CSS support](https://github.com/vercel/satori#css).

The official schema includes numeric `firstNight`/`otherNight` priorities (zero means no wake), reminders, jinx explanations, and image URL strings or arrays. It allows up to 201 Script entries, 250-character abilities and 500-character reminders/jinx reasons. Schema validity therefore does not establish that content fits two sheets. Sorting ties, special-marker insertion, jinx deduplication, Traveller placement, and long-content behavior remain application rules. [Official schema](https://github.com/ThePandemoniumInstitute/botc-release/blob/main/script-schema.json).

## Client-side DOM-to-image

These libraries clone/serialize a rendered DOM subtree into SVG containing HTML and rasterize through canvas. This allows reuse of browser-laid-out React markup, including the two-column front and rotated back. It is not a native browser screenshot: cloned styles, resource inlining, SVG image rendering, and canvas limits are additional failure points. [html-to-image internals](https://github.com/bubkoo/html-to-image#how-it-works), [modern-screenshot methods](https://github.com/qq15725/modern-screenshot#methods), [SnapDOM architecture](https://github.com/zumerlab/snapdom/blob/main/ARCHITECTURE.md).

### html-to-image

Exports PNG/Blob/canvas; `pixelRatio` defaults to device DPR, while `canvasWidth`/`canvasHeight` control raster sizing. It embeds web fonts and images, exposes reusable `fontEmbedCSS`, and can choose a preferred font format. Its README warns about tainted canvases and huge DOM/data-URI limits; failed image fetches can leave empty areas. Inference: it has a straightforward integration surface for occasional downloads, but missing-icon handling needs explicit validation. [Options and caveats](https://github.com/bubkoo/html-to-image#options).

### modern-screenshot

A fork of html-to-image with reusable contexts and optional web-worker assistance; the live DOM capture still belongs in a browser, not a Cloudflare Worker. Options include `scale` (default 1), explicit dimensions, `maximumCanvasSize`, font embedding controls, resource timeout, custom `fetchFn`, and image fallback. A context must be destroyed when finished. Inference: resource/context controls offer more tuning, with extra lifecycle work if enabled; they do not remove browser CORS rules. [README](https://github.com/qq15725/modern-screenshot), [typed options](https://github.com/qq15725/modern-screenshot/blob/main/src/options.ts).

### SnapDOM

Current v3 docs describe automatic embedding of fonts used by the subtree, image/background embedding, transforms, resource fallbacks/proxy hooks, and scale/DPR controls. `width`/`height` take precedence over `scale`; DPR still multiplies dimensions. The default engine uses SVG; the native HTML-in-canvas engine is experimental and requires a special build/browser support. Its tiled PNG export can avoid a full-image canvas allocation. These are upstream capabilities, not a verified Alchemist compatibility result. [Features](https://github.com/zumerlab/snapdom/blob/main/FEATURES.md), [v3 README/migration](https://github.com/zumerlab/snapdom).

### Shared cost, complexity, and font implications

Inference: these are the smallest architectural addition to the existing SPA because they can capture a dedicated export component already used for preview. They require no per-render hosted compute; users pay the CPU/memory cost on their devices. R2 icon requests/storage remain metered independently, with free direct egress. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

For repeatable typography, an implementation can self-host the font files, load each required face explicitly, await `document.fonts.ready`, and await image decoding before capture. Readiness alone does not prove that the intended face succeeded: inspect failed loads and missing glyphs. Embedding a fallback font faithfully still yields the wrong sheet. [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API), [image decoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).

## Satori + resvg, browser or Worker

Satori accepts static React-like elements and generates SVG; resvg rasterizes SVG to PNG. Current Satori docs support Flexbox/Grid/block layout and rotation, but expressly disclaim complete browser equivalence. Fonts are supplied as bytes: TTF/OTF/WOFF/WOFF2 are supported, variable fonts use the default instance, and text becomes SVG paths by default. This avoids downstream font discovery. Inference: a restricted export template can be shared across runtimes, but a browser preview may wrap text differently. [Satori documentation](https://github.com/vercel/satori).

The browser path uses Wasm and browser-fetchable assets, so CORS still applies. A Worker can fetch assets itself or read R2 through a binding and inline bytes; browser CORS is not that server-side read boundary. Explicit image dimensions/data are supported. Worker integration needs Satori's standalone initialization and deployed Wasm modules rather than blindly copying its CDN initialization example. [Satori images/runtime](https://github.com/vercel/satori#images), [Workers Wasm](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), [R2 Worker reads](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

Use `@resvg/resvg-wasm` for these runtimes, rather than assuming the native Node addon works in Workers. Its types expose `initWasm(WebAssembly.Module)`, `fitTo` width/height/zoom, PNG bytes, image resolution hooks, and explicit `free()` methods. Larger PNGs can be produced from the same vector geometry without changing layout. [resvg README](https://github.com/thx/resvg-js), [Wasm API](https://github.com/thx/resvg-js/blob/main/wasm/index.d.ts).

Worker cost is normal request/CPU usage, without browser-session fees. Workers Paid starts at $5/month, including 10 million requests and 30 million CPU milliseconds, then $0.30/million requests and $0.02/million CPU milliseconds. Free CPU is 10 ms/request; paid defaults to 30 seconds and is configurable up to 5 minutes. Both have 128 MB per isolate including Wasm, shared by concurrent requests. Inference: print-sized rendering needs measurement before declaring the free tier sufficient or concurrent rendering safe. [Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/).

Complexity assessment: more asset/Wasm lifecycle and layout-compatibility work than a DOM download; less external service orchestration than hosted Chromium. Browser Wasm moves that compute/bundle cost to the client. Worker Wasm centralizes execution, but keeps a resource-intensive job in the application's runtime. No measured latency, peak memory, or bundle-size result is available from this research.

## Cloudflare Browser Rendering / Browser Run

Cloudflare provides managed Chromium, Puppeteer/Playwright sessions and a screenshot Quick Action. Screenshots accept a URL or custom HTML, PNG output, a selector, viewport, and `deviceScaleFactor`. Inference: browser CSS layout, text shaping, transforms, and backgrounds make this the closest of these options to an ordinary Chromium preview; it does not automatically recreate the official design. [Screenshot API](https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/), [managed environment](https://developers.cloudflare.com/browser-run/features/custom-fonts/).

Custom fonts can be loaded with `@font-face` from URLs or embedded data. Inference: self-contained font data avoids an external font-fetch dependency. For the existing SPA, Chromium can navigate to an export view and wait for a dedicated readiness marker after data/fonts/images load; no SSR conversion is inherently needed. A session gives direct control over these waits and can capture both sheets before closing. The Quick Action is simpler but has its own timeout/readiness parameters. [Custom fonts](https://developers.cloudflare.com/browser-run/features/custom-fonts/), [screenshot readiness](https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/).

A native screenshot can include an ordinary cross-origin `<img>` without reading its pixels through page canvas. That differs from DOM-to-image embedding; browser-side `fetch`, cross-origin fonts, and any canvas manipulation still obey CORS. An image marked `crossorigin="anonymous"` also needs the matching server header. Inference: hosted Chromium reduces the need to fetch-and-inline every icon, but cannot guarantee availability of remote assets. [Browser image/CORS behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).

Pricing checked on the research date:

- Free: 10 browser minutes/day; session concurrency 3, new session rate 1 per 20 seconds; Quick Actions 1 request per 10 seconds.
- Paid: 10 browser hours/month included, then $0.09/hour. Sessions include 10 monthly-average concurrent browsers, then $2/additional average browser; that is a billing allowance, distinct from the 200 simultaneous-session platform limit. Quick Actions have no concurrency charge. Paid launch rate is 3/second; Quick Actions 30 requests/second.
- Sessions idle out after 60 seconds by default. Close them in `finally`: idle time can continue consuming allowance. Ordinary Workers subscription/usage is separate.

Sources: [Browser pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits and close behavior](https://developers.cloudflare.com/browser-run/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Illustrative arithmetic, not a benchmark: 100 front/back exports taking 5 seconds of total browser time per pair use 500 seconds (8.33 minutes). Staying inside monthly paid hours is plausible at group scale, but the free allowance resets daily and launch limits can affect consecutive downloads. Actual time includes startup, resource loading, rendering, and time before closure.

Complexity assessment: maintain an export view or HTML template plus a Worker-side browser call, readiness/error handling and service configuration. All clients receive output from one managed engine; Chromium updates still mean output is not guaranteed byte-identical forever. This introduces a network round trip and service availability dependency, with no measured latency here.

## R2 icons and export resolution

R2 public access and CORS are separate configuration. For client embedding/fetches, allow `GET` from production and development app origins, or `*` for credentialless public assets. Font URLs need the same consideration. Purge existing custom-domain cache entries after CORS changes; otherwise stale cached responses can omit the new headers. Using a same-origin Worker asset route is another possible boundary. A proxy hook in a capture library is not itself a deployed proxy. [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/).

Inference: fetching/decoding all resources before export and reporting failures avoids silently downloading a sheet with blank icons. Image arrays also require an explicit choice of alignment variant; public URL stability for BOTC JSON remains necessary regardless of the PNG path. [Schema image variants](https://github.com/ThePandemoniumInstitute/botc-release/blob/main/script-schema.json).

Resolution is a product choice, independent of renderer. Example calculations: A4 at 300 pixels/inch is approximately 2480 × 3508 pixels; US Letter is 2550 × 3300. An A4 raster needs about 33.2 MiB for one RGBA buffer alone (`width × height × 4`), before source icons, SVG, fonts, encoding, and Wasm copies. Two simultaneously rendered sheets multiply that pressure. These are arithmetic estimates, not measured peak memory.

Keep layout size separate from raster scale: use explicit DOM scale/DPR settings, resvg `fitTo`, or Chromium `deviceScaleFactor`. Increasing viewport width alone can change wrapping. Enlarging a raster icon adds no detail; icon sources must be adequate for their printed size. Canvas-backed exporters have device-dependent maximum dimensions; no universal safe high-resolution limit is confirmed here. [html-to-image sizing](https://github.com/bubkoo/html-to-image#options), [resvg sizing](https://github.com/thx/resvg-js/blob/main/wasm/index.d.ts), [Chromium sizing](https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/), [canvas limits](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas#maximum_canvas_size).

## Free fonts and licenses

The official site's deployed CSS declares Dumbledor, TradeGothicLT, TradeGothicLT-Cn, and SortsMillGoudy. It associates Script name/author selectors with SortsMillGoudy and uses Dumbledor as a heading variable. This identifies deployed web styling, not a verified inventory of every font in its exported PNG pipeline. Availability of a WOFF2 URL does not establish permission to redistribute that font. [Official deployed CSS inspected](https://script.bloodontheclocktower.com/assets/index-B6MUkqMw.css).

The following are candidates, not a selected palette. Similarity assessments are visual/design judgments, not font-metric equivalence:

- **Sorts Mill Goudy:** an actual family declared by the official site; a Goudy Oldstyle revival with regular/italic faces for title/author or serif text. [Google Fonts description](https://github.com/google/fonts/blob/main/ofl/sortsmillgoudy/DESCRIPTION.en_us.html), [OFL 1.1 license](https://github.com/google/fonts/blob/main/ofl/sortsmillgoudy/OFL.txt).
- **Pirata One:** gothic textura, condensed and screen-oriented; a decorative heading candidate in the fantasy/gothic direction of Dumbledor, with visibly different letterforms. [Description](https://github.com/google/fonts/blob/main/ofl/pirataone/DESCRIPTION.en_us.html), [OFL 1.1 license; reserved name Pirata](https://github.com/google/fonts/blob/main/ofl/pirataone/OFL.txt).
- **Cinzel:** Roman-inscription-inspired proportions; a less gothic, formal heading alternative. [Description](https://github.com/google/fonts/blob/main/ofl/cinzel/DESCRIPTION.en_us.html), [OFL 1.1 license](https://github.com/google/fonts/blob/main/ofl/cinzel/OFL.txt).
- **Libre Franklin:** interpretation of the 1912 Franklin design; a related American gothic direction for readable ability text and bold character names in place of Trade Gothic. [Description](https://github.com/google/fonts/blob/main/ofl/librefranklin/DESCRIPTION.en_us.html), [OFL 1.1 license](https://github.com/google/fonts/blob/main/ofl/librefranklin/OFL.txt).
- **Oswald:** reworking of Alternate Gothic; a condensed sans option for tight night rows and table labels in place of Trade Gothic Condensed. [Description](https://github.com/google/fonts/blob/main/ofl/oswald/DESCRIPTION.en_us.html), [OFL 1.1 license](https://github.com/google/fonts/blob/main/ofl/oswald/OFL.txt).

OFL permits use/embedding/redistribution subject to its conditions. Bundle each font's copyright and license with distributed font files; respect reserved names when modifying fonts. Documents created with the fonts do not have to adopt OFL. These font licenses do not license the official tool's artwork or other assets. [OFL text](https://github.com/google/fonts/blob/main/ofl/sortsmillgoudy/OFL.txt).

## Unconfirmed and decision inputs

- Exact official PNG dimensions, export font choices, and pixel fidelity were not verified by producing a reference export. The stylesheet evidence above is narrower than that claim.
- No actual front/back was rendered in Chrome, Firefox, Safari or mobile Safari. Library support claims are upstream documentation, not compatibility certification for these sheets. Large export limits and font/rotation behavior require real output comparison.
- No Worker deployment verified Wasm initialization through the eventual alchemy.run build, CPU, isolate memory, package size, or simultaneous exports. No Cloudflare browser billing/latency measurement was performed.
- No license for redistributing Dumbledor/Trade Gothic was confirmed. The free candidates have the explicit licenses linked above.
- The project still needs to choose page geometry, minimum legible text size/overflow behavior, reference fixture, font palette, supported browser range, and whether uniform server output justifies service execution. Renderer selection does not resolve those layout/content decisions.

Version scope: npm metadata inspected reported html-to-image 1.11.13, modern-screenshot 4.7.0, SnapDOM 3.4.0, Satori 0.63.2, and resvg-wasm 2.6.2. Satori's published 0.63.2 README was checked against the cited current docs for Grid, font formats, and standalone runtime guidance; older statements that Satori only supports Flexbox or excludes WOFF2 do not describe that release. Pin and recheck the selected release when implementing. [Satori published README](https://unpkg.com/satori@0.63.2/README.md), [npm registry metadata](https://registry.npmjs.org/satori/latest).
