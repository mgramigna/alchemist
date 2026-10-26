import {
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
} from "@alchemist/domain";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { ScriptStore } from "./scripts.ts";

const ScriptRow = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  author_credit: Schema.String,
});

const OwnedRows = Schema.Array(OwnedScript);

const owned = (rows: ReadonlyArray<object>) =>
  Schema.decodeUnknownEffect(OwnedRows)(rows).pipe(
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

    return ScriptStore.of({
      findPublic: Effect.fn("D1ScriptStore.findPublic")(function* (id) {
        const rows = yield* sql`SELECT id, name, author_credit FROM scripts WHERE id = ${id}`;
        const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(ScriptRow))(rows);
        const row = decoded[0];

        return row === undefined
          ? Option.none()
          : Option.some(
              PublicScript.make({
                id: row.id,
                name: row.name,
                authorCredit: row.author_credit,
                characters: [],
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
    });
  }),
);
