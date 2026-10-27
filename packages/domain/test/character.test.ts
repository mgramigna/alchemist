import {
  explanationBlocker,
  flavorBlocker,
  reminderLabelBlocker,
  textLength,
} from "../src/index.ts";
import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  AuthoredTeam,
  CharacterId,
  Team,
  abilityBlocker,
  exportBlockers,
  genericIcons,
  instructionsBlocker,
  nameBlocker,
} from "../src/index.ts";

const instructions = (firstNightInstructions: string, otherNightInstructions: string) => ({
  reminders: [],
  remindersGlobal: [],
  flavor: "",
  firstNightInstructions,
  otherNightInstructions,
});

const id = (n: number) => CharacterId.make(`01k8ae1000000000000000000${n}`);

test("Fabled and Loric are recognized Teams but cannot be authored", () => {
  expect(Schema.is(Team)("fabled")).toBe(true);
  expect(Schema.is(Team)("loric")).toBe(true);
  expect(Schema.is(AuthoredTeam)("fabled")).toBe(false);
  expect(Schema.is(AuthoredTeam)("loric")).toBe(false);
  expect(AuthoredTeam.literals).toEqual(["townsfolk", "outsider", "minion", "demon", "traveller"]);
});

test("name and ability blockers report blanks, export limits and trimmed case-insensitive duplicates", () => {
  expect(nameBlocker("  ", [])).toBe("Enter a name.");
  expect(nameBlocker("x".repeat(31), [])).toBe("Use 30 characters or fewer.");
  expect(nameBlocker("x".repeat(30), [])).toBeUndefined();
  expect(nameBlocker(" Imp ", ["imp"])).toBe(
    "Another Character has this name. Names must be unique.",
  );
  expect(abilityBlocker("")).toBe("Enter an ability.");
  expect(abilityBlocker("x".repeat(251))).toBe("Use 250 characters or fewer.");
  expect(abilityBlocker("x".repeat(250))).toBeUndefined();
});

test("a duplicate name blocks export on both Characters", () => {
  const blockers = exportBlockers([
    { id: id(1), name: "Imp", ability: "Kills", ...instructions("", "") },
    { id: id(2), name: "imp ", ability: "", ...instructions("", "") },
  ]);

  expect(blockers.map((blocker) => [blocker.characterId, blocker.field])).toEqual([
    [id(1), "name"],
    [id(2), "name"],
    [id(2), "ability"],
  ]);
});

test("blank Night Instructions are allowed; over-limit instructions block export per night", () => {
  expect(instructionsBlocker("")).toBeUndefined();
  expect(instructionsBlocker("x".repeat(500))).toBeUndefined();
  expect(instructionsBlocker("x".repeat(501))).toBe("Use 500 characters or fewer.");

  const blockers = exportBlockers([
    { id: id(1), name: "Imp", ability: "Kills", ...instructions("", "x".repeat(501)) },
  ]);

  expect(blockers).toEqual([
    {
      characterId: id(1),
      field: "otherNightInstructions",
      message: "Use 500 characters or fewer.",
    },
  ]);
});

test("generic icons are regular/flipped by default Alignment, or unaligned/Good/Evil for Travellers", () => {
  expect(genericIcons("townsfolk")).toEqual([
    { variant: "regular", path: "/icons/generic/v1/townsfolk-good.svg" },
    { variant: "flipped", path: "/icons/generic/v1/townsfolk-evil.svg" },
  ]);
  expect(genericIcons("demon")).toEqual([
    { variant: "regular", path: "/icons/generic/v1/demon-evil.svg" },
    { variant: "flipped", path: "/icons/generic/v1/demon-good.svg" },
  ]);
  expect(genericIcons("traveller")).toEqual([
    { variant: "unaligned", path: "/icons/generic/v1/traveller-unaligned.svg" },
    { variant: "good", path: "/icons/generic/v1/traveller-good.svg" },
    { variant: "evil", path: "/icons/generic/v1/traveller-evil.svg" },
  ]);
});

test("token lists validate independently, allow duplicates and retain positions in the shared blockers", () => {
  const draft = {
    id: id(1),
    name: "Imp",
    ability: "Kills",
    ...instructions("", ""),
    reminders: ["Dead", "Dead", " ", "x".repeat(31)],
    remindersGlobal: ["x".repeat(26), ...Array.from({ length: 20 }, () => "Drunk")],
    flavor: "x".repeat(501),
  };

  expect(exportBlockers([draft])).toEqual([
    { characterId: id(1), field: "reminders", tokenIndex: 2, message: "Enter a token label." },
    {
      characterId: id(1),
      field: "reminders",
      tokenIndex: 3,
      message: "Use 30 characters or fewer.",
    },
    { characterId: id(1), field: "remindersGlobal", message: "Use 20 tokens or fewer." },
    {
      characterId: id(1),
      field: "remindersGlobal",
      tokenIndex: 0,
      message: "Use 25 characters or fewer.",
    },
    { characterId: id(1), field: "flavor", message: "Use 500 characters or fewer." },
  ]);
  expect(
    exportBlockers([
      {
        ...draft,
        reminders: Array.from({ length: 20 }, () => "x".repeat(30)),
        remindersGlobal: Array.from({ length: 20 }, () => "x".repeat(25)),
        flavor: "x".repeat(500),
      },
    ]),
  ).toEqual([]);
  expect(exportBlockers([{ ...draft, reminders: [], remindersGlobal: [], flavor: "" }])).toEqual(
    [],
  );
});

test("field blockers use the official schema's Unicode code-point lengths", () => {
  expect(textLength("😀")).toBe(1);
  expect(textLength("e\u0301")).toBe(2); // Code points, not grapheme clusters.

  for (const [limit, blocker] of [
    [30, (value: string) => nameBlocker(value, [])],
    [250, abilityBlocker],
    [500, instructionsBlocker],
    [500, flavorBlocker],
    [500, explanationBlocker],
    [30, (value: string) => reminderLabelBlocker(value, "reminders")],
    [25, (value: string) => reminderLabelBlocker(value, "remindersGlobal")],
  ] as const) {
    expect(blocker("😀".repeat(limit))).toBeUndefined();
    expect(blocker("😀".repeat(limit + 1))).toBe(`Use ${limit} characters or fewer.`);
  }
});
