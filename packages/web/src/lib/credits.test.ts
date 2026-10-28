import { CharacterId, type AuthoredTeam, type PublicCharacter } from "@alchemist/domain";
import { expect, test } from "vitest";
import { hasCharacterCredits, imageCredits } from "./credits.ts";

const character = (
  id: string,
  team: AuthoredTeam,
  artworkCredit: string,
  artworkTeam: AuthoredTeam | null = team,
): PublicCharacter => ({
  id: CharacterId.make(`01k8ah${id.padStart(20, "0")}`),
  name: id,
  ability: "",
  team,
  firstNightInstructions: "",
  otherNightInstructions: "",
  artworkCredit,
  ...(artworkTeam !== null && {
    artwork: { team: artworkTeam, variants: [{ variant: "regular", path: "/artwork/x.png" }] },
  }),
});

const credited = character("Chef", "townsfolk", "  Icon by Lorc, game-icons.net, CC BY 3.0 ");
const blank = character("Imp", "demon", "  ");

// Credits outlive their image, but only show while it does.
const removed = character("Thief", "traveller", "Old credit", null);
const stale = character("Poisoner", "minion", "Styled as a Demon", "demon");

test("lists credits for shown images only: Characters in order, then the logo and background", () => {
  expect(
    imageCredits({
      characters: [credited, blank, removed, stale],
      artwork: { logo: "/artwork/logo.png", background: null },
      logoCredit: "Logo by Ada",
      backgroundCredit: "Background with no image",
    }),
  ).toEqual([
    { key: credited.id, subject: "Chef", credit: "Icon by Lorc, game-icons.net, CC BY 3.0" },
    { key: "logo", subject: "Logo", credit: "Logo by Ada" },
  ]);
});

test("the sheets link to credits only when a shown Character icon has one", () => {
  expect(hasCharacterCredits([blank, removed, stale])).toBe(false);
  expect(hasCharacterCredits([blank, credited])).toBe(true);
});
