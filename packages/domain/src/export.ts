import { textLength } from "./text.ts";
import { Result, Schema } from "effect";
import { exportBlockers, genericIcons, type Character } from "./character.ts";
import { jinxExportBlockers, jinxPair, type Jinx } from "./jinx.ts";
import { NIGHTS, nightOrderProblem, type NightOrders } from "./night.ts";
import type { ScriptDetails } from "./script.ts";
import { decodeBotcDocument } from "./schemas/botc.ts";

export const BOTC_SCHEMA_REVISION = "f10cd02e3401af227ce406287eaae7bb99a06a42";

export const ScriptExportProblem = Schema.Struct({
  // Character IDs stay strings here so even an invalid ID can be reported.
  characterId: Schema.optionalKey(Schema.String),
  field: Schema.String,
  tokenIndex: Schema.optionalKey(Schema.Finite),
  otherCharacterId: Schema.optionalKey(Schema.String),
  message: Schema.String,
});

export interface ScriptExportProblem extends Schema.Schema.Type<typeof ScriptExportProblem> {}

export class ScriptExportInvalid extends Schema.TaggedError<
  ScriptExportInvalid,
  { readonly brand: unique symbol }
>()("ScriptExportInvalid", { problems: Schema.Array(ScriptExportProblem) }) {}

export interface ScriptExportSource {
  readonly script: ScriptDetails;
  readonly characters: ReadonlyArray<Character>;
  readonly nightOrders: NightOrders;
  readonly jinxes: ReadonlyArray<Jinx>;
}

export const scriptExportProblems = ({
  script,
  characters,
  nightOrders,
  jinxes,
}: ScriptExportSource): ReadonlyArray<ScriptExportProblem> => {
  const problems: Array<ScriptExportProblem> = [
    ...exportBlockers(characters),
    ...jinxExportBlockers(jinxes),
  ];

  if (!script.name.trim()) problems.push({ field: "name", message: "Enter a Script name." });

  for (const field of ["name", "authorCredit"] as const)
    if (textLength(script[field]) > 50)
      problems.push({ field, message: "Use 50 characters or fewer." });

  if (characters.length < 4 || characters.length > 200)
    problems.push({ field: "characters", message: "Include between 4 and 200 Characters." });
  const ids = characters.map((c) => c.id);

  for (const character of characters) {
    if (
      !/^[a-z0-9]{1,50}$/.test(character.id) ||
      ids.filter((id) => id === character.id).length !== 1
    )
      problems.push({
        characterId: character.id,
        field: "id",
        message:
          "Character IDs must be unique lowercase alphanumeric IDs of at most 50 characters.",
      });

    if (!["townsfolk", "outsider", "minion", "demon", "traveller"].includes(character.team))
      problems.push({
        characterId: character.id,
        field: "team",
        message: "Choose a supported Team.",
      });
  }

  for (const night of NIGHTS) {
    const message = nightOrderProblem(night, nightOrders[night], ids);

    if (message) problems.push({ field: night, message });

    if (nightOrders[night].length > 200)
      problems.push({ field: night, message: "Use 200 night entries or fewer." });
  }

  const pairs = new Set<string>();

  for (const jinx of jinxes) {
    const pair = jinxPair(jinx.first, jinx.second);
    const key = `${pair.first}:${pair.second}`;

    if (
      pair.first === pair.second ||
      !ids.includes(pair.first) ||
      !ids.includes(pair.second) ||
      pairs.has(key)
    )
      problems.push({
        characterId: jinx.first,
        field: "jinx",
        message: "Each Jinx must connect two distinct Characters on this Script, once per pair.",
      });
    pairs.add(key);
  }

  return problems;
};

export const botcDocument = (
  { script, characters, nightOrders, jinxes }: ScriptExportSource,
  assetOrigin: string,
) => [
  {
    id: "_meta",
    name: script.name,
    author: script.authorCredit,
    firstNight: nightOrders.firstNight,
    otherNight: nightOrders.otherNight,
  },
  ...characters.map((character) => ({
    id: character.id,
    name: character.name,
    team: character.team,
    ability: character.ability,
    image: genericIcons(character.team).map((icon) => new URL(icon.path, assetOrigin).href),
    reminders: character.reminders,
    remindersGlobal: character.remindersGlobal,
    setup: character.setup,
    flavor: character.flavor,
    firstNightReminder: character.firstNightInstructions,
    otherNightReminder: character.otherNightInstructions,
    firstNight: nightOrders.firstNight.indexOf(character.id) + 1,
    otherNight: nightOrders.otherNight.indexOf(character.id) + 1,
    jinxes: jinxes
      .flatMap((jinx) => {
        const pair = jinxPair(jinx.first, jinx.second);

        return pair.first === character.id ? [{ id: pair.second, reason: jinx.explanation }] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  })),
];

/** Validate the complete document against the pinned official schema. */
// This function is the parser boundary for the pinned external JSON schema.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export const botcSchemaProblems = (document: unknown): ReadonlyArray<ScriptExportProblem> => {
  const result = decodeBotcDocument(document);

  return Result.isSuccess(result) ? [] : [{ field: "schema", message: result.failure.message }];
};
