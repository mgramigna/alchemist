# Character icon stylizing

Research for [issue #2](https://github.com/mgramigna/alchemist/issues/2), checked 2026-10-25. This records capabilities and trade-offs; it does not select Alchemist's implementation.

## Bottom line

- Bloodstar's original source survives on Bitbucket. Its browser Canvas pipeline trims transparent margins, replaces RGB with a team gradient while retaining alpha, places the silhouette on a 540×540 transparent canvas, multiplies in grunge texture, adds a white alpha-edge border, then a black blurred shadow. It does **not** remove backgrounds or generate alignment variants. [Original rendering code][blood-character], [pixel operations][blood-image], [publishing code][blood-publish].
- Official icons use textured blue/cyan for Good and red/orange for Evil, pale contour/detail lines and a dark shadow on transparency. The sampled official app assets are 400×400 RGBA WebP; Bloodstar's 540×540 PNG is its own convention, not a dimension mandated by the JSON schema. [Official assets][resources], [schema][schema], [Bloodstar constants][blood-image].
- Export ordering is explicit: non-Travellers `[regular, flipped]`; Travellers `[unaligned, good, evil]`. Unaligned Traveller art is blue on the left and red on the right; sampled Good versions keep blue on the left and tan/gold on the right, while Evil versions use tan/gold on the left and red on the right. “Flipped” means changed alignment, not mirrored artwork. [Schema][schema], [official Traveller][beggar], [Good][beggar-good], [Evil][beggar-evil].
- Ordinary styling needs no ML or image framework: browser Canvas can express it. Automatic cutout is separate: IMG.LY has browser models around 40/80 MB plus runtime downloads and AGPL licensing; Transformers.js has separately licensed model choices. Cloudflare Images also documents hosted BiRefNet foreground removal, without shipping model weights to the SPA. [Canvas standard][canvas], [IMG.LY][imgly], [Transformers.js][transformers], [Cloudflare segmentation][cf-features].
- Arbitrary photos will not automatically become hand-drawn BOTC artwork. Mask quality, preserved interior detail, palette/texture tuning, and source-image suitability remain visual acceptance questions. No candidate was benchmarked on Alchemist uploads, and no official icon-authoring recipe or universal palette hex values were confirmed. This is an inference from the silhouette-based Bloodstar algorithm and inspected official assets. [Rendering code][blood-character], [official examples][resources].

## What Bloodstar actually did

### Source, live UI, and archive evidence

The original repository is [excitemike/bloodstarclocktica on Bitbucket](https://bitbucket.org/excitemike/bloodstarclocktica/), with application files under `bloodstar.xyz/`. I cloned its master commit `09a6e31316884d06e0a51b780a186784ba4f6f42`. A maintained [GitHub fork](https://github.com/Tsubashi/bloodstar-clocktica/tree/bb9589dcaa4a592c993c1a8ecd081e753700617e) points back to that origin. The fork's `src/model/character.ts` and `src/blood-image.ts` are byte-identical to the original files at those commits; it is useful as a more accessible source mirror. [Original renderer][blood-character], [fork renderer](https://github.com/Tsubashi/bloodstar-clocktica/blob/bb9589dcaa4a592c993c1a8ecd081e753700617e/src/model/character.ts).

`bloodstar.xyz` failed DNS resolution during this research. The [maintained live UI](https://bloodstar.clocktica.com/) was readable through the web fetch tool: it exposes restyle, placement, size, crop, colorize, Outsider/Minion colors, texture, border intensity, and shadow size/offset/opacity controls. Interactive browser inspection was unavailable: T3 preview reported that the host's AppArmor configuration blocks its browser sandbox. A direct HTTP fetch received 403, so no successful live upload test is claimed. [Live UI](https://bloodstar.clocktica.com/).

The Wayback [CDX index](https://web.archive.org/cdx/search/cdx?url=bloodstar.xyz%2F&output=json&filter=statuscode%3A200&filter=mimetype%3Atext%2Fhtml&collapse=timestamp%3A4) returned homepage captures for 2021–2026. I retrieved the [2026-01-04 archived HTML](https://web.archive.org/web/20260104193317id_/https://www.bloodstar.xyz/): it links the Bitbucket repository and contains the same style controls. This confirms the old UI, but not that archived JavaScript remains fully runnable.

### Ordered pipeline and defaults

The following is a source inspection, not a reconstruction from screenshots:

1. **Decode and trim:** load the source into Canvas, initially limiting it to 540×540 without upscaling. Optional crop finds the bounding box of pixels with alpha greater than zero. This removes transparent padding, not an opaque white background. [Loading, bounding box, and trim][blood-image].
2. **Recolor:** set every pixel's RGB to white, leave alpha unchanged, then multiply by a resized team gradient. Original luminance and RGB detail are discarded when colorization is enabled. Transparent holes and semi-transparent strokes survive. Turning colorization off preserves the uploaded colors. [Renderer][blood-character], [setRGB/multiply][blood-image].
3. **Fit and position:** preserve aspect ratio inside a default 300×300 region on a new transparent 540×540 canvas. Placement factors default to `270/540` horizontally and `184/540` vertically; the renderer multiplies these by the remaining space, so the constant named “center Y” is not literally the resulting center. Size and placement are adjustable. [Settings][blood-settings], [placement calculation][blood-character].
4. **Texture:** multiply the RGB channels by a fixed grunge PNG after placement. This darkens/modulates color within the existing alpha silhouette; it does not synthesize new brushwork or remove pixels from a photographed background. [Renderer][blood-character], [texture asset](https://github.com/Tsubashi/bloodstar-clocktica/blob/bb9589dcaa4a592c993c1a8ecd081e753700617e/dist/img/texture.png), [multiply implementation][blood-image].
5. **Outline:** inspect alpha transitions across a 3×3 neighborhood using a threshold of 127, paint detected edges white, and blur their alpha according to border intensity (default 1). This is a pale contour of alpha boundaries, not a black stroke or RGB-detail detector. [addBorder/edgeDetect][blood-image], [defaults][blood-settings].
6. **Shadow and encode:** copy the silhouette in black, downscale to one quarter, Gaussian blur, upscale, offset, and composite the icon over it. Defaults: blur size 16, X offset 0, Y offset 10, opacity 0.5. Encode as PNG. Restyle, crop, colorize, alternate team colors, texture, border, and shadow are enabled by default; disabling restyle returns the original image. [Pixel operations][blood-image], [defaults][blood-settings], [renderer][blood-character].

Bloodstar's gradient lookup gives Townsfolk blue, Outsiders cyan/teal, Minions orange, Demons red, and Travellers a blue-left/red-right split. Disabling “Outsider/Minion Colors” uses the Townsfolk gradient for Outsiders and Demon gradient for Minions. These are Bloodstar choices, not an official palette specification. [Gradient selection][blood-image], [gradient asset paths](https://github.com/Tsubashi/bloodstar-clocktica/blob/bb9589dcaa4a592c993c1a8ecd081e753700617e/src/images.ts).

The character model has one `styledImage`, and publishing writes one `{id}.png` URL into `image`. There is no second/third output or alignment parameter in this path. Consequently, automatic background removal and flipped-alignment variants would be additional capabilities beyond the recovered Bloodstar pipeline. [Character model][blood-character], [publisher][blood-publish].

I found no application-wide license file in either recovered repository; the visible `dist/parsedown/LICENSE.txt` covers that dependency. Permission to copy Bloodstar code or its texture/gradient assets therefore remains unconfirmed. The algorithm can be studied independently of copying those files. [Original repository](https://bitbucket.org/excitemike/bloodstarclocktica/), [fork tree](https://github.com/Tsubashi/bloodstar-clocktica/tree/bb9589dcaa4a592c993c1a8ecd081e753700617e).

## Official visual traits and variants

TPI's [toolmaker resources][resources] publish role data and icons with deterministic paths: `{edition}/{id}_g.webp`, `_e.webp`, and `{edition}/{id}.webp` for unaligned art. The repository states that use is subject to its linked Community Created Content Policy; availability is not a blanket software/asset license. [TPI repository README](https://github.com/ThePandemoniumInstitute/botc-release#toolmaker-resources).

I downloaded and decoded twelve official assets: Washerwoman Good/Evil, Imp Evil/Good, Drunk Good, Poisoner Evil, and Beggar and Bureaucrat unaligned/Good/Evil. All twelve were **400×400 RGBA WebP**, with transparent padding; they contain the icon rather than a complete circular token or character name. The alpha bounding boxes of each sampled alignment pair/triple matched. This is a measured sample, not a guarantee about every official asset. [Washerwoman Good][washer-good], [Evil][washer-evil], [Imp Evil][imp-evil], [Good][imp-good], [Drunk](https://release.botc.app/resources/characters/tb/drunk_g.webp), [Poisoner](https://release.botc.app/resources/characters/tb/poisoner_e.webp), [Beggar variants][beggar], [Bureaucrat Good](https://release.botc.app/resources/characters/tb/bureaucrat_g.webp), [Bureaucrat Evil](https://release.botc.app/resources/characters/tb/bureaucrat_e.webp).

Visual observations from those first-party images: the drawing is a recognizable silhouette with internal negative space and pale line detail; saturated color has irregular light/dark mottling resembling ink or watercolor; pale cream/white edging separates it from a dark soft shadow. Good is blue/cyan and Evil red/orange. A texture overlay can approximate mottling, but recoloring an opaque photograph loses interior structure, whereas a prepared transparent line drawing already contains useful holes and strokes. The latter quality assessment is an inference, not a published TPI authoring rule. [Washerwoman][washer-good], [Imp][imp-evil], [Beggar][beggar].

For the five Teams in scope:

- **Townsfolk and Outsiders:** regular Good blue/cyan; flipped Evil red/orange. The drawing remains recognizable and in the same orientation. [Washerwoman pair][washer-good], [Evil counterpart][washer-evil].
- **Minions and Demons:** regular Evil red/orange; flipped Good blue/cyan. This reverses the URL order relative to Good Teams. [Imp pair][imp-evil], [Good counterpart][imp-good], [schema examples][schema].
- **Travellers:** unaligned blue-left/red-right split. In both inspected Traveller triples, Good keeps the blue left half and replaces the red right half with tan/gold; Evil replaces the blue left half with tan/gold and keeps the red right half. These are not fully blue/red recolors. Unaligned does not mean gray or a third gameplay alignment. The schema specifies variant order, not how to paint them; reproducing this official appearance requires split-color masks/palettes for all three variants. [Beggar][beggar], [Good][beggar-good], [Evil][beggar-evil].

The schema accepts a single URI or an array of one to three URIs. Its description gives the semantic order `[regular, flipped]` or `[unaligned, good, evil]`, but the schema does not enforce lengths conditional on Team. It also imposes no image dimensions, palette, texture, outline, or raster format. Schema validity alone therefore does not establish correct variant ordering or visual compatibility. Exact palette stops, outline widths, padding, and a mandatory watercolor procedure were **not confirmed**. [Official schema][schema].

## Tools for each step

Sizes below were checked against package registries and downloaded package artifacts on the research date. MB means decimal megabytes; gzip figures were measured locally with Python gzip. A complete npm tarball or unpacked size is **not** an application's tree-shaken bundle size. Model/runtime assets are separate from the JavaScript wrapper. No project build, visual-quality benchmark, or Worker deployment was performed.

### Browser Canvas / OffscreenCanvas: conventional styling

Canvas provides decoding/drawing, gradients, pixel reads/writes, compositing, shadows, and PNG serialization; OffscreenCanvas makes the rendering API available in a **browser Web Worker**. A concrete implementation can use alpha bounds for crop, `source-in` to fill the mask with a gradient, `multiply` for texture followed by alpha clipping, alpha dilation/edge detection for a pale outline, and a blurred/offset alpha copy for shadow. Re-rendering from the same mask with another palette produces variants without geometric mirroring. These are implementation possibilities derived from the standard and Bloodstar source. [WHATWG Canvas standard][canvas], [Bloodstar implementation][blood-image].

Added third-party runtime: **zero bytes**, plus application code and texture assets; no third-party library license is introduced. Canvas does not provide automatic subject segmentation. An eraser/mask brush or color-key threshold is possible with pixel operations, but simple color-key removal also removes matching foreground colors and struggles with antialiasing; it is not a general photo cutout solution. Cross-origin images require origin-clean/CORS handling before pixel reads or export. Browser Web Workers and Cloudflare Workers are different runtimes. [Canvas pixel manipulation, security, and OffscreenCanvas][canvas].

### PixiJS / WebGL: GPU previews and filters

PixiJS supports sprites, masks, blend modes, custom GPU filters, and rendering extraction. The maintained filters collection includes outline and drop-shadow filters. This covers placement, tint/masking, texture blending, contour/shadow effects, and preview/export plumbing; team gradients and exact Bloodstar-style edge behavior still need composition or a custom shader. Filters operate on supplied pixels; they do not infer a foreground mask. GPU rendering can suit repeated previews, but visual equivalence depends on filter settings and alpha handling and was not tested. [Pixi filters guide](https://pixijs.com/8.x/guides/components/filters), [filter collection](https://github.com/pixijs/filters), [extraction API](https://pixijs.download/release/docs/rendering.ExtractSystem.html).

PixiJS **8.22.0**, MIT: published `dist/pixi.min.js` is **840,663 bytes**, **236,766 gzip** before extra filter packages; a selective app bundle will differ. It is a browser GPU option, not a directly usable Cloudflare Worker renderer. [Versioned npm metadata](https://registry.npmjs.org/pixi.js/8.22.0), [published bundle](https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.js).

### Photon: Wasm pixel processing

Photon provides crop/resize, channel/color transforms, convolution/blur, and blend modes including multiply. These cover conventional image operations; alpha-mask outline generation and variant orchestration still need application logic. Its `replace_background` API replaces a supplied key color, not arbitrary semantic subject segmentation. [Photon API](https://docs.rs/photon-rs/0.3.3/photon_rs/), [blend/background source](https://github.com/silvia-odwyer/photon/blob/master/crate/src/multiple.rs).

`@silvia-odwyer/photon` **0.3.3**, Apache-2.0: Wasm **1,880,773 bytes** (**667,864 gzip**), JS glue **139,647 bytes** (**18,343 gzip**). Browser Canvas helpers exist, but Worker use would need byte-oriented APIs and Wasm initialization without DOM helpers. Cloudflare supports Wasm modules; compatibility and memory/CPU cost of this package were not verified. Quality is deterministic filtering, not learned brushwork. [Versioned package metadata](https://registry.npmjs.org/@silvia-odwyer%2fphoton/0.3.3), [Photon repository](https://github.com/silvia-odwyer/photon), [Cloudflare Wasm](https://developers.cloudflare.com/workers/runtime-apis/webassembly/).

### IMG.LY background removal: browser cutout

`@imgly/background-removal` **1.7.0** returns a foreground image/alpha mask using IS-Net through ONNX Runtime Web, with Wasm CPU and optional WebGPU paths. Upstream describes a roughly **40 MB small quantized model** (sometimes showing artifacts) and **80 MB medium/default model**. These are upstream estimates, not a successful model download here. The package entry JS is **171,349 bytes / 31,693 gzip**; the npm package is about **1.11 MB unpacked**, excluding model and peer runtime downloads. Version 1.7.0 declares `onnxruntime-web` **1.21.0** as its peer dependency; the README's install command names a dev build, so the exact runtime combination needs verification. [README][imgly], [versioned metadata](https://registry.npmjs.org/@imgly%2fbackground-removal/1.7.0).

The library is **AGPL-3.0**, with other licensing available from IMG.LY. Assets download on first use and can be self-hosted/cached; multithreading guidance requires cross-origin isolation headers for SharedArrayBuffer. That header choice must be considered alongside the existing OAuth popup/redirect flow. The library predicts masks rather than stylizing artwork; performance and fine-edge quality on uploaded symbols/photos remain unmeasured. Its browser image APIs make it unsuitable as a drop-in Cloudflare Worker package. [License](https://github.com/imgly/background-removal-js/blob/main/LICENSE.md), [hosting/performance guidance][imgly], [published implementation](https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/index.mjs).

### Transformers.js / ONNX Runtime: alternative browser models

Transformers.js runs supported ONNX models in-browser using Wasm CPU or WebGPU. The runtime is Apache-2.0; ONNX Runtime is MIT, but **model weights have their own license**. For example, BRIA's RMBG-1.4 is source-available for non-commercial use, with commercial licensing separately offered. The model card includes Transformers.js usage. [Transformers.js][transformers], [runtime metadata](https://registry.npmjs.org/@huggingface%2ftransformers/4.3.1), [ONNX Runtime metadata](https://registry.npmjs.org/onnxruntime-web/1.30.0), [BRIA model card](https://huggingface.co/briaai/RMBG-1.4).

RMBG-1.4's published ONNX files are **176.15 MB FP32**, **88.22 MB FP16**, or **44.40 MB quantized**, before runtime assets. Transformers.js **4.3.1** is **9.96 MB unpacked** as a whole npm package, not a browser bundle measurement; importing the browser build does not imply shipping its Node dependencies. A smaller example, MODNet, has **6.63 MB quantized** weights and an Apache-2.0 model card, but is specifically for **portrait matting**, so its advertised task does not establish suitability for arbitrary objects/icons. [BRIA file sizes](https://huggingface.co/api/models/briaai/RMBG-1.4/tree/main/onnx), [MODNet files](https://huggingface.co/api/models/Xenova/modnet/tree/main/onnx), [MODNet task/card](https://huggingface.co/Xenova/modnet), [versioned package metadata](https://registry.npmjs.org/@huggingface%2ftransformers/4.3.1).

This route offers model/dtype choice, with more preprocessing, output-mask handling, download management, and license selection to own. Neither browser package availability nor small model-file size proves it will run inside a Cloudflare Worker; no such deployment or comparison against IMG.LY was tested. [Transformers.js supported environments][transformers], [Cloudflare runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/web-standards/).

### Cloudflare Worker options

The **Images binding** accepts image byte streams, chains resize/blur and drawing operations, and emits encoded images. Its overlay API supports Porter-Duff `in`/`atop`, useful for applying a supplied colored/texture image to an existing mask. It does not document multiply blending or arbitrary alpha convolution; the rectangular `border` option is not a silhouette outline. Thus it covers parts of styling but is not documented as an exact Bloodstar renderer. [Binding](https://developers.cloudflare.com/images/optimization/binding/), [overlay modes](https://developers.cloudflare.com/images/optimization/draw-overlays/), [transformation parameters][cf-features].

Cloudflare now documents **`segment: "foreground"`**, using BiRefNet through Workers AI, to replace backgrounds with transparency. It bills this as an ordinary Images transformation, without separate Neuron billing. This is hosted inference, with **no model download in the SPA**; it is not inference inside the application's ordinary Worker isolate. BiRefNet's upstream repository is MIT, while the hosted service is governed by Cloudflare's service terms. Exact deployed checkpoint, quality on homebrew symbols, and end-to-end latency were not confirmed. [Segmentation documentation][cf-features], [BiRefNet upstream/license](https://github.com/ZhengPeng7/BiRefNet).

Cloudflare lists 5,000 unique transformations/month on Images Free, then paid transformations at $0.50/1,000 beyond the included allowance. Binding responses are not automatically cached. A production design must account for transformation reuse or persisted output rather than assume free regeneration on every view. [Pricing](https://developers.cloudflare.com/images/pricing/), [binding caching](https://developers.cloudflare.com/images/optimization/binding/).

Ordinary Worker-side pixel processing remains possible with JS/Wasm plus decoders/encoders, but browser Canvas/WebGL APIs cannot simply be assumed available there. Workers document **128 MB memory per isolate**, including Wasm, and **10 ms CPU on Free**; Paid defaults to 30 seconds and can be raised to five minutes. Large browser segmentation models therefore cannot be assumed practical just because Wasm is supported. This is a resource/portability constraint, not a benchmark proving impossibility. [Worker APIs](https://developers.cloudflare.com/workers/runtime-apis/web-standards/), [Wasm support](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), [current limits](https://developers.cloudflare.com/workers/platform/limits/).

## Remaining facts to establish before implementation choices

- Which input quality is acceptable: prepared transparent symbols, photographs, or both; whether automatic cutout needs manual correction; and whether to preserve uploaded luminance/interior detail instead of Bloodstar's full RGB replacement. These are product/visual choices exposed by the recovered algorithm, not facts a package can decide. [Bloodstar renderer][blood-character].
- Palette stops, outline/shadow scale, icon occupancy, and texture asset provenance. Official samples establish a visual reference, not a numerical authoring standard. [Official resources][resources].
- Comparative cutout quality and latency on representative group uploads, including thin lines, disconnected objects, light foregrounds, and already-transparent inputs. No quality or speed ranking is established by this research.
- A real official-app check of the generated two/three-URL exports and selected padding/canvas dimensions. The schema documents ordering but cannot verify visual placement or runtime fetching behavior. [Schema][schema].

[blood-character]: https://bitbucket.org/excitemike/bloodstarclocktica/src/09a6e31316884d06e0a51b780a186784ba4f6f42/bloodstar.xyz/src/model/character.ts
[blood-image]: https://bitbucket.org/excitemike/bloodstarclocktica/src/09a6e31316884d06e0a51b780a186784ba4f6f42/bloodstar.xyz/src/blood-image.ts
[blood-settings]: https://bitbucket.org/excitemike/bloodstarclocktica/src/09a6e31316884d06e0a51b780a186784ba4f6f42/bloodstar.xyz/src/model/character-image-settings.ts
[blood-publish]: https://bitbucket.org/excitemike/bloodstarclocktica/src/09a6e31316884d06e0a51b780a186784ba4f6f42/bloodstar.xyz/dist/api/publish.php
[schema]: https://github.com/ThePandemoniumInstitute/botc-release/blob/main/script-schema.json
[resources]: https://release.botc.app/resources/
[washer-good]: https://release.botc.app/resources/characters/tb/washerwoman_g.webp
[washer-evil]: https://release.botc.app/resources/characters/tb/washerwoman_e.webp
[imp-evil]: https://release.botc.app/resources/characters/tb/imp_e.webp
[imp-good]: https://release.botc.app/resources/characters/tb/imp_g.webp
[beggar]: https://release.botc.app/resources/characters/tb/beggar.webp
[beggar-good]: https://release.botc.app/resources/characters/tb/beggar_g.webp
[beggar-evil]: https://release.botc.app/resources/characters/tb/beggar_e.webp
[canvas]: https://html.spec.whatwg.org/multipage/canvas.html
[imgly]: https://github.com/imgly/background-removal-js/blob/main/packages/web/README.md
[transformers]: https://huggingface.co/docs/transformers.js/index
[cf-features]: https://developers.cloudflare.com/images/optimization/features/#segment
