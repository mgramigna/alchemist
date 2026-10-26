import { Schema } from "effect";

export const ScriptId = Schema.String.check(Schema.isPattern(/^[0-7][0-9a-hjkmnp-tv-z]{25}$/)).pipe(
  Schema.brand("ScriptId"),
);

export type ScriptId = typeof ScriptId.Type;

// This slice supports empty Scripts. Character fields arrive with the authoring slice.
export const PublicScript = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  authorCredit: Schema.String,
  characters: Schema.Array(Schema.Never),
});

export interface PublicScript extends Schema.Schema.Type<typeof PublicScript> {}

export class ScriptNotFound extends Schema.TaggedError<
  ScriptNotFound,
  { readonly brand: unique symbol }
>()("ScriptNotFound", { id: ScriptId }) {}

export class ScriptReadUnavailable extends Schema.TaggedError<
  ScriptReadUnavailable,
  { readonly brand: unique symbol }
>()("ScriptReadUnavailable", {}) {}
