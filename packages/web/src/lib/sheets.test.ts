import { CharacterId, type AuthoredTeam, type PublicCharacter } from "@alchemist/domain";
import { expect, test } from "vitest";
import {
  capturePixels,
  characterSheetColumns,
  fallbackIcon,
  nightRows,
  sheetFilename,
  sheetShowing,
} from "./sheets.ts";

const character = (
  id: string,
  team: AuthoredTeam,
  firstNightInstructions = "",
): PublicCharacter => ({
  id: CharacterId.make(`01k8ah${id.padStart(20, "0")}`),
  name: id,
  ability: "",
  team,
  firstNightInstructions,
  otherNightInstructions: "",
});

const chef = character("1", "townsfolk", "  Show a number.  ");
const imp = character("2", "demon");
const thief = character("3", "traveller");
const poisoner = character("4", "minion");

test("Good Teams fill the left column; Evil then Travellers the right, skipping empty Teams", () => {
  const { left, right } = characterSheetColumns([thief, imp, chef, poisoner]);

  expect(left.map(({ team }) => team)).toEqual(["townsfolk"]);
  expect(right.map(({ team }) => team)).toEqual(["minion", "demon", "traveller"]);
});

test("night rows follow the order exactly, keeping blank and after-Dawn entries", () => {
  const rows = nightRows("firstNight", ["dusk", chef.id, "dawn", imp.id], [chef, imp]);

  expect(rows).toEqual([
    { kind: "step", step: "dusk" },
    { kind: "character", character: chef, instructions: "Show a number." },
    { kind: "step", step: "dawn" },
    { kind: "character", character: imp, instructions: "" },
  ]);
});

test("selecting a Character keeps a sheet that shows it, otherwise turns to the Character sheet", () => {
  const orders = { firstNight: [chef.id], otherNight: [] };

  expect(sheetShowing("firstNight", chef.id, orders)).toBe("firstNight");
  expect(sheetShowing("otherNight", chef.id, orders)).toBe("characters");
  expect(sheetShowing("characters", imp.id, orders)).toBe("characters");
});

test("sheet PNGs are named after the Script, one file per sheet", () => {
  expect(sheetFilename("Brimstone & Brine", "character")).toBe("Brimstone-Brine-character.png");
  expect(sheetFilename("Brimstone & Brine", "night")).toBe("Brimstone-Brine-night.png");
  expect(sheetFilename("", "night")).toBe("script-night.png");
});

test("captures are 300 DPI pages at either paper size", () => {
  expect(capturePixels("letter")).toEqual({ width: 2550, height: 3300 });
  expect(capturePixels("a4")).toEqual({ width: 2481, height: 3509 });
});

test("fallback tokens are inlined and coloured by the Team's rail", () => {
  const good = decodeURIComponent(fallbackIcon("townsfolk"));

  expect(good).toMatch(/^data:image\/svg\+xml,<svg /);
  expect(good).toContain("#1d5fae");
  expect(decodeURIComponent(fallbackIcon("demon"))).toContain("#a3171d");
  expect(fallbackIcon("traveller")).not.toBe(fallbackIcon("townsfolk"));
});
