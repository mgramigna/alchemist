import { expect, test } from "vitest";
import { unicodeRangeCovers } from "./capture.ts";

test("a unicode-range covers text with any character inside one of its spans", () => {
  const latin = "U+0-FF, U+131, U+152-153";

  expect(unicodeRangeCovers(latin, "Brimstone")).toBe(true);
  expect(unicodeRangeCovers(latin, "Œ")).toBe(true);
  expect(unicodeRangeCovers("U+460-52F, U+1C80-1C8A", "Brimstone")).toBe(false);
  expect(unicodeRangeCovers("U+4??", "Ж")).toBe(true);
  expect(unicodeRangeCovers("U+1F300-1F5FF", "🌙")).toBe(true);
});
