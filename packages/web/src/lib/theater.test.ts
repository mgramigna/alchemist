import { CharacterId, ScriptId, type PublicCharacter } from "@alchemist/domain";
import { expect, test } from "vitest";
import { parseTheaterSearch, POSTER_FITS, posterFooter } from "./theater.ts";

const ORIGIN = "https://alchemist.example";
const LINK = "Image credits: alchemist.example/scripts/01k8ah00000000000000000001";

const script: Parameters<typeof posterFooter>[1] = {
  id: ScriptId.make("01k8ah00000000000000000001"),
  characters: [],
  artwork: { logo: null, background: null },
  logoCredit: "",
  backgroundCredit: "",
};

const character: PublicCharacter = {
  id: CharacterId.make("01k8ah00000000000000000002"),
  name: "Chef",
  ability: "",
  team: "townsfolk",
  firstNightInstructions: "",
  otherNightInstructions: "",
  artworkCredit: "Icon by Lorc",
  artwork: {
    team: "townsfolk",
    variants: [{ variant: "regular", path: "/artwork/regular.png" }],
  },
};

test("only literal true opens Theater Mode or the night ribbon", () => {
  expect(parseTheaterSearch({ theater: true, night: true })).toEqual({
    theater: true,
    night: true,
  });

  for (const value of [false, "true", 1, null, undefined])
    expect(parseTheaterSearch({ theater: value, night: value })).toEqual({
      theater: undefined,
      night: undefined,
    });
});

test("fits are tried largest first and stop at the legibility floor", () => {
  expect(POSTER_FITS[0]).toBe(2);
  expect(POSTER_FITS.at(-1)).toBeCloseTo(0.6);
  expect(POSTER_FITS).toEqual([...POSTER_FITS].toSorted((a, b) => b - a));
});

test("the footer links to credits only for images the poster shows", () => {
  expect(posterFooter(ORIGIN, script)).not.toContain("Image credits");
  // A credited logo counts once it is shown; a credit with no logo does not.
  expect(posterFooter(ORIGIN, { ...script, logoCredit: "By Ada" })).not.toContain("Image credits");
  expect(
    posterFooter(ORIGIN, {
      ...script,
      artwork: { logo: "/artwork/logo.png", background: null },
      logoCredit: "By Ada",
    }),
  ).toContain(LINK);
  // The poster never shows the background, so its credit needs no link.
  expect(
    posterFooter(ORIGIN, {
      ...script,
      artwork: { logo: null, background: "/artwork/background.png" },
      backgroundCredit: "By Ada",
    }),
  ).not.toContain("Image credits");
  expect(posterFooter(ORIGIN, { ...script, characters: [character] })).toContain(LINK);
});
