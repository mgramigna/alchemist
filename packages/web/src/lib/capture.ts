import { CAPTURE_DPI, PAPERS, SHEET_FONTS, type Paper } from "./sheets.ts";

/** How long capture waits on fonts, icons and embedded assets before giving up on them. */
export const RESOURCE_TIMEOUT_MS = 15_000;

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const within = <A>(promise: Promise<A>, fallback: A, ms: number) =>
  new Promise<A>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);

    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

const unquote = (family: string) => family.replace(/^["']|["']$/g, "");

const isSheetFace = ({ family, style }: { readonly family: string; readonly style: string }) =>
  SHEET_FONTS.some((font) => font.family === unquote(family) && font.style === style);

/** Whether a CSS `unicode-range` includes any of the text's characters. */
export const unicodeRangeCovers = (range: string, text: string) => {
  const spans = range.split(",").map((part) => {
    const [low = "0", high] = part.trim().replace(/^U\+/i, "").split("-");

    return high === undefined
      ? [parseInt(low.replace(/\?/g, "0"), 16), parseInt(low.replace(/\?/g, "F"), 16)]
      : [parseInt(low, 16), parseInt(high, 16)];
  });

  return Array.from(text).some((char) => {
    const point = char.codePointAt(0) ?? 0;

    return spans.some(([low = 0, high = 0]) => point >= low && point <= high);
  });
};

// Faces re-added by the latest retry. They replace the stylesheet's faces,
// which never load again once they have failed.
let retried: ReadonlyArray<FontFace> = [];

/**
 * Loads every sheet face the text needs. False when any fails or is still
 * loading at the timeout, since a fallback font would change the layout.
 */
export const loadSheetFonts = async (text: string, ms = RESOURCE_TIMEOUT_MS) => {
  const faces = (retried.length ? retried : [...document.fonts]).filter(
    (face) => isSheetFace(face) && unicodeRangeCovers(face.unicodeRange, text),
  );

  const loaded = await within(
    Promise.all(faces.map((face) => face.load().then(() => true))),
    [false],
    ms,
  );

  return faces.length > 0 && loaded.every(Boolean);
};

const fontFaceRules = (rules: Iterable<CSSRule>): ReadonlyArray<CSSFontFaceRule> =>
  [...rules].flatMap((rule) => {
    if (rule instanceof CSSFontFaceRule) return [rule];

    if (rule instanceof CSSImportRule) return fontFaceRules(rule.styleSheet?.cssRules ?? []);

    return rule instanceof CSSGroupingRule ? fontFaceRules(rule.cssRules) : [];
  });

/**
 * Before a retry, re-adds the sheet faces from their `@font-face` rules if any
 * failed. Faces added later win font matching, so the page renders with them.
 */
export const reloadFailedSheetFonts = () => {
  const current = retried.length ? retried : [...document.fonts];

  if (!current.some((face) => isSheetFace(face) && face.status === "error")) return;

  for (const face of retried) document.fonts.delete(face);

  retried = [...document.styleSheets].flatMap((sheet) => {
    let rules: CSSRuleList;

    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheets aren't readable and hold no sheet fonts.
      return [];
    }

    return fontFaceRules(rules).flatMap((rule) => {
      const descriptor = (name: string, fallback: string) =>
        rule.style.getPropertyValue(name) || fallback;

      const family = unquote(descriptor("font-family", ""));
      const style = descriptor("font-style", "normal");

      if (!isSheetFace({ family, style })) return [];

      const face = new FontFace(family, descriptor("src", ""), {
        style,
        weight: descriptor("font-weight", "normal"),
        unicodeRange: descriptor("unicode-range", "U+0-10FFFF"),
        display: "swap",
      });

      document.fonts.add(face);

      return [face];
    });
  });
};

/** Swaps an icon that failed to load for its inlined fallback token. */
export const showFallbackIcon = (img: HTMLImageElement) => {
  const fallback = img.dataset["fallback"];

  if (fallback === undefined || img.hasAttribute("data-fallback-shown")) return;

  img.setAttribute("data-fallback-shown", "");
  img.src = fallback;
};

const settled = (img: HTMLImageElement) =>
  img.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });

/**
 * Waits for the sheet's icons. Any that fail, or are still loading at the
 * timeout, show their fallback token. Returns how many did.
 */
export const settleSheetIcons = async (sheet: HTMLElement, ms = RESOURCE_TIMEOUT_MS) => {
  const icons = [...sheet.querySelectorAll("img")];

  await within(Promise.all(icons.map(settled)), undefined, ms);

  for (const icon of icons) if (!icon.complete || icon.naturalWidth === 0) showFallbackIcon(icon);

  const fallbacks = icons.filter((icon) => icon.hasAttribute("data-fallback-shown"));

  await within(
    Promise.all(fallbacks.map((icon) => icon.decode().catch(() => undefined))),
    undefined,
    ms,
  );

  return fallbacks.length;
};

/**
 * Captures a sheet at its natural page size and 300 DPI. Assets that can't be
 * embedded use the icon's fallback token, counted in `fallbacks`.
 */
export const captureSheet = async (
  sheet: HTMLElement,
  paper: Paper,
  onProgress?: (fraction: number) => void,
) => {
  const { domToBlob } = await import("modern-screenshot");
  const { width, height } = PAPERS[paper];
  let fallbacks = 0;

  const blob = await domToBlob(sheet, {
    width,
    height,
    scale: CAPTURE_DPI / 96,
    type: "image/png",
    timeout: RESOURCE_TIMEOUT_MS,
    progress: (current, total) => onProgress?.(total === 0 ? 1 : current / total),
    fetch: {
      placeholderImage: (cloned) => {
        const fallback =
          cloned instanceof HTMLImageElement ? cloned.dataset["fallback"] : undefined;

        if (fallback === undefined) return TRANSPARENT_PIXEL;

        fallbacks += 1;

        return fallback;
      },
    },
  });

  return { blob, fallbacks };
};
