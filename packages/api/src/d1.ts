import { PublicScript, ScriptId, ScriptReadUnavailable } from "@alchemist/domain";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { ScriptStore } from "./scripts.ts";

const ScriptRow = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  author_credit: Schema.String,
});

export const D1ScriptStore = Layer.effect(
  ScriptStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return ScriptStore.of({
      findPublic: Effect.fn("D1ScriptStore.findPublic")(
        function* (id) {
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
        },
        Effect.tapCause(Effect.logError),
        Effect.mapError(() => new ScriptReadUnavailable({})),
      ),
    });
  }),
);
