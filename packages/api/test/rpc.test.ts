import { PublicScript, ScriptId, ScriptNotFound, ScriptReadUnavailable } from "@alchemist/domain";
import { PublicRpcs } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { RpcTest } from "effect/rpc";
import { PublicHandlers } from "../src/rpc.ts";
import { Scripts } from "../src/scripts.ts";

const id = ScriptId.make("01k8ac00000000000000000001");
const unavailableId = ScriptId.make("01k8ac00000000000000000002");
const unknownId = ScriptId.make("00000000000000000000000000");

const fixture = PublicScript.make({
  id,
  name: "Saved Script",
  authorCredit: "Saved credit",
  characters: [],
});

const scripts = Layer.succeed(Scripts, {
  readPublic: Effect.fn("TestScripts.readPublic")(function* (requested) {
    if (requested === unavailableId) return yield* new ScriptReadUnavailable({});

    if (requested !== id) return yield* new ScriptNotFound({ id: requested });

    return fixture;
  }),
});

it.effect("public RPC delegates to Scripts and preserves expected error variants", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(PublicRpcs);

      assert.deepStrictEqual(yield* client["Script.readPublic"]({ id }), fixture);
      assert.instanceOf(
        yield* client["Script.readPublic"]({ id: unknownId }).pipe(Effect.flip),
        ScriptNotFound,
      );
      assert.instanceOf(
        yield* client["Script.readPublic"]({ id: unavailableId }).pipe(Effect.flip),
        ScriptReadUnavailable,
      );
    }),
  ).pipe(Effect.provide(PublicHandlers.pipe(Layer.provide(scripts)))),
);
