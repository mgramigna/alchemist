import {
  ArtworkStyle,
  ArtworkVariant,
  AuthoredTeam,
  SOURCE_TYPES,
  ImportedData,
  ReminderTokens,
  Jinx,
  Character,
  CharacterId,
  NIGHT_STEPS,
  Night,
  NightStep,
  OwnedScript,
  PublicCharacter,
  PublicScript,
  ScriptId,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
  isNightStep,
  type NightEntry,
  type NightOrder,
  type NightOrders,
} from "@alchemist/domain";
import { D1Client } from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { ScriptStore, type StoredArtwork } from "./scripts.ts";

const ScriptRow = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  author_credit: Schema.String,
});

const OwnedRows = Schema.Array(OwnedScript);

const JinxRows = Schema.Array(Jinx);

const StoredCharacter = Schema.Struct({
  ...Character.fields,
  reminders: Schema.fromJsonString(ReminderTokens),
  remindersGlobal: Schema.fromJsonString(ReminderTokens),
  setup: Schema.Literals([0, 1]),
});

const CharacterRows = Schema.Array(StoredCharacter);

const ArtworkRows = Schema.Array(
  Schema.Struct({
    characterId: CharacterId,
    sourceId: Schema.String,
    sourceType: Schema.Literals(SOURCE_TYPES),
    style: Schema.fromJsonString(ArtworkStyle),
    team: AuthoredTeam,
    variants: Schema.fromJsonString(Schema.Array(ArtworkVariant)),
  }),
);

const ARTWORK_COLUMNS = `character_id AS characterId, source_id AS sourceId, source_type AS sourceType, style, team, variants`;

const decodeArtwork = (rows: ReadonlyArray<object>) =>
  Schema.decodeUnknownEffect(ArtworkRows)(rows).pipe(
    Effect.map(
      (decoded) =>
        new Map(
          decoded.map(({ characterId, ...artwork }): [CharacterId, StoredArtwork] => [
            characterId,
            artwork,
          ]),
        ),
    ),
  );

// Owners see the style and source ID; the private original's format stays in storage.
const decodeCharacters = (rows: ReadonlyArray<object>, artworkRows: ReadonlyArray<object> = []) =>
  Effect.gen(function* () {
    const characters = yield* Schema.decodeUnknownEffect(CharacterRows)(rows);
    const artwork = yield* decodeArtwork(artworkRows);

    return characters.map(({ setup, ...character }) => {
      const stored = artwork.get(character.id);

      const decoded = { ...character, setup: setup === 1 };

      return stored === undefined
        ? decoded
        : {
            ...decoded,
            artwork: {
              team: stored.team,
              variants: stored.variants,
              sourceId: stored.sourceId,
              style: stored.style,
            },
          };
    });
  });

const CHARACTER_COLUMNS = `id, name, ability, team,
  first_night_instructions AS firstNightInstructions,
  other_night_instructions AS otherNightInstructions, reminders, reminders_global AS remindersGlobal, setup, flavor`;

const NightEntryRows = Schema.Array(
  Schema.Struct({
    night: Night,
    step: Schema.NullOr(NightStep),
    character_id: Schema.NullOr(CharacterId),
  }),
);

// Rows arrive ordered by position.
const nightOrders = (rows: typeof NightEntryRows.Type): NightOrders => {
  const order = (night: Night) =>
    rows.flatMap((row): ReadonlyArray<NightEntry> => {
      const entry = row.step ?? row.character_id;

      return row.night === night && entry !== null ? [entry] : [];
    });

  return { firstNight: order("firstNight"), otherNight: order("otherNight") };
};

// Each entry becomes a step or a Character reference, positioned by array index.
const entriesJson = (order: ReadonlyArray<NightEntry>) =>
  JSON.stringify(
    order.map((entry) =>
      isNightStep(entry) ? { step: entry, character: null } : { step: null, character: entry },
    ),
  );

const owned = (rows: ReadonlyArray<object>) =>
  Schema.decodeUnknownEffect(OwnedRows)(rows).pipe(
    Effect.map((decoded) => Option.fromNullishOr(decoded[0])),
  );

