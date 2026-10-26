import {
  ICON_SIZE,
  type ArtworkLook,
  type AuthoredTeam,
  type IconVariant,
} from "@alchemist/domain";

/*
 * The approved v1 stylizer (#13): a local cutout, then alignment-coloured
 * 400×400 variants with procedural texture, a pale outline and a shadow.
 * No hosted segmentation; the automatic cutout can fail on hard images.
 */

const N = ICON_SIZE * ICON_SIZE;
const CREAM = [243, 233, 207] as const;

// Light → mid → dark, painted top → bottom across the art's bounding box.
const PALETTES = {
  good: ["#bfe6ff", "#3f8fe6", "#0f357a"],
  evil: ["#ffc39a", "#e24a2c", "#6e0d0d"],
  gold: ["#fbecc0", "#cf9f45", "#6a4612"],
} as const;

type Palette = keyof typeof PALETTES;

/** How the backdrop was removed. */
export type CutoutMode = "alpha" | "light" | "edge";

export const CUTOUT_LABELS: Record<CutoutMode, string> = {
  alpha: "kept the image’s own transparency",
  light: "removed the light paper behind the drawing",
  edge: "removed the backdrop by flooding in from the edges",
};

// The automatic finish. Studio adjustments are a later slice.
const FINISH = {
  tolerance: 0.08,
  texture: 0.5,
  outline: 3,
  shadow: 0.55,
  shadowBlur: 10,
  shadowY: 6,
  size: 0.8,
};

const LOOKS = {
  solid: { tint: false, detail: 0 },
  shaded: { tint: true, detail: 0 },
  lines: { tint: true, detail: 0.9 },
} as const;

export type ResolvedLook = keyof typeof LOOKS;

/** Auto: Solid suits line art and ink; on photos it flattens everything into a blob. */
export const resolveLook = (look: ArtworkLook, mode: CutoutMode): ResolvedLook =>
  look === "auto" ? (mode === "edge" ? "lines" : "solid") : look;

interface VariantSpec {
  readonly variant: IconVariant;
  readonly left: Palette;
  // A Traveller splits at the centre of the art's bounding box.
  readonly right?: Palette;
}

/** Export order: [regular, flipped], or [unaligned, good, evil] for Travellers. */
export const variantSpecs = (team: AuthoredTeam): ReadonlyArray<VariantSpec> => {
  if (team === "traveller")
    return [
      { variant: "unaligned", left: "good", right: "evil" },
      { variant: "good", left: "good", right: "gold" },
      { variant: "evil", left: "gold", right: "evil" },
    ];

  return team === "minion" || team === "demon"
    ? [
        { variant: "regular", left: "evil" },
        { variant: "flipped", left: "good" },
      ]
    : [
        { variant: "regular", left: "good" },
        { variant: "flipped", left: "evil" },
      ];
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

const lum = (d: Uint8ClampedArray, i: number) =>
  (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0)) / 255;

const borderIndices = (w: number, h: number) => {
  const out: Array<number> = [];

  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);

  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);

  return out;
};

/** Own transparency first; a light, flat, colourless border means ink on paper; else flood. */
export const detectCutout = (d: Uint8ClampedArray, w: number, h: number): CutoutMode => {
  let transparent = 0;

  for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) < 250) transparent++;

  if (transparent > w * h * 0.01) return "alpha";
  const border = borderIndices(w, h);
  let sum = 0;
  let squares = 0;

  for (const p of border) {
    const l = lum(d, p * 4);
    sum += l;
    squares += l * l;
  }

  const mean = sum / border.length;
  const sd = Math.sqrt(Math.max(0, squares / border.length - mean * mean));
  let saturation = 0;

  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
    const min = Math.min(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
    saturation += max === 0 ? 0 : (max - min) / max;
  }

  saturation /= w * h;

  return mean > 0.8 && sd < 0.08 && saturation < 0.12 ? "light" : "edge";
};

// Ink drawing on paper: light pixels become transparent, so enclosed paper becomes holes.
const lightKey = (d: Uint8ClampedArray, tolerance: number) => {
  const cut = 1 - tolerance * 2;

  for (let i = 0; i < d.length; i += 4)
    d[i + 3] = Math.round((d[i + 3] ?? 0) * clamp01((cut - lum(d, i)) / 0.2));
};

