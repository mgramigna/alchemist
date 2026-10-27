import { AUTO_STYLE, customizations } from "@alchemist/domain";
import { expect, test } from "vitest";
import { sameStyle, withSetting } from "./studio.ts";
import { variantSpecs } from "./stylize.ts";

test("a Studio setting is kept only while it differs from automatic styling", () => {
  const moved = withSetting(AUTO_STYLE, "offsetX", 12, "alpha");
  expect(moved).toEqual({ look: "auto", offsetX: 12 });
  expect(customizations(moved)).toEqual(["position"]);

  // Returning to the automatic value clears it, so nothing reads as customized.
  expect(withSetting(moved, "offsetX", 0, "alpha")).toEqual(AUTO_STYLE);
  expect(sameStyle(withSetting(moved, "offsetX", 0, "alpha"), AUTO_STYLE)).toBe(true);

  // Color follows the Look: Auto on a photo is Pale lines, so Shaded is automatic there.
  expect(withSetting(AUTO_STYLE, "color", "shaded", "edge")).toEqual(AUTO_STYLE);
  expect(withSetting(AUTO_STYLE, "color", "shaded", "alpha")).toEqual({
    look: "auto",
    color: "shaded",
  });

  expect(
    customizations({ look: "solid", cutout: "edge", shadowBlur: 2, size: 0.5, teamShades: true }),
  ).toEqual(["cutout", "Team shades", "shadow", "size"]);
});

test("Team shades recolor only the Outsider and Minion regular variants", () => {
  expect(variantSpecs("outsider", true).map(({ left }) => left)).toEqual(["outsider", "evil"]);
  expect(variantSpecs("minion", true).map(({ left }) => left)).toEqual(["minion", "good"]);
  expect(variantSpecs("townsfolk", true)).toEqual(variantSpecs("townsfolk"));
  expect(variantSpecs("demon", true)).toEqual(variantSpecs("demon"));
});
