import type { PublicScript } from "@alchemist/domain";
import { imageCredits } from "./credits.ts";
import { sheetFooter } from "./sheets.ts";

/** Theater Mode lives in the URL, so a TV's browser can open the link directly. */
export interface TheaterSearch {
  readonly theater?: true | undefined;
  readonly night?: true | undefined;
}

// Unknown values drop to the plain page rather than failing the route.
export const parseTheaterSearch = (search: {
  readonly theater?: unknown;
  readonly night?: unknown;
}): TheaterSearch => ({
  theater: search.theater === true ? true : undefined,
  night: search.night === true ? true : undefined,
});

/** Text and icon scales tried, largest first, until the Characters fit the screen. */
export const POSTER_FITS: ReadonlyArray<number> = Array.from(
  { length: 15 },
  (_, index) => 2 - index / 10,
);

/**
 * The poster's footer. It shows the logo as well as the Character icons, so either
 * credit needs the link to the shared page. The background is never shown here.
 */
export const posterFooter = (
  origin: string,
  script: Pick<PublicScript, "id" | "characters" | "artwork" | "logoCredit" | "backgroundCredit">,
) => {
  const { madeWith } = sheetFooter(origin, script);
  const credited = imageCredits(script).some(({ key }) => key !== "background");

  return credited
    ? `${madeWith} · Image credits: ${new URL(origin).host}/scripts/${script.id}`
    : madeWith;
};