// Backdrop removal: grow a region from the border through similar neighbours, then feather.
const edgeFlood = (d: Uint8ClampedArray, w: number, h: number, tolerance: number) => {
  const at = (i: number) => d[i] ?? 0;

  const distance = (i: number, j: number) =>
    Math.hypot(at(i) - at(j), at(i + 1) - at(j + 1), at(i + 2) - at(j + 2), at(i + 3) - at(j + 3)) /
    510;

  const border = borderIndices(w, h);
  const mean = [0, 0, 0, 0];

  for (const p of border)
    for (let k = 0; k < 4; k++) mean[k] = (mean[k] ?? 0) + at(p * 4 + k) / border.length;

  const fromMean = (i: number) =>
    Math.hypot(
      at(i) - (mean[0] ?? 0),
      at(i + 1) - (mean[1] ?? 0),
      at(i + 2) - (mean[2] ?? 0),
      at(i + 3) - (mean[3] ?? 0),
    ) / 510;

  const guard = Math.max(0.2, tolerance * 4);
  const background = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  for (const p of border)
    if (!background[p] && fromMean(p * 4) < guard) {
      background[p] = 1;
      queue[tail++] = p;
    }

  while (head < tail) {
    const p = queue[head++] ?? 0;
    const x = p % w;
    const y = (p / w) | 0;

    const visit = (q: number) => {
      if (!background[q] && distance(p * 4, q * 4) < tolerance && fromMean(q * 4) < guard) {
        background[q] = 1;
        queue[tail++] = q;
      }
    };

    if (x > 0) visit(p - 1);

    if (x < w - 1) visit(p + 1);

    if (y > 0) visit(p - w);

    if (y < h - 1) visit(p + w);
  }

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;

      if (background[p]) {
        d[p * 4 + 3] = 0;

        continue;
      }

      let count = 0;

      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;

          if (xx >= 0 && yy >= 0 && xx < w && yy < h && background[yy * w + xx]) count++;
        }

      if (count) d[p * 4 + 3] = Math.round(at(p * 4 + 3) * (1 - count / 12));
    }
};

/** Applies a cutout in place, returning the mode used. */
export const applyCutout = (d: Uint8ClampedArray, w: number, h: number): CutoutMode => {
  const mode = detectCutout(d, w, h);

  if (mode === "light") lightKey(d, FINISH.tolerance);
  else if (mode === "edge") edgeFlood(d, w, h, FINISH.tolerance);

  return mode;
};

/** The smallest box holding every visible pixel, or undefined when nothing is left. */
export const visibleBounds = (d: Uint8ClampedArray, w: number, h: number) => {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((d[(y * w + x) * 4 + 3] ?? 0) > 12) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }

  return x1 < 0 ? undefined : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
};

// Procedural mottling: avoids Bloodstar's texture asset, whose licence is unconfirmed.
let noise: Float32Array | undefined;

const textureNoise = () => {
  if (noise !== undefined) return noise;
  const out = new Float32Array(N);
  let seed = 7;

  const random = () => {
    seed = (seed * 16807) % 2147483647;

    return seed / 2147483647;
  };

  const smooth = (t: number) => t * t * (3 - 2 * t);

  for (const [grid, weight] of [
    [5, 0.35],
    [11, 0.3],
    [23, 0.2],
    [53, 0.15],
  ] as const) {
    const values = Array.from({ length: (grid + 1) * (grid + 1) }, random);
    const value = (i: number) => values[i] ?? 0;

    for (let y = 0; y < ICON_SIZE; y++) {
      const fy = (y / ICON_SIZE) * grid;
      const iy = Math.floor(fy);
      const ty = smooth(fy - iy);

      for (let x = 0; x < ICON_SIZE; x++) {
        const fx = (x / ICON_SIZE) * grid;
        const ix = Math.floor(fx);
        const tx = smooth(fx - ix);
        const a = value(iy * (grid + 1) + ix);
        const b = value(iy * (grid + 1) + ix + 1);
        const c = value((iy + 1) * (grid + 1) + ix);
        const e = value((iy + 1) * (grid + 1) + ix + 1);
        out[y * ICON_SIZE + x] =
          (out[y * ICON_SIZE + x] ?? 0) +
          weight * (a + (b - a) * tx + (c - a + (a - b - c + e) * tx) * ty);
      }
    }
  }

  for (let p = 0; p < N; p++) out[p] = clamp01(((out[p] ?? 0) - 0.5) * 2.2 + 0.5);
  noise = out;

  return out;
};

