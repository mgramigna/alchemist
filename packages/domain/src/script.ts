import { Schema } from "effect";
import { Jinx } from "./jinx.ts";
import { PublicCharacter } from "./character.ts";
import { NightOrders } from "./night.ts";

export const ScriptId = Schema.String.pipe(Schema.brand("ScriptId"));

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

// The Script's own artwork slots, exported as `_meta.logo` and `_meta.background`.
export const ScriptArtworkField = Schema.Literals(["logo", "background"]);

export type ScriptArtworkField = typeof ScriptArtworkField.Type;

export const SCRIPT_ARTWORK_FIELDS = ScriptArtworkField.literals;

// Published image paths, resolved against the asset origin like Character variants.
// Owners and viewers see the same thing: private originals never leave storage.
export const ScriptArtwork = Schema.Struct({
  logo: Schema.NullOr(Schema.String),
  background: Schema.NullOr(Schema.String),
});

export interface ScriptArtwork extends Schema.Schema.Type<typeof ScriptArtwork> {}

export const NO_SCRIPT_ARTWORK: ScriptArtwork = { logo: null, background: null };

export const PublicScript = Schema.Struct({
  id: ScriptId,
  name: Schema.String,
  authorCredit: Schema.String,
  artwork: ScriptArtwork,
  characters: Schema.Array(PublicCharacter),
  nightOrders: NightOrders,
  jinxes: Schema.Array(Jinx),
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