const firstCharacter = (rows: ReadonlyArray<object>, artworkRows?: ReadonlyArray<object>) =>
  decodeCharacters(rows, artworkRows).pipe(
    Effect.map((decoded) => Option.fromNullishOr(decoded[0])),
  );

// The cause is dropped from the domain error, so record it here.
const readUnavailable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapCause(Effect.logError),
    Effect.mapError(() => new ScriptReadUnavailable({})),
  );

const writeUnavailable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapCause(Effect.logError),
    Effect.mapError(() => new ScriptWriteUnavailable({})),
  );

export const D1ScriptStore = Layer.effect(
  ScriptStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // D1's atomic batch is a driver extension; SqlClient has no equivalent.
    // Both tags come from the same D1 layer.
    const d1 = yield* D1Client;

    // Statements that replace one night's order, only if the owner owns the
    // Script. A Character from another Script violates the entry's foreign key,
    // failing the whole batch.
    const writeNightOrder = (
      ownerId: string,
      scriptId: ScriptId,
      night: Night,
      order: NightOrder,
    ) =>
      [
        sql`DELETE FROM night_order_entries
      WHERE script_id = ${scriptId} AND night = ${night}
        AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`,
        sql`INSERT INTO night_order_entries (script_id, night, position, step, character_id)
      SELECT s.id, ${night}, e.key, json_extract(e.value, '$.step'), json_extract(e.value, '$.character')
      FROM scripts s, json_each(${entriesJson(order)}) e
      WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId}`,
      ] as const;

    const selectNightOrders = (ownerId: string, scriptId: ScriptId) =>
      sql`SELECT e.night, e.step, e.character_id FROM night_order_entries e
      JOIN scripts s ON s.id = e.script_id
      WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId}
      ORDER BY e.night, e.position`;

    const selectArtwork = (ownerId: string, scriptId: ScriptId) =>
      sql`SELECT ${sql.literal(ARTWORK_COLUMNS)} FROM character_artwork
      WHERE script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`;

    return ScriptStore.of({
      findArtwork: Effect.fn("D1ScriptStore.findArtwork")(function* (ownerId, scriptId, id) {
        const [characters, artwork] = yield* d1.batch([
          sql`SELECT c.team FROM characters c JOIN scripts s ON s.id = c.script_id
          WHERE c.id = ${id} AND s.id = ${scriptId} AND s.owner_id = ${ownerId}`,
          sql`SELECT ${sql.literal(ARTWORK_COLUMNS)} FROM character_artwork
          WHERE character_id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`,
        ]);

        const team = (yield* Schema.decodeEffect(
          Schema.Array(Schema.Struct({ team: AuthoredTeam })),
        )(characters))[0]?.team;

        if (team === undefined) return Option.none();

        return Option.some({ team, artwork: (yield* decodeArtwork(artwork)).get(id) ?? null });
      }, readUnavailable),
      replaceArtwork: Effect.fn("D1ScriptStore.replaceArtwork")(function* (
        ownerId,
        scriptId,
        id,
        artwork,
        expectedSourceId,
        now,
      ) {
        const values = {
          source: artwork.sourceId,
          type: artwork.sourceType,
          style: JSON.stringify(artwork.style),
          variants: JSON.stringify(artwork.variants),
        };

        // Insert only when no artwork exists yet; otherwise update only the
        // expected original. Either way the owner's Character must exist.
        const write =
          expectedSourceId === null
            ? sql`INSERT INTO character_artwork (script_id, character_id, source_id, source_type, style, team, variants)
              SELECT c.script_id, c.id, ${values.source}, ${values.type}, ${values.style}, ${artwork.team}, ${values.variants}
              FROM characters c JOIN scripts s ON s.id = c.script_id
              WHERE c.id = ${id} AND s.id = ${scriptId} AND s.owner_id = ${ownerId}
              ON CONFLICT (script_id, character_id) DO NOTHING RETURNING character_id`
            : sql`UPDATE character_artwork SET source_id = ${values.source}, source_type = ${values.type},
                style = ${values.style}, team = ${artwork.team}, variants = ${values.variants}
              WHERE character_id = ${id} AND source_id = ${expectedSourceId}
                AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
              RETURNING character_id`;

        const [rows] = yield* d1.batch([
          write,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${scriptId} AND owner_id = ${ownerId} AND changes() > 0`,
          // Uploaded artwork supersedes an imported image reference awaiting repair.
          sql`UPDATE script_imports SET data = json_set(data, '$.artwork', json(COALESCE((
            SELECT json_group_array(json(value)) FROM json_each(script_imports.data, '$.artwork')
            WHERE NOT (json_extract(value, '$.field') = 'image' AND json_extract(value, '$.characterId') IS ${id})
          ), '[]'))) WHERE script_id = ${scriptId} AND changes() > 0`,
        ]);

        return rows.length > 0;
      }, writeUnavailable),
      deleteArtwork: Effect.fn("D1ScriptStore.deleteArtwork")(function* (
        ownerId,
        scriptId,
        id,
        now,
      ) {
        const [rows] = yield* d1.batch([
          sql`DELETE FROM character_artwork WHERE character_id = ${id}
            AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
            RETURNING character_id`,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${scriptId} AND owner_id = ${ownerId} AND changes() > 0`,
        ]);

        return rows.length > 0;
      }, writeUnavailable),
      useGenericArtwork: Effect.fn("D1ScriptStore.useGenericArtwork")(function* (
        ownerId,
        id,
        field,
        characterId,
        now,
      ) {
        const [rows] = yield* d1.batch([
          sql`UPDATE script_imports SET data = json_set(data, '$.artwork', json(COALESCE((
            SELECT json_group_array(json(value)) FROM json_each(script_imports.data, '$.artwork')
            WHERE NOT (json_extract(value, '$.field') = ${field} AND json_extract(value, '$.characterId') IS ${characterId})
          ), '[]'))) WHERE script_id IN (SELECT id FROM scripts WHERE id = ${id} AND owner_id = ${ownerId}) RETURNING script_id`,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${id} AND owner_id = ${ownerId} AND changes() > 0`,
        ]);

        return rows.length > 0;
      }, writeUnavailable),
      insertImport: Effect.fn("D1ScriptStore.insertImport")(function* (ownerId, script, draft) {
        // One atomic D1 batch, including the final integration/artwork write.
        yield* d1.batch([
          sql`INSERT INTO scripts (id, owner_id, name, author_credit, created_at, updated_at)
            VALUES (${script.id}, ${ownerId}, ${script.name}, ${script.authorCredit}, ${script.updatedAt}, ${script.updatedAt})`,
          sql`INSERT INTO characters (id, script_id, name, ability, team, first_night_instructions, other_night_instructions, reminders, reminders_global, setup, flavor)
            SELECT json_extract(value, '$.id'), ${script.id}, json_extract(value, '$.name'), json_extract(value, '$.ability'), json_extract(value, '$.team'),
              json_extract(value, '$.firstNightInstructions'), json_extract(value, '$.otherNightInstructions'),
              json_extract(value, '$.reminders'), json_extract(value, '$.remindersGlobal'), json_extract(value, '$.setup'), json_extract(value, '$.flavor')
            FROM json_each(${JSON.stringify(draft.characters)})`,
          ...writeNightOrder(ownerId, script.id, "firstNight", draft.nightOrders.firstNight),
          ...writeNightOrder(ownerId, script.id, "otherNight", draft.nightOrders.otherNight),
          sql`INSERT INTO jinxes (script_id, first, second, explanation)
            SELECT ${script.id}, json_extract(value, '$.first'), json_extract(value, '$.second'), json_extract(value, '$.explanation')
            FROM json_each(${JSON.stringify(draft.jinxes)})`,
          sql`INSERT INTO script_imports (script_id, data) VALUES (${script.id}, ${JSON.stringify(draft.imported)})`,
        ]);
      }, writeUnavailable),
      readImported: Effect.fn("D1ScriptStore.readImported")(function* (ownerId, scriptId) {
        const rows =
          yield* sql`SELECT i.data FROM script_imports i JOIN scripts s ON s.id = i.script_id WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId}`;

        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ data: Schema.fromJsonString(ImportedData) })),
        )(rows);

        return decoded[0]?.data ?? null;
      }, readUnavailable),
      findExport: Effect.fn("D1ScriptStore.findExport")(function* (id) {
        const [scripts, characters, entries, jinxes, imports] = yield* d1.batch([
          sql`SELECT id, name, author_credit FROM scripts WHERE id = ${id}`,
          sql`SELECT ${sql.literal(CHARACTER_COLUMNS)} FROM characters WHERE script_id = ${id} ORDER BY id`,
          sql`SELECT night, step, character_id FROM night_order_entries WHERE script_id = ${id} ORDER BY night, position`,
          sql`SELECT first, second, explanation FROM jinxes WHERE script_id = ${id} ORDER BY first, second`,
          sql`SELECT data FROM script_imports WHERE script_id = ${id}`,
        ]);

        const row = (yield* Schema.decodeEffect(Schema.Array(ScriptRow))(scripts))[0];

        if (row === undefined) return Option.none();

        const imported = yield* Schema.decodeEffect(
          Schema.Array(Schema.Struct({ data: Schema.fromJsonString(ImportedData) })),
        )(imports);

        return Option.some({
          script: { name: row.name, authorCredit: row.author_credit },
          characters: yield* decodeCharacters(characters),
          nightOrders: nightOrders(yield* Schema.decodeEffect(NightEntryRows)(entries)),
          jinxes: yield* Schema.decodeEffect(JinxRows)(jinxes),
          imported: imported[0]?.data,
        });
      }, readUnavailable),
      findPublic: Effect.fn("D1ScriptStore.findPublic")(function* (id) {
        // One batch, so the Script and its Characters come from the same snapshot.
        const [scripts, characters, entries, jinxes, artworkRows] = yield* d1.batch([
          sql`SELECT id, name, author_credit FROM scripts WHERE id = ${id}`,
          sql`SELECT id, name, ability, team,
            first_night_instructions AS firstNightInstructions,
            other_night_instructions AS otherNightInstructions
          FROM characters WHERE script_id = ${id} ORDER BY id`,
          sql`SELECT night, step, character_id FROM night_order_entries
          WHERE script_id = ${id} ORDER BY night, position`,
          sql`SELECT first, second, explanation FROM jinxes WHERE script_id = ${id} ORDER BY first, second`,
          sql`SELECT ${sql.literal(ARTWORK_COLUMNS)} FROM character_artwork WHERE script_id = ${id}`,
        ]);

        const artwork = yield* decodeArtwork(artworkRows);

        const row = (yield* Schema.decodeEffect(Schema.Array(ScriptRow))(scripts))[0];

        if (row === undefined) return Option.none();

        return Option.some(
          PublicScript.make({
            id: row.id,
            name: row.name,
            authorCredit: row.author_credit,
            // Only the published variants and their Team: never the private original.
            characters: (yield* Schema.decodeEffect(Schema.Array(PublicCharacter))(characters)).map(
              (character) => {
                const stored = artwork.get(character.id);

                return stored === undefined
                  ? character
                  : { ...character, artwork: { team: stored.team, variants: stored.variants } };
              },
            ),
            nightOrders: nightOrders(yield* Schema.decodeUnknownEffect(NightEntryRows)(entries)),
            jinxes: yield* Schema.decodeEffect(JinxRows)(jinxes),
          }),
        );
      }, readUnavailable),
      insert: Effect.fn("D1ScriptStore.insert")(function* (ownerId, script) {
        yield* d1.batch([
          sql`INSERT INTO scripts (id, owner_id, name, author_credit, created_at, updated_at)
          VALUES (${script.id}, ${ownerId}, ${script.name}, ${script.authorCredit}, ${script.updatedAt}, ${script.updatedAt})`,
          ...writeNightOrder(ownerId, script.id, "firstNight", NIGHT_STEPS.firstNight),
          ...writeNightOrder(ownerId, script.id, "otherNight", NIGHT_STEPS.otherNight),
        ]);
      }, writeUnavailable),
      listOwned: Effect.fn("D1ScriptStore.listOwned")(function* (ownerId) {
        const rows =
          yield* sql`SELECT id, name, author_credit AS authorCredit, updated_at AS updatedAt
        FROM scripts WHERE owner_id = ${ownerId} ORDER BY updated_at DESC, id DESC`;

        return yield* Schema.decodeUnknownEffect(OwnedRows)(rows);
      }, readUnavailable),
      findOwned: Effect.fn("D1ScriptStore.findOwned")(function* (ownerId, id) {
        return yield* owned(
          yield* sql`SELECT id, name, author_credit AS authorCredit, updated_at AS updatedAt
          FROM scripts WHERE id = ${id} AND owner_id = ${ownerId}`,
        );
      }, readUnavailable),
      updateDetails: Effect.fn("D1ScriptStore.updateDetails")(function* (
        ownerId,
        id,
        details,
        now,
      ) {
        return yield* owned(
          yield* sql`UPDATE scripts SET name = ${details.name}, author_credit = ${details.authorCredit}, updated_at = ${now}
            WHERE id = ${id} AND owner_id = ${ownerId}
            RETURNING id, name, author_credit AS authorCredit, updated_at AS updatedAt`,
        );
      }, writeUnavailable),
      listCharacters: Effect.fn("D1ScriptStore.listCharacters")(function* (ownerId, scriptId) {
        const [characters, artwork] = yield* d1.batch([
          sql`SELECT c.id, c.name, c.ability, c.team,
            c.first_night_instructions AS firstNightInstructions,
            c.other_night_instructions AS otherNightInstructions, c.reminders, c.reminders_global AS remindersGlobal, c.setup, c.flavor
          FROM characters c
          JOIN scripts s ON s.id = c.script_id
          WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId} ORDER BY c.id`,
          selectArtwork(ownerId, scriptId),
        ]);

        return yield* decodeCharacters(characters, artwork);
      }, readUnavailable),
      insertCharacter: Effect.fn("D1ScriptStore.insertCharacter")(function* (
        ownerId,
        scriptId,
        character,
        orders,
        now,
      ) {
        const results = yield* d1.batch([
          sql`INSERT INTO characters (id, script_id, name, ability, team, first_night_instructions, other_night_instructions, reminders, reminders_global, setup, flavor)
          SELECT ${character.id}, id, ${character.name}, ${character.ability}, ${character.team},
            ${character.firstNightInstructions}, ${character.otherNightInstructions}, ${JSON.stringify(character.reminders)}, ${JSON.stringify(character.remindersGlobal)}, ${character.setup ? 1 : 0}, ${character.flavor}
          FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId}`,
          sql`UPDATE scripts SET updated_at = ${now}
          WHERE id = ${scriptId} AND owner_id = ${ownerId}`,
          ...writeNightOrder(ownerId, scriptId, "firstNight", orders.firstNight),
          ...writeNightOrder(ownerId, scriptId, "otherNight", orders.otherNight),
          sql`SELECT ${sql.literal(CHARACTER_COLUMNS)} FROM characters WHERE id = ${character.id} AND script_id = ${scriptId}`,
        ]);

        return yield* firstCharacter(results[6]);
      }, writeUnavailable),
      updateCharacter: Effect.fn("D1ScriptStore.updateCharacter")(function* (
        ownerId,
        scriptId,
        id,
        details,
        now,
      ) {
        const results = yield* d1.batch([
          sql`UPDATE scripts SET updated_at = ${now}
          WHERE id = ${scriptId} AND owner_id = ${ownerId}
            AND EXISTS (SELECT 1 FROM characters WHERE id = ${id} AND script_id = ${scriptId})`,
          sql`UPDATE characters SET name = ${details.name}, ability = ${details.ability}, team = ${details.team},
            first_night_instructions = ${details.firstNightInstructions},
            other_night_instructions = ${details.otherNightInstructions},
            reminders = ${JSON.stringify(details.reminders)}, reminders_global = ${JSON.stringify(details.remindersGlobal)},
            setup = ${details.setup ? 1 : 0}, flavor = ${details.flavor}
          WHERE id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
          RETURNING ${sql.literal(CHARACTER_COLUMNS)}`,
          selectArtwork(ownerId, scriptId),
        ]);

        return yield* firstCharacter(results[1], results[2]);
      }, writeUnavailable),
      deleteCharacter: Effect.fn("D1ScriptStore.deleteCharacter")(function* (
        ownerId,
        scriptId,
        id,
        now,
      ) {
        const results = yield* d1.batch([
          sql`UPDATE scripts SET updated_at = ${now}
          WHERE id = ${scriptId} AND owner_id = ${ownerId}
            AND EXISTS (SELECT 1 FROM characters WHERE id = ${id} AND script_id = ${scriptId})`,
          sql`DELETE FROM night_order_entries
          WHERE character_id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`,
          sql`DELETE FROM jinxes
          WHERE (first = ${id} OR second = ${id}) AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`,
          sql`DELETE FROM character_artwork
          WHERE character_id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})`,
          sql`DELETE FROM characters
          WHERE id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
          RETURNING id`,
        ]);

        return results[4].length > 0;
      }, writeUnavailable),
      listJinxes: Effect.fn("D1ScriptStore.listJinxes")(function* (ownerId, scriptId) {
        return yield* Schema.decodeUnknownEffect(JinxRows)(
          yield* sql`SELECT j.first, j.second, j.explanation FROM jinxes j JOIN scripts s ON s.id = j.script_id WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId} ORDER BY j.first, j.second`,
        );
      }, readUnavailable),
      insertJinx: Effect.fn("D1ScriptStore.insertJinx")(function* (ownerId, scriptId, jinx, now) {
        const [rows] = yield* d1.batch([
          sql`INSERT INTO jinxes (script_id, first, second, explanation)
          SELECT id, ${jinx.first}, ${jinx.second}, ${jinx.explanation} FROM scripts
          WHERE id = ${scriptId} AND owner_id = ${ownerId}
          ON CONFLICT (script_id, first, second) DO NOTHING RETURNING first, second, explanation`,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${scriptId} AND owner_id = ${ownerId} AND changes() > 0`,
        ]);

        return Option.fromNullishOr((yield* Schema.decodeEffect(JinxRows)(rows))[0]);
      }, writeUnavailable),
      updateJinx: Effect.fn("D1ScriptStore.updateJinx")(function* (ownerId, scriptId, jinx, now) {
        const [rows] = yield* d1.batch([
          sql`UPDATE jinxes SET explanation = ${jinx.explanation}
          WHERE first = ${jinx.first} AND second = ${jinx.second} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId}) RETURNING first, second, explanation`,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${scriptId} AND owner_id = ${ownerId} AND changes() > 0`,
        ]);

        return Option.fromNullishOr((yield* Schema.decodeEffect(JinxRows)(rows))[0]);
      }, writeUnavailable),
      deleteJinx: Effect.fn("D1ScriptStore.deleteJinx")(function* (ownerId, scriptId, pair, now) {
        const [rows] = yield* d1.batch([
          sql`DELETE FROM jinxes WHERE first = ${pair.first} AND second = ${pair.second} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId}) RETURNING first`,
          sql`UPDATE scripts SET updated_at = ${now} WHERE id = ${scriptId} AND owner_id = ${ownerId} AND changes() > 0`,
        ]);

        return rows.length > 0;
      }, writeUnavailable),
      findNightOrders: Effect.fn("D1ScriptStore.findNightOrders")(function* (ownerId, scriptId) {
        const [scripts, entries] = yield* d1.batch([
          sql`SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId}`,
          selectNightOrders(ownerId, scriptId),
        ]);

        if (scripts.length === 0) return Option.none();

        return Option.some(nightOrders(yield* Schema.decodeUnknownEffect(NightEntryRows)(entries)));
      }, readUnavailable),
      replaceNightOrder: Effect.fn("D1ScriptStore.replaceNightOrder")(function* (
        ownerId,
        scriptId,
        night,
        order,
        now,
      ) {
        const results = yield* d1.batch([
          sql`UPDATE scripts SET updated_at = ${now}
          WHERE id = ${scriptId} AND owner_id = ${ownerId} RETURNING id`,
          ...writeNightOrder(ownerId, scriptId, night, order),
          selectNightOrders(ownerId, scriptId),
        ]);

        if (results[0].length === 0) return Option.none();

        return Option.some(
          nightOrders(yield* Schema.decodeUnknownEffect(NightEntryRows)(results[3])),
        );
      }, writeUnavailable),
    });
  }),
);