const canvas = (width: number, height: number) => {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;

  return element;
};

const context2d = (element: HTMLCanvasElement) => {
  const context = element.getContext("2d", { willReadFrequently: true });

  if (context === null) throw new Error("Canvas 2D is unavailable in this browser.");

  return context;
};

/** The art after cutout, trimmed to its visible bounds. */
export interface Cutout {
  readonly canvas: HTMLCanvasElement;
  readonly mode: CutoutMode;
}

// Working resolution; the published variants are only 400px.
const WORKING_SIZE = 600;

export class StylizeFailed extends Error {}

/** Decodes an original and cuts out its art. */
export const cutoutFrom = async (source: Blob): Promise<Cutout> => {
  const bitmap = await createImageBitmap(source).catch(() => {
    throw new StylizeFailed("This browser couldn’t read that image. Try a PNG or JPEG.");
  });

  const scale = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const work = canvas(width, height);
  const context = context2d(work);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const image = context.getImageData(0, 0, width, height);
  const mode = applyCutout(image.data, width, height);
  const bounds = visibleBounds(image.data, width, height);

  if (bounds === undefined)
    throw new StylizeFailed(
      "Nothing was left after removing the background. Try artwork with a transparent background.",
    );
  const trimmed = canvas(bounds.width, bounds.height);
  context2d(trimmed).putImageData(image, -bounds.x, -bounds.y);

  return { canvas: trimmed, mode };
};

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const paintGradient = (
  context: CanvasRenderingContext2D,
  stops: ReadonlyArray<string>,
  box: Box,
) => {
  const gradient = context.createLinearGradient(0, box.y, 0, box.y + box.h);
  stops.forEach((stop, i) => gradient.addColorStop(i / (stops.length - 1), stop));
  context.fillStyle = gradient;
  context.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
};

const fillData = (spec: VariantSpec, box: Box) => {
  const fill = canvas(ICON_SIZE, ICON_SIZE);
  const context = context2d(fill);
  paintGradient(context, PALETTES[spec.left], box);

  if (spec.right !== undefined) {
    const seam = box.x + box.w / 2;
    const right = canvas(ICON_SIZE, ICON_SIZE);
    const rightContext = context2d(right);
    paintGradient(rightContext, PALETTES[spec.right], box);
    rightContext.globalCompositeOperation = "destination-in";
    const mask = rightContext.createLinearGradient(seam - 3, 0, seam + 3, 0);
    mask.addColorStop(0, "rgba(0,0,0,0)");
    mask.addColorStop(1, "#000");
    rightContext.fillStyle = mask;
    rightContext.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    context.drawImage(right, 0, 0);
  }

  return context.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data;
};

// Luminance edges inside the silhouette, painted cream: mimics official pale detail lines.
const sobel = (luminance: Float32Array, d: Uint8ClampedArray) => {
  const edges = new Float32Array(N);

  for (let y = 1; y < ICON_SIZE - 1; y++)
    for (let x = 1; x < ICON_SIZE - 1; x++) {
      const p = y * ICON_SIZE + x;

      if ((d[p * 4 + 3] ?? 0) < 128) continue;

      const at = (dx: number, dy: number) => {
        const q = p + dy * ICON_SIZE + dx;

        return (d[q * 4 + 3] ?? 0) >= 128 ? (luminance[q] ?? 0) : (luminance[p] ?? 0);
      };

      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      edges[p] = clamp01((Math.hypot(gx, gy) / 4 - 0.1) * 5);
    }

  return edges;
};

// The 5th–95th percentile luminance range, so shading spans the art's own contrast.
const luminanceRange = (luminance: Float32Array, d: Uint8ClampedArray) => {
  const histogram = new Uint32Array(256);
  let count = 0;

  for (let p = 0; p < N; p++)
    if ((d[p * 4 + 3] ?? 0) > 128) {
      const bin = Math.round((luminance[p] ?? 0) * 255);
      histogram[bin] = (histogram[bin] ?? 0) + 1;
      count++;
    }

  let total = 0;
  let lo = -1;
  let hi = 1;

  for (let bin = 0; bin < 256; bin++) {
    total += histogram[bin] ?? 0;

    if (lo < 0 && total >= count * 0.05) lo = bin / 255;

    if (total >= count * 0.95) {
      hi = bin / 255;

      break;
    }
  }

  return hi - lo < 0.1 ? { lo: 0, hi: 1 } : { lo, hi };
};

