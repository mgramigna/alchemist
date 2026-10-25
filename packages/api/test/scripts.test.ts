import { PublicScript, ScriptId, ScriptNotFound, ScriptReadUnavailable } from "@alchemist/domain";
import { assert, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { Scripts, ScriptsLive, ScriptStore } from "../src/scripts.ts";

const id = ScriptId.make("01k8ac00000000000000000001");

const fixture = {
  id,
  name: "The Midnight Alchemist",
  authorCredit: "Independent credit",
  characters: [],
  ownerId: "private",
  session: "secret",
  privateSource: "hidden",
};

it.effect("anonymous read projects only public data and preserves independent Author Credit", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const result = yield* scripts.readPublic(id);
    assert.deepStrictEqual(
      result,
      PublicScript.make({
        id,
        name: fixture.name,
        authorCredit: fixture.authorCredit,
        characters: [],
      }),
    );
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(
          Layer.succeed(ScriptStore, {
            findPublic: (requested) => {
              assert.strictEqual(requested, id);

              return Effect.succeedSome(fixture);
            },
          }),
        ),
      ),
    ),
  ),
);

it.effect("unknown Script has a typed not-found result", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const error = yield* scripts.readPublic(id).pipe(Effect.flip);
    assert.instanceOf(error, ScriptNotFound);
    assert.deepStrictEqual(error, new ScriptNotFound({ id }));
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(Layer.succeed(ScriptStore, { findPublic: () => Effect.succeedNone })),
      ),
    ),
  ),
);

it.effect("storage failure stays unavailable rather than looking like a missing Script", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const exit = yield* Effect.exit(scripts.readPublic(id));
    assert.isTrue(Exit.isFailure(exit));
    const error = yield* scripts.readPublic(id).pipe(Effect.flip);
    assert.instanceOf(error, ScriptReadUnavailable);
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(
          Layer.succeed(ScriptStore, {
            findPublic: () => Effect.fail(new ScriptReadUnavailable({})),
          }),
        ),
      ),
    ),
  ),
);
