import { AuthoredTeam, genericIcons } from "@alchemist/domain";
import { expect, test } from "vitest";
import { detectCutout, resolveLook, variantSpecs, visibleBounds } from "./stylize.ts";

const image = (w: number, h: number, pixel: (x: number, y: number) => readonly number[]) => {
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);

  return data;
};

const inside = (x: number, y: number) => x > 6 && x < 14 && y > 6 && y < 14;

test("the automatic cutout uses transparency, then light paper, then an edge flood", () => {
  const transparent = image(20, 20, (x, y) => (inside(x, y) ? [20, 20, 20, 255] : [0, 0, 0, 0]));
  const ink = image(20, 20, (x, y) => (inside(x, y) ? [25, 22, 20, 255] : [245, 240, 225, 255]));

  const photo = image(20, 20, (x, y) =>
    inside(x, y) ? [210, 40, 40, 255] : [120 + y * 4, 150 + y * 3, 170, 255],
  );

  expect(detectCutout(transparent, 20, 20)).toBe("alpha");
  expect(detectCutout(ink, 20, 20)).toBe("light");
  expect(detectCutout(photo, 20, 20)).toBe("edge");
  // Auto picks Solid for line art and ink, Pale lines for photos.
  expect(resolveLook("auto", "alpha")).toBe("solid");
  expect(resolveLook("auto", "light")).toBe("solid");
  expect(resolveLook("auto", "edge")).toBe("lines");
  expect(resolveLook("shaded", "edge")).toBe("shaded");
});

test("trimming finds the visible art, or nothing", () => {
  const art = image(20, 20, (x, y) => (inside(x, y) ? [0, 0, 0, 255] : [0, 0, 0, 0]));

  expect(visibleBounds(art, 20, 20)).toEqual({ x: 7, y: 7, width: 7, height: 7 });
  expect(visibleBounds(new Uint8ClampedArray(400 * 4), 20, 20)).toBeUndefined();
});

test("every Team renders the variants it exports, in export order", () => {
  for (const team of AuthoredTeam.literals)
    expect(variantSpecs(team).map(({ variant }) => variant)).toEqual(
      genericIcons(team).map(({ variant }) => variant),
    );

  expect(variantSpecs("minion")[0]?.left).toBe("evil");
  expect(variantSpecs("outsider")[0]?.left).toBe("good");
});