const renderVariant = (cut: Cutout, look: ResolvedLook, spec: VariantSpec) => {
  const { tint, detail } = LOOKS[look];
  const source = cut.canvas;
  const scale = (FINISH.size * ICON_SIZE) / Math.max(source.width, source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  const box = { x: (ICON_SIZE - w) / 2, y: (ICON_SIZE - h) / 2, w, h };
  const placed = canvas(ICON_SIZE, ICON_SIZE);
  const context = context2d(placed);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, box.x, box.y, box.w, box.h);
  const image = context.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
  const d = image.data;
  const fill = fillData(spec, box);
  const luminance = new Float32Array(N);

  for (let p = 0; p < N; p++) luminance[p] = lum(d, p * 4);
  const { lo, hi } = tint ? luminanceRange(luminance, d) : { lo: 0, hi: 1 };
  const edges = detail > 0 ? sobel(luminance, d) : undefined;
  const texture = textureNoise();

  for (let p = 0; p < N; p++) {
    const i = p * 4;

    if (d[i + 3] === 0) continue;
    const k = tint ? 0.45 + 0.9 * clamp01(((luminance[p] ?? 0) - lo) / (hi - lo)) : 1;
    let r = (fill[i] ?? 0) * k;
    let g = (fill[i + 1] ?? 0) * k;
    let b = (fill[i + 2] ?? 0) * k;

    if (edges !== undefined) {
      const t = (edges[p] ?? 0) * detail;
      r += (CREAM[0] - r) * t;
      g += (CREAM[1] - g) * t;
      b += (CREAM[2] - b) * t;
    }

    const mottle = 1 - FINISH.texture * 0.75 * (1 - (texture[p] ?? 0));
    d[i] = r * mottle;
    d[i + 1] = g * mottle;
    d[i + 2] = b * mottle;
  }

  context.putImageData(image, 0, 0);
  const composite = canvas(ICON_SIZE, ICON_SIZE);
  const compositeContext = context2d(composite);
  const ring = canvas(ICON_SIZE, ICON_SIZE);
  const ringContext = context2d(ring);

  for (const radius of [FINISH.outline, FINISH.outline / 2])
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * Math.PI * 2;
      ringContext.drawImage(placed, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

  ringContext.globalCompositeOperation = "source-in";
  ringContext.fillStyle = `rgb(${CREAM.join(",")})`;
  ringContext.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  compositeContext.drawImage(ring, 0, 0);
  compositeContext.drawImage(placed, 0, 0);
  const out = canvas(ICON_SIZE, ICON_SIZE);
  const outContext = context2d(out);
  outContext.shadowColor = `rgba(0,0,0,${FINISH.shadow})`;
  outContext.shadowBlur = FINISH.shadowBlur;
  outContext.shadowOffsetY = FINISH.shadowY;
  outContext.drawImage(composite, 0, 0);

  return out;
};

const pngOf = (element: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    element.toBlob((blob) => {
      if (blob === null) reject(new StylizeFailed("Couldn’t encode the styled icon."));
      else
        blob.arrayBuffer().then(
          (buffer) => resolve(new Uint8Array(buffer)),
          () => reject(new StylizeFailed("Couldn’t encode the styled icon.")),
        );
    }, "image/png"),
  );

export interface StyledVariant {
  readonly variant: IconVariant;
  readonly image: Uint8Array;
}

/** Every variant the Team exports, as 400×400 PNGs. */
export const renderVariants = (cut: Cutout, team: AuthoredTeam, look: ArtworkLook) =>
  Promise.all(
    variantSpecs(team).map(async (spec) => ({
      variant: spec.variant,
      image: await pngOf(renderVariant(cut, resolveLook(look, cut.mode), spec)),
    })),
  );

/** A quick preview of the Team's first variant in a Look, for the Look picker. */
export const lookThumbnail = (cut: Cutout, team: AuthoredTeam, look: ArtworkLook) => {
  const [spec] = variantSpecs(team);

  return spec === undefined
    ? undefined
    : renderVariant(cut, resolveLook(look, cut.mode), spec).toDataURL("image/png");
};
