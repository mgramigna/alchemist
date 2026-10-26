import { explanationBlocker, jinxExportBlockers, jinxPair, type User } from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { it, assert } from "@effect/vitest";
import { Effect } from "effect";
import { Scripts } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };

it.effect(
  "one shared Jinx keeps invalid drafts, edits/deletes from either endpoint, and rejects invalid pairs and non-owners",
  () =>
    Effect.gen(function* () {
      const fixture = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create();
        const other = yield* scripts.create();
        const a = yield* scripts.createCharacter(script.id, "townsfolk", []);
        const b = yield* scripts.createCharacter(script.id, "demon", []);
        const foreign = yield* scripts.createCharacter(other.id, "outsider", []);
        const pair = { first: b.id, second: a.id };
        assert.strictEqual(
          (yield* Effect.flip(scripts.createJinx(script.id, { first: a.id, second: a.id })))._tag,
          "JinxInvalid",
        );
        assert.strictEqual(
          (yield* Effect.flip(scripts.createJinx(script.id, { first: a.id, second: foreign.id })))
            ._tag,
          "JinxInvalid",
        );
        const created = yield* scripts.createJinx(script.id, pair);
        assert.deepStrictEqual(created, {
          first: jinxPair(a.id, b.id).first,
          second: jinxPair(a.id, b.id).second,
          explanation: "",
        });
        assert.strictEqual(jinxExportBlockers([created]).length, 1);
        assert.strictEqual(
          (yield* Effect.flip(scripts.createJinx(script.id, { first: a.id, second: b.id })))._tag,
          "JinxConflict",
        );

        for (const explanation of [" ", "x".repeat(501), "These Characters interact."]) {
          const saved = yield* scripts.updateJinx(script.id, { ...pair, explanation });
          assert.strictEqual(saved.explanation, explanation);
          assert.strictEqual((yield* scripts.listJinxes(script.id))[0]?.explanation, explanation);
          assert.strictEqual(
            (yield* scripts.readPublic(script.id)).jinxes[0]?.explanation,
            explanation,
          );
          assert.strictEqual(
            jinxExportBlockers([saved]).length,
            explanationBlocker(explanation) === undefined ? 0 : 1,
          );
        }

        yield* Effect.gen(function* () {
          assert.strictEqual(
            (yield* Effect.flip(scripts.listJinxes(script.id)))._tag,
            "ScriptNotFound",
          );
          assert.strictEqual(
            (yield* Effect.flip(scripts.createJinx(script.id, pair)))._tag,
            "ScriptNotFound",
          );
          assert.strictEqual(
            (yield* Effect.flip(scripts.updateJinx(script.id, { ...pair, explanation: "Hijack" })))
              ._tag,
            "JinxNotFound",
          );
          assert.strictEqual(
            (yield* Effect.flip(scripts.deleteJinx(script.id, pair)))._tag,
            "JinxNotFound",
          );
        }).pipe(Effect.provideService(CurrentUser, bob));
        assert.strictEqual(
          (yield* scripts.listJinxes(script.id))[0]?.explanation,
          "These Characters interact.",
        );
        yield* scripts.deleteJinx(script.id, pair);
        assert.deepStrictEqual(yield* scripts.listJinxes(script.id), []);
        yield* scripts.createJinx(script.id, pair);
        yield* scripts.deleteCharacter(script.id, b.id);
        assert.deepStrictEqual(yield* scripts.listJinxes(script.id), []);
        assert.deepStrictEqual((yield* scripts.readPublic(script.id)).jinxes, []);
      }).pipe(Effect.provide(fixture.layer), Effect.provideService(CurrentUser, alice));
    }),
);
