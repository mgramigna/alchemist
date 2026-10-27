import { expect, test } from "vitest";
import {
  CharacterId,
  characterOrderProblem,
  inOrder,
  sortCharacters,
  type AuthoredTeam,
} from "../src/index.ts";

const character = (
  id: string,
  name: string,
  ability: string,
  team: AuthoredTeam = "townsfolk",
) => ({
  id: CharacterId.make(id),
  name,
  ability,
  team,
});

const names = (characters: ReadonlyArray<{ readonly name: string }>) =>
  characters.map(({ name }) => name);

test("Standard order groups Teams, then ability openings, then shorter abilities first", () => {
  const characters = [
    character("imp", "Imp", "Each night*, choose a player: they die.", "demon"),
    character("saint", "Saint", "If you die by execution, your team loses.", "outsider"),
    character(
      "mayor",
      "Mayor",
      "If only 3 players live & no execution occurs, your team wins.",
      "townsfolk",
    ),
    character("soldier", "Soldier", "You are safe from the Demon.", "townsfolk"),
    character(
      "monk",
      "Monk",
      "Each night*, choose a player (not yourself): they are safe from the Demon tonight.",
    ),
    character(
      "empath",
      "Empath",
      "Each night, you learn how many of your 2 alive neighbors are evil.",
    ),
    character("chef", "Chef", "You start knowing how many pairs of evil players there are."),
    character(
      "investigator",
      "Investigator",
      "You start knowing that 1 of 2 players is a particular Minion.",
    ),
    character(
      "slayer",
      "Slayer",
      "Once per game, during the day, publicly choose a player: if they are the Demon, they die.",
    ),
    character(
      "ravenkeeper",
      "Ravenkeeper",
      "If you die at night, you are woken to choose a player: you learn their character.",
    ),
    character(
      "virgin",
      "Virgin",
      "The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.",
    ),
    character(
      "poisoner",
      "Poisoner",
      "Each night, choose a player: they are poisoned tonight and tomorrow day.",
      "minion",
    ),
    character("baron", "Baron", "There are extra Outsiders in play. [+2 Outsiders]", "minion"),
    character("blank", "Blank", ""),
  ];

  expect(names(sortCharacters(characters, "standard"))).toEqual([
    "Chef",
    "Investigator",
    "Empath",
    "Monk",
    "Slayer",
    "Soldier",
    "Ravenkeeper",
    "Mayor",
    "Virgin",
    // Abilities that open with no listed phrase follow their Team's groups.
    "Blank",
    "Saint",
    "Poisoner",
    "Baron",
    "Imp",
  ]);
});

test("openings match whole words, the longest first, ignoring case and curly quotes", () => {
  const characters = [
    character("a", "Your", "Your neighbours are drunk."),
    character("b", "Mad", "If you are “mad” about being good, you might be executed."),
    character("c", "Died", "If you died today, gain an ability."),
    character("d", "Die", "if you die, something."),
    character("e", "Plain", "You may nominate twice."),
  ];

  // "Your" is not "You"; it sorts with the unmatched abilities.
  expect(names(sortCharacters(characters, "standard"))).toEqual([
    "Plain",
    "Die",
    "Died",
    "Mad",
    "Your",
  ]);
});

test("alphabetical order groups Teams and ignores case", () => {
  const characters = [
    character("b", "baron", "", "minion"),
    character("z", "Zealot", ""),
    character("a", "acrobat", ""),
    character("o", "Ogre", "", "outsider"),
  ];

  expect(names(sortCharacters(characters, "alphabetical"))).toEqual([
    "acrobat",
    "Zealot",
    "Ogre",
    "baron",
  ]);
});

test("an order must list every Character on the Script exactly once", () => {
  const [a, b] = [CharacterId.make("a"), CharacterId.make("b")];

  expect(characterOrderProblem([b, a], [a, b])).toBeUndefined();
  expect(characterOrderProblem([a, a, b], [a, b])).toMatch(/more than once/);
  expect(characterOrderProblem([a], [a, b])).toMatch(/missing/);
  expect(characterOrderProblem([a, b, CharacterId.make("c")], [a, b])).toMatch(/not on this/);
});

test("arranging Characters by an order keeps any it omits at the end", () => {
  const characters = [character("a", "A", ""), character("b", "B", ""), character("c", "C", "")];

  expect(names(inOrder(characters, [CharacterId.make("c"), CharacterId.make("a")]))).toEqual([
    "C",
    "A",
    "B",
  ]);
});

test("night actions, not the text, decide whether a night opening is starred", () => {
  const characters = [
    // Written without the "*", but it skips the First Night.
    character("monk", "Monk", "Each night, choose a player: they are safe from the Demon."),
    character(
      "empath",
      "Empath",
      "Each night*, you learn how many neighbours are evil, at length.",
    ),
    character("chef", "Chef", "At night, learn something."),
    // Acts on neither night: the text decides.
    character("ghost", "Ghost", "Each night*, x."),
    character("seer", "Seer", "Once per game, at night, choose a player."),
  ];

  const nightOrders = {
    firstNight: ["dusk", CharacterId.make("empath"), CharacterId.make("chef"), "dawn"],
    otherNight: [
      "dusk",
      CharacterId.make("monk"),
      CharacterId.make("empath"),
      CharacterId.make("seer"),
      "dawn",
    ],
  } as const;

  expect(names(sortCharacters(characters, "standard", nightOrders))).toEqual([
    "Chef",
    "Empath",
    "Ghost",
    "Monk",
    "Seer",
  ]);
  // Without the Night Orders, only the text counts.
  expect(names(sortCharacters(characters, "standard"))).toEqual([
    "Chef",
    "Monk",
    "Ghost",
    "Empath",
    "Seer",
  ]);
});
