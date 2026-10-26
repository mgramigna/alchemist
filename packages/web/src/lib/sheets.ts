import {
  NIGHTS,
  defaultAlignment,
  isNightStep,
  type AuthoredTeam,
  type CharacterId,
  type Jinx,
  type Night,
  type NightOrder,
  type NightOrders,
  type NightStep,
  type PublicCharacter,
} from "@alchemist/domain";
import { groupByTeam } from "./characters.ts";
import { INSTRUCTIONS_FIELD } from "./night.ts";

export type Paper = "letter" | "a4";

// Natural page sizes in CSS pixels (96 per inch); capture scales them to 300 DPI.
export const PAPERS: Record<
  Paper,
  {
    readonly label: string;
    readonly width: number;
    readonly height: number;
  }
> = {
  letter: { label: "US Letter", width: 816, height: 1056 },
  a4: { label: "A4", width: 794, height: 1123 },
};

export const PAPER_OPTIONS: ReadonlyArray<Paper> = ["letter", "a4"];

export const isPaper = (value: unknown): value is Paper =>
  PAPER_OPTIONS.some((paper) => paper === value);

/** Text and icon scales tried, in order, until a sheet fits one page. */
export const FIT_STEPS: ReadonlyArray<number> = [1, 0.95, 0.9, 0.85, 0.8];

export const DISCLAIMER = "Made with Alchemist · Not affiliated with The Pandemonium Institute";

/** Everything both sheets render, whether from the owner's draft or the share link. */
export interface SheetContent {
  readonly name: string;
  readonly authorCredit: string;
  readonly characters: ReadonlyArray<PublicCharacter>;
  readonly nightOrders: NightOrders;
  readonly jinxes: ReadonlyArray<Jinx>;
}

/** What a preview tab shows: the Character sheet, or the night sheet turned to one night. */
export type SheetView = "characters" | Night;

export const isSheetView = (value: unknown): value is SheetView =>
  value === "characters" || NIGHTS.some((night) => night === value);

export type Rail = "good" | "evil" | "traveller";

export const railOf = (team: AuthoredTeam): Rail => defaultAlignment(team) ?? "traveller";

export interface TeamGroup {
  readonly team: AuthoredTeam;
  readonly characters: ReadonlyArray<PublicCharacter>;
}

/** Good Teams on the left; Evil then Travellers on the right. Empty Teams are left out. */
export const characterSheetColumns = (characters: ReadonlyArray<PublicCharacter>) => {
  const groups = groupByTeam(characters).filter((group) => group.characters.length > 0);

  return {
    left: groups.filter(({ team }) => railOf(team) === "good"),
    right: groups.filter(({ team }) => railOf(team) !== "good"),
  };
};

export type NightRow =
  | { readonly kind: "step"; readonly step: NightStep }
  | {
      readonly kind: "character";
      readonly character: PublicCharacter;
      // Blank when nothing is written yet; the row still appears.
      readonly instructions: string;
    };

/** One row per entry, in the saved order, including blank rows and entries after Dawn. */
export const nightRows = (
  night: Night,
  order: NightOrder,
  characters: ReadonlyArray<PublicCharacter>,
): ReadonlyArray<NightRow> =>
  order.flatMap((entry): ReadonlyArray<NightRow> => {
    if (isNightStep(entry)) return [{ kind: "step", step: entry }];

    const character = characters.find(({ id }) => id === entry);

    return character === undefined
      ? []
      : [
          {
            kind: "character",
            character,
            instructions: character[INSTRUCTIONS_FIELD[night]].trim(),
          },
        ];
  });

/** The sheet that shows a Character, preferring the one already on screen. */
export const sheetShowing = (
  current: SheetView,
  id: CharacterId,
  nightOrders: NightOrders,
): SheetView =>
  current === "characters" || nightOrders[current].includes(id) ? current : "characters";
