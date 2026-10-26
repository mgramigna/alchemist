import {
  Character,
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
} from "@alchemist/domain";
import { D1Client } from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { ScriptStore } from "./scripts.ts";

const ScriptRow = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  author_credit: Schema.String,
});

const OwnedRows = Schema.Array(OwnedScript);

const CharacterRows = Schema.Array(Character);

const owned = (rows: ReadonlyArray<object>) =>
  Schema.decodeUnknownEffect(OwnedRows)(rows).pipe(
    Effect.map((decoded) => Option.fromNullishOr(decoded[0])),
  );

const firstCharacter = (rows: ReadonlyArray<object>) =>
  Schema.decodeUnknownEffect(CharacterRows)(rows).pipe(
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

    return ScriptStore.of({
      findPublic: Effect.fn("D1ScriptStore.findPublic")(function* (id) {
        // One batch, so the Script and its Characters come from the same snapshot.
        const [scripts, characters] = yield* d1.batch([
          sql`SELECT id, name, author_credit FROM scripts WHERE id = ${id}`,
          sql`SELECT id, name, ability, team FROM characters WHERE script_id = ${id} ORDER BY id`,
        ]);

        const row = (yield* Schema.decodeEffect(Schema.Array(ScriptRow))(scripts))[0];

        if (row === undefined) return Option.none();

        return Option.some(
          PublicScript.make({
            id: row.id,
            name: row.name,
            authorCredit: row.author_credit,
            characters: yield* Schema.decodeEffect(CharacterRows)(characters),
          }),
        );
      }, readUnavailable),
      insert: Effect.fn("D1ScriptStore.insert")(function* (ownerId, script) {
        yield* sql`INSERT INTO scripts (id, owner_id, name, author_credit, created_at, updated_at)
        VALUES (${script.id}, ${ownerId}, ${script.name}, ${script.authorCredit}, ${script.updatedAt}, ${script.updatedAt})`;
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
        return yield* Schema.decodeUnknownEffect(CharacterRows)(
          yield* sql`SELECT c.id, c.name, c.ability, c.team FROM characters c
          JOIN scripts s ON s.id = c.script_id
          WHERE s.id = ${scriptId} AND s.owner_id = ${ownerId} ORDER BY c.id`,
        );
      }, readUnavailable),
      insertCharacter: Effect.fn("D1ScriptStore.insertCharacter")(function* (
        ownerId,
        scriptId,
        character,
        now,
      ) {
        const results = yield* d1.batch([
          sql`INSERT INTO characters (id, script_id, name, ability, team)
          SELECT ${character.id}, id, ${character.name}, ${character.ability}, ${character.team}
          FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId}`,
          sql`UPDATE scripts SET updated_at = ${now}
          WHERE id = ${scriptId} AND owner_id = ${ownerId}`,
          sql`SELECT id, name, ability, team FROM characters WHERE id = ${character.id}`,
        ]);

        return yield* firstCharacter(results[2]);
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
          sql`UPDATE characters SET name = ${details.name}, ability = ${details.ability}, team = ${details.team}
          WHERE id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
          RETURNING id, name, ability, team`,
        ]);

        return yield* firstCharacter(results[1]);
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
          sql`DELETE FROM characters
          WHERE id = ${id} AND script_id IN (SELECT id FROM scripts WHERE id = ${scriptId} AND owner_id = ${ownerId})
          RETURNING id`,
        ]);

        return results[1].length > 0;
      }, writeUnavailable),
    });
  }),
);
