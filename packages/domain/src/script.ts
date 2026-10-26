import { Schema } from "effect";

export const ScriptId = Schema.String.check(Schema.isPattern(/^[0-7][0-9a-hjkmnp-tv-z]{25}$/)).pipe(
  Schema.brand("ScriptId"),
);

export type ScriptId = typeof ScriptId.Type;

// Drafts may be blank; only the stored length is bounded.
export const ScriptName = Schema.String.check(
  Schema.isMaxLength(100, { message: "Use 100 characters or fewer." }),
);

export const AuthorCredit = Schema.String.check(
  Schema.isMaxLength(100, { message: "Use 100 characters or fewer." }),
);

export const ScriptDetails = Schema.Struct({
  name: ScriptName,
  authorCredit: AuthorCredit,
});

export interface ScriptDetails extends Schema.Schema.Type<typeof ScriptDetails> {}

// The Script Owner's view. Ownership is implied by who can read it.
export const OwnedScript = Schema.Struct({
  id: ScriptId,
  name: ScriptName,
  authorCredit: AuthorCredit,
  // Milliseconds since the epoch of the last saved change.
  updatedAt: Schema.Finite,
});

export interface OwnedScript extends Schema.Schema.Type<typeof OwnedScript> {}

// This slice supports empty Scripts. Character fields arrive with the authoring slice.
export const PublicScript = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  authorCredit: Schema.String,
  characters: Schema.Array(Schema.Never),
});

export interface PublicScript extends Schema.Schema.Type<typeof PublicScript> {}

// Also returned when the Script exists but belongs to someone else, so owner
// operations never reveal another user's Scripts.
export class ScriptNotFound extends Schema.TaggedError<
  ScriptNotFound,
  { readonly brand: unique symbol }
>()("ScriptNotFound", { id: ScriptId }) {}

export class ScriptReadUnavailable extends Schema.TaggedError<
  ScriptReadUnavailable,
  { readonly brand: unique symbol }
>()("ScriptReadUnavailable", {}) {}

export class ScriptWriteUnavailable extends Schema.TaggedError<
  ScriptWriteUnavailable,
  { readonly brand: unique symbol }
>()("ScriptWriteUnavailable", {}) {}
