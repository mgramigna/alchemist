import { PublicScript, ScriptId, ScriptNotFound, ScriptReadUnavailable } from "@alchemist/domain";
import { Context, Effect, Layer, Option, Schema } from "effect";

export class ScriptStore extends Context.Service<
  ScriptStore,
  {
    readonly findPublic: (
      id: ScriptId,
    ) => Effect.Effect<Option.Option<PublicScript>, ScriptReadUnavailable>;
  }
>()("alchemist/ScriptStore") {}

export class Scripts extends Context.Service<
  Scripts,
  {
    readonly readPublic: (
      id: ScriptId,
    ) => Effect.Effect<PublicScript, ScriptNotFound | ScriptReadUnavailable>;
  }
>()("alchemist/Scripts") {}

export const ScriptsLive = Layer.effect(
  Scripts,
  Effect.gen(function* () {
    const store = yield* ScriptStore;

    return Scripts.of({
      readPublic: Effect.fn("Scripts.readPublic")(function* (id) {
        const script = yield* store.findPublic(id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        // Decode the explicit representation, stripping any accidental adapter fields.
        return yield* Schema.decodeEffect(PublicScript)(script.value).pipe(
          Effect.tapCause(Effect.logError),
          Effect.mapError(() => new ScriptReadUnavailable({})),
        );
      }),
    });
  }),
);
