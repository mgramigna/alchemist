import { isStale, type PublicCharacter, type PublicScript } from "@alchemist/domain";
import { characterTitle } from "./characters.ts";

export const CREDIT_LABEL = "Image credit";

export const CREDIT_DESCRIPTION =
  "Optional. Many free icon libraries require attribution, such as “Icon by Lorc, game-icons.net, CC BY 3.0”. Shown on the shared page.";

export interface ImageCredit {
  // A Character ID, or the Script artwork field.
  readonly key: string;
  readonly subject: string;
  readonly credit: string;
}

// Stale artwork is replaced by generic icons, so its credit is not shown either.
const characterCredit = (character: PublicCharacter) =>
  character.artwork === undefined || isStale(character) ? "" : character.artworkCredit.trim();

/** Whether any Character icon on the sheets carries a credit. */
export const hasCharacterCredits = (characters: ReadonlyArray<PublicCharacter>) =>
  characters.some((character) => characterCredit(character) !== "");

/** Credits for the images currently shown: each Character's icon, then the logo and background. */
export const imageCredits = (
  script: Pick<PublicScript, "characters" | "artwork" | "logoCredit" | "backgroundCredit">,
): ReadonlyArray<ImageCredit> => [
  ...script.characters.flatMap((character) => {
    const credit = characterCredit(character);

    return credit === "" ? [] : [{ key: character.id, subject: characterTitle(character), credit }];
  }),
  ...(
    [
      ["logo", "Logo", script.artwork.logo, script.logoCredit],
      ["background", "Background", script.artwork.background, script.backgroundCredit],
    ] as const
  ).flatMap(([key, subject, path, credit]) =>
    path === null || credit.trim() === "" ? [] : [{ key, subject, credit: credit.trim() }],
  ),
];
