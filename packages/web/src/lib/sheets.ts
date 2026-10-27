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
  scriptFileStem,
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

/** Every PNG is captured at this fixed print resolution. */
export const CAPTURE_DPI = 300;

/** Canvas pixels of a captured page: 2550×3300 for US Letter. */
export const capturePixels = (paper: Paper) => {
  const { width, height } = PAPERS[paper];
  const scale = CAPTURE_DPI / 96;

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/** The two printable sheets, each downloaded as its own PNG. */
export type SheetKind = "character" | "night";

export const SHEET_KINDS: ReadonlyArray<SheetKind> = ["character", "night"];

export const SHEET_LABELS: Record<SheetKind, string> = {
  character: "Character sheet",
  night: "Night sheet",
};

export const sheetFilename = (scriptName: string, sheet: SheetKind) =>
  `${scriptFileStem(scriptName)}-${sheet}.png`;

/**
 * Every face the sheets draw with. A missing one would silently change line
 * breaks, so capture waits for all of them and blocks if any fails.
 */
export const SHEET_FONTS: ReadonlyArray<{
  readonly family: string;
  readonly style: "normal" | "italic";
}> = [
  { family: "Libre Franklin Variable", style: "normal" },
  { family: "Libre Franklin Variable", style: "italic" },
  { family: "Cinzel Variable", style: "normal" },
  { family: "Sorts Mill Goudy", style: "italic" },
];

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

const RING: Record<Rail, string> = { good: "#1d5fae", evil: "#a3171d", traveller: "#5b4a7a" };

/**
 * A plain Team-colored token, inlined so it cannot fail to load. It stands in
 * for any Character icon that does not load.
 */
export const fallbackIcon = (team: AuthoredTeam) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><circle cx="200" cy="200" r="184" fill="${RING[railOf(team)]}"/><circle cx="200" cy="200" r="144" fill="#f4ead2"/></svg>`,
  )}`;

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
