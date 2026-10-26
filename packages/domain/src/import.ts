import { Result, Schema } from "effect";
import { AuthoredTeam, Character, CharacterId } from "./character.ts";
import { Jinx, JinxExplanation, jinxPair } from "./jinx.ts";
import { NIGHT_STEPS, NightOrder, NightOrders, nightOrderProblem, type Night } from "./night.ts";
import { ScriptDetails } from "./script.ts";
import {
  ScriptExportProblem,
  botcDocument,
  botcSchemaProblems,
  scriptExportProblems,
} from "./export.ts";

// These integration values follow the pinned BOTC schema. They have no authoring controls.
export const ImportedSpecial = Schema.Struct({
  type: Schema.Literals(["selection", "ability", "signal", "vote", "reveal", "player", "reminder"]),
  name: Schema.Literals([
    "grimoire",
    "pointing",
    "ghost-votes",
    "distribute-roles",
    "bag-disabled",
    "bag-duplicate",
    "evil-duplicate",
    "good-duplicate",
    "multiplier",
    "hidden",
    "replace-character",
    "player",
    "card",
    "open-eyes",
    "public",
  ]),
  value: Schema.optionalKey(
    Schema.Union([Schema.String.check(Schema.isMaxLength(50)), Schema.Finite]),
  ),
  time: Schema.optionalKey(
    Schema.Literals([
      "pregame",
      "day",
      "night",
      "firstNight",
      "firstDay",
      "otherNight",
      "otherDay",
    ]),
  ),
  global: Schema.optionalKey(
    Schema.Literals(["townsfolk", "outsider", "minion", "demon", "traveller", "dead"]),
  ),
});

export const ImportedCharacterData = Schema.Struct({
  id: CharacterId,
  edition: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(50))),
  special: Schema.optionalKey(Schema.Array(ImportedSpecial)),
});

export const ImportedMetadata = Schema.Struct({
  hideTitle: Schema.optionalKey(Schema.Boolean),
  almanac: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(250))),
  bootlegger: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(10))),
});

export const ImportedArtwork = Schema.Struct({
  // An absent Character ID identifies Script artwork. Sources are owner-only.
  characterId: Schema.optionalKey(CharacterId),
  field: Schema.Literals(["image", "logo", "background"]),
  format: Schema.Literals(["single", "array"]),
  slots: Schema.Array(
    Schema.Struct({ source: Schema.String, state: Schema.Literals(["pending", "failed"]) }),
  ),
});

export const ImportedData = Schema.Struct({
  metadata: ImportedMetadata,
  characters: Schema.Array(ImportedCharacterData),
  artwork: Schema.Array(ImportedArtwork),
});

export interface ImportedData extends Schema.Schema.Type<typeof ImportedData> {}

export const ImportDraft = Schema.Struct({
  script: ScriptDetails,
  characters: Schema.Array(Character),
  nightOrders: NightOrders,
  jinxes: Schema.Array(Jinx),
  imported: ImportedData,
});

export interface ImportDraft extends Schema.Schema.Type<typeof ImportDraft> {}

export const ImportReview = Schema.Struct({
  draft: Schema.NullOr(ImportDraft),
  errors: Schema.Array(Schema.String),
  discarded: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String),
  blockers: Schema.Array(ScriptExportProblem),
});

export interface ImportReview extends Schema.Schema.Type<typeof ImportReview> {}

export class ScriptImportInvalid extends Schema.TaggedError<
  ScriptImportInvalid,
  { readonly brand: unique symbol }
>()("ScriptImportInvalid", { messages: Schema.Array(Schema.String) }) {}

export const ImportJson = Schema.String.check(Schema.isMaxLength(2_000_000));

const InputCharacter = Schema.Struct({
  id: CharacterId,
  name: Character.fields.name,
  team: AuthoredTeam,
  ability: Character.fields.ability,
  firstNight: Schema.optionalKey(Schema.Finite),
  otherNight: Schema.optionalKey(Schema.Finite),
  firstNightReminder: Schema.optionalKey(Character.fields.firstNightInstructions),
  otherNightReminder: Schema.optionalKey(Character.fields.otherNightInstructions),
  reminders: Schema.optionalKey(Character.fields.reminders),
  remindersGlobal: Schema.optionalKey(Character.fields.remindersGlobal),
  setup: Schema.optionalKey(Schema.Boolean),
  flavor: Schema.optionalKey(Character.fields.flavor),
  image: Schema.optionalKey(
    Schema.Union([
      Schema.String,
      Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(3)),
    ]),
  ),
  edition: ImportedCharacterData.fields.edition,
  special: ImportedCharacterData.fields.special,
  jinxes: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: CharacterId, reason: JinxExplanation })),
  ),
});

