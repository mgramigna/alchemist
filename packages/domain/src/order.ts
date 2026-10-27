import { Schema } from "effect";
import { AuthoredTeam, CharacterId, type Character } from "./character.ts";
import type { NightOrders } from "./night.ts";
import { textLength } from "./text.ts";

// Every member Character exactly once. The bound only limits payload size.
export const CharacterOrder = Schema.Array(CharacterId).check(Schema.isMaxLength(500));

export type CharacterOrder = typeof CharacterOrder.Type;

export const CharacterSort = Schema.Literals(["standard", "alphabetical"]);

export type CharacterSort = typeof CharacterSort.Type;

export class CharacterOrderInvalid extends Schema.TaggedError<
  CharacterOrderInvalid,
  { readonly brand: unique symbol }
>()("CharacterOrderInvalid", { message: Schema.String }) {}

/** Why an order cannot be saved for a Script with these Characters, if anything. */
export const characterOrderProblem = (
  order: ReadonlyArray<CharacterId>,
  characterIds: ReadonlyArray<CharacterId>,
): string | undefined => {
  const seen = new Set<CharacterId>();

  for (const id of order) {
    if (seen.has(id)) return `“${id}” appears more than once.`;
    seen.add(id);

    if (!characterIds.includes(id)) return `“${id}” is not on this Script.`;
  }

  const missing = characterIds.find((id) => !seen.has(id));

  return missing === undefined ? undefined : `“${missing}” is missing.`;
};

// Standard Amy Order: within a Team, abilities are grouped by how they open, in
// this order. https://bloodontheclocktower.com/blogs/news/sort-order-sao-update
const STANDARD_OPENINGS: ReadonlyArray<string> = [
  "You start knowing",
  "At night",
  "Each dusk*",
  "Each night",
  "Each night*",
  "Each day",
  "Once per game, at night",
  "Once per game, at night*",
  "Once per game, during the day",
  "Once per game",
  "On your 1st night",
  "On your 1st day",
  "You think",
  "You are",
  "You have",
  "You do not know",
  "You might",
  "You",
  "When you die",
  "When you learn that you died",
  "When",
  "If you die",
  "If you died",
  'If you are "mad"',
  "If you",
  "If the Demon dies",
  "If the Demon kills",
  "If the Demon",
  "If both",
  "If there are 5 or more players alive",
  "If",
  "All players",
  "All",
  "The 1st time",
  "The",
  "Good",
  "Evil",
  "Players",
  "Minions",
].map((opening) => opening.toLowerCase());

const normalize = (ability: string) =>
  ability
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();

// "*" means "except the first night". Each starred opening's unstarred partner.
const STARRED: ReadonlyArray<readonly [string, string]> = [
  ["each night", "each night*"],
  ["once per game, at night", "once per game, at night*"],
];

/** Which nights a Character acts on, from its Night Order membership. */
export interface NightActions {
  readonly firstNight: boolean;
  readonly otherNight: boolean;
}

export const nightActions = (orders: NightOrders, id: CharacterId): NightActions => ({
  firstNight: orders.firstNight.includes(id),
  otherNight: orders.otherNight.includes(id),
});

/**
 * The index of the longest opening that starts the ability as whole words, so
 * "Each night*" wins over "Each night" and "If you died" over "If you die".
 * Abilities matching none sort after every group.
 *
 * For a night opening, the Character's night actions decide the "*" whenever
 * it acts at night at all, rather than the text: skipping the First Night
 * stars it, acting on the First Night does not.
 */
export const standardGroup = (ability: string, nights?: NightActions): number => {
  const text = normalize(ability);
  let best = { index: STANDARD_OPENINGS.length, length: 0 };

  for (const [index, opening] of STANDARD_OPENINGS.entries())
    if (
      opening.length > best.length &&
      text.startsWith(opening) &&
      !/^[\p{L}\p{N}]/u.test(text.slice(opening.length))
    )
      best = { index, length: opening.length };

  const opening = STANDARD_OPENINGS[best.index];
  const pair = STARRED.find((candidate) => opening !== undefined && candidate.includes(opening));

  if (pair === undefined || nights === undefined || !(nights.firstNight || nights.otherNight))
    return best.index;

  return STANDARD_OPENINGS.indexOf(nights.firstNight ? pair[0] : pair[1]);
};

const byName = (a: Pick<Character, "name">, b: Pick<Character, "name">) =>
  a.name.trim().localeCompare(b.name.trim(), "en", { sensitivity: "base" });

const teamIndex = (team: Character["team"]) => AuthoredTeam.literals.indexOf(team);

/**
 * Characters by Team, then within each Team by name, or in Standard Amy Order:
 * by ability opening (using the Night Orders for night openings), then
 * shortest ability first. Ties fall back to name.
 */
export const sortCharacters = <C extends Pick<Character, "id" | "name" | "ability" | "team">>(
  characters: ReadonlyArray<C>,
  sort: CharacterSort,
  nightOrders?: NightOrders,
): ReadonlyArray<C> =>
  characters
    .map((character) => ({
      character,
      group:
        sort === "standard"
          ? standardGroup(character.ability, nightOrders && nightActions(nightOrders, character.id))
          : 0,
      length: sort === "standard" ? textLength(character.ability.trim()) : 0,
    }))
    .sort(
      (a, b) =>
        teamIndex(a.character.team) - teamIndex(b.character.team) ||
        a.group - b.group ||
        a.length - b.length ||
        byName(a.character, b.character) ||
        a.character.id.localeCompare(b.character.id),
    )
    .map(({ character }) => character);

/** Characters arranged as `order`. Any not in it keep their relative order at the end. */
export const inOrder = <C extends Pick<Character, "id">>(
  characters: ReadonlyArray<C>,
  order: ReadonlyArray<CharacterId>,
): ReadonlyArray<C> => {
  const rank = (id: CharacterId) => {
    const index = order.indexOf(id);

    return index === -1 ? order.length : index;
  };

  return characters.toSorted((a, b) => rank(a.id) - rank(b.id));
};