const InputMetadata = Schema.Struct({
  id: Schema.Literal("_meta"),
  name: ScriptDetails.fields.name,
  author: Schema.optionalKey(ScriptDetails.fields.authorCredit),
  firstNight: Schema.optionalKey(NightOrder),
  otherNight: Schema.optionalKey(NightOrder),
  logo: Schema.optionalKey(Schema.String),
  background: Schema.optionalKey(Schema.String),
  ...ImportedMetadata.fields,
});

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
const decodeObject = Schema.decodeUnknownResult(JsonObject);

const decodeEntries = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Array(Schema.Unknown).check(Schema.isMaxLength(201))),
);

const isString = Schema.is(Schema.String);
const uri = Schema.is(Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9+.-]*:[^\s]+$/i)));

// Unknown input is confined to the JSON parser boundary and decoded before use.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const extras = (value: unknown, keys: ReadonlyArray<string>, path: string): Array<string> => {
  const result = decodeObject(value);

  return Result.isFailure(result)
    ? []
    : Object.keys(result.success).flatMap((key) => (keys.includes(key) ? [] : [`${path}.${key}`]));
};

/** Pure preflight, shared by review and server commit. Nothing is persisted here. */
export const reviewImport = (json: string, authorCredit: string): ImportReview => {
  const errors: Array<string> = [];
  const discarded: Array<string> = [];
  const warnings: Array<string> = [];
  const failed = (): ImportReview => ({ draft: null, errors, discarded, warnings, blockers: [] });
  const parsed = decodeEntries(json);

  if (Result.isFailure(parsed)) {
    errors.push("Choose valid JSON containing an array of at most 201 entries.");

    return failed();
  }

  const input: Array<typeof InputCharacter.Type> = [];
  let metadata: typeof InputMetadata.Type | undefined;

  parsed.success.forEach((entry, index) => {
    const path = `Entry ${index + 1}`;
    const object = decodeObject(entry);

    if (Result.isFailure(object)) {
      errors.push(`${path}: Official Character references and non-object entries are unsupported.`);

      return;
    }

    if (object.success.id !== "_meta" && Object.keys(object.success).every((key) => key === "id")) {
      errors.push(
        `${path}: Official Character references are unsupported. Supply a complete Custom Character object.`,
      );

      return;
    }

    const meta = object.success.id === "_meta";
    discarded.push(
      ...extras(entry, Object.keys(meta ? InputMetadata.fields : InputCharacter.fields), path),
    );

    if (meta) {
      const result = Schema.decodeUnknownResult(InputMetadata)(entry);

      if (Result.isFailure(result)) {
        errors.push(`${path}: ${result.failure.message}`);

        return;
      }

      if (Result.isSuccess(result)) {
        if (metadata !== undefined) errors.push(`${path}: Only one _meta entry is allowed.`);
        metadata = result.success;
      }
    } else {
      const result = Schema.decodeUnknownResult(InputCharacter)(entry);

      if (Result.isFailure(result)) {
        errors.push(`${path}: ${result.failure.message}`);

        return;
      }

      if (Result.isSuccess(result)) {
        input.push(result.success);
        result.success.special?.forEach((_, slot) => {
          // Inspect original nested objects so decoding cannot silently lose extras.
          const raw = Schema.decodeUnknownResult(Schema.Array(Schema.Unknown))(
            object.success.special,
          );

          if (Result.isSuccess(raw))
            discarded.push(
              ...extras(
                raw.success[slot],
                Object.keys(ImportedSpecial.fields),
                `${path}.special[${slot}]`,
              ),
            );
        });

        const rawJinxes = Schema.decodeUnknownResult(Schema.Array(Schema.Unknown))(
          object.success.jinxes,
        );

        if (Result.isSuccess(rawJinxes))
          rawJinxes.success.forEach((jinx, slot) =>
            discarded.push(...extras(jinx, ["id", "reason"], `${path}.jinxes[${slot}]`)),
          );
      }
    }
  });
  const ids = input.map((character) => character.id);

  for (const id of ids) {
    if (ids.filter((candidate) => candidate === id).length > 1)
      errors.push(`Duplicate Character ID “${id}”. Give each Character a unique ID.`);

    if (Schema.is(Schema.Literals(["dusk", "dawn", "minioninfo", "demoninfo"]))(id))
      errors.push(`Character ID “${id}” is reserved for a standard night step.`);
  }

  const characters = input.map((character) =>
    Character.make({
      id: character.id,
      name: character.name,
      team: character.team,
      ability: character.ability,
      firstNightInstructions: character.firstNightReminder ?? "",
      otherNightInstructions: character.otherNightReminder ?? "",
      reminders: character.reminders ?? [],
      remindersGlobal: character.remindersGlobal ?? [],
      setup: character.setup ?? false,
      flavor: character.flavor ?? "",
    }),
  );

  const order = (night: Night) => {
    const explicit = metadata?.[night];

    if (explicit !== undefined) {
      const problem = nightOrderProblem(night, explicit, ids);

      if (problem)
        errors.push(
          `${night}: ${problem} Explicit orders must include every standard step exactly once and only known Character IDs.`,
        );

      return explicit;
    }

    const members = input
      .flatMap((character) => {
        const priority = character[night];

        return priority !== undefined && priority > 0 ? [{ id: character.id, priority }] : [];
      })
      .sort((a, b) => a.priority - b.priority)
      .map(({ id }) => id);

    const steps = NIGHT_STEPS[night];

    return [...steps.slice(0, -1), ...members, "dawn"] as const;
  };

  const nightOrders = { firstNight: order("firstNight"), otherNight: order("otherNight") };
  const jinxes: Array<Jinx> = [];

  for (const character of input)
    for (const jinx of character.jinxes ?? []) {
      if (jinx.id === character.id || !ids.includes(jinx.id)) {
        errors.push(
          `Jinx from “${character.id}” must reference a different Character on this Script: “${jinx.id}”.`,
        );
        continue;
      }

      const pair = jinxPair(character.id, jinx.id);

      const previous = jinxes.find(
        (candidate) => candidate.first === pair.first && candidate.second === pair.second,
      );

      if (previous !== undefined) {
        if (previous.explanation !== jinx.reason)
          errors.push(`Conflicting Jinx explanations for “${pair.first}” and “${pair.second}”.`);
      } else jinxes.push({ first: pair.first, second: pair.second, explanation: jinx.reason });
    }

  const artwork: Array<typeof ImportedArtwork.Type> = [];

  const addArtwork = (
    sources: string | ReadonlyArray<string> | undefined,
    field: typeof ImportedArtwork.Type.field,
    characterId?: CharacterId,
  ) => {
    if (sources === undefined) return;
    const single = isString(sources);
    const slots = single ? [sources] : sources;
    const valid = slots.every(uri);

    const reference = {
      field,
      format: single ? ("single" as const) : ("array" as const),
      slots: slots.map((source) => ({
        source,
        state: uri(source) ? ("pending" as const) : ("failed" as const),
      })),
    };

    artwork.push(characterId === undefined ? reference : { ...reference, characterId });
    warnings.push(
      `${characterId ?? "Script"} ${field}: ${valid ? "pending artwork copy" : "invalid artwork reference"}. ${field === "image" ? "Generic icons are used" : "Artwork is omitted"} until repaired; external images are not fetched.`,
    );
  };

  input.forEach((character) => addArtwork(character.image, "image", character.id));
  addArtwork(metadata?.logo, "logo");
  addArtwork(metadata?.background, "background");

  if (metadata === undefined)
    warnings.push("No metadata: using “Imported Script” and your current Author Credit.");
  else if (metadata.author === undefined)
    warnings.push("No author supplied: using your current Author Credit.");

  if (errors.length) return failed();

  const draft = ImportDraft.make({
    script: {
      name: metadata?.name ?? "Imported Script",
      authorCredit: metadata?.author ?? authorCredit,
    },
    characters,
    nightOrders,
    jinxes,
    imported: {
      metadata: metadata === undefined ? {} : Schema.decodeSync(ImportedMetadata)(metadata),
      characters: input.map((character) => Schema.decodeSync(ImportedCharacterData)(character)),
      artwork,
    },
  });

  const blockers = [...scriptExportProblems(draft)];

  if (blockers.length === 0)
    blockers.push(...botcSchemaProblems(botcDocument(draft, "https://assets.invalid")));

  return { draft, errors, discarded, warnings, blockers };
};
