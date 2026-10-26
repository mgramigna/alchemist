import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import {
  AuthoredTeam,
  Character,
  CharacterAbility,
  CharacterId,
  CharacterName,
  CharacterNotFound,
} from "./character.ts";
import { AuthRejected, AuthUnavailable, DisplayName, User } from "./auth.ts";
import {
  AuthorCredit,
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptName,
  ScriptNotFound,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
} from "./script.ts";

// The signed-in User, provided to handlers of RPCs that use Authentication.
export class CurrentUser extends Context.Service<CurrentUser, User>()("alchemist/CurrentUser") {}

// Rejects calls without a live browser session. Public RPCs omit it deliberately.
export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("alchemist/Authentication", {
  error: Schema.Union([AuthRejected, AuthUnavailable]),
}) {}

export const Rpcs = RpcGroup.make(
  Rpc.make("Script.readPublic", {
    payload: { id: ScriptId },
    success: PublicScript,
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }),
  // Owner operations. Another user's Script is indistinguishable from a missing one.
  Rpc.make("Script.create", {
    success: OwnedScript,
    error: ScriptWriteUnavailable,
  }).middleware(Authentication),
  Rpc.make("Script.listOwned", {
    success: Schema.Array(OwnedScript),
    error: ScriptReadUnavailable,
  }).middleware(Authentication),
  Rpc.make("Script.readOwned", {
    payload: { id: ScriptId },
    success: OwnedScript,
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Script.updateDetails", {
    payload: { id: ScriptId, name: ScriptName, authorCredit: AuthorCredit },
    success: OwnedScript,
    error: Schema.Union([ScriptNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Character.list", {
    payload: { scriptId: ScriptId },
    success: Schema.Array(Character),
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Character.create", {
    payload: { scriptId: ScriptId, team: AuthoredTeam },
    success: Character,
    error: Schema.Union([ScriptNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  // Replaces every authored field at once, so a Team change keeps all other content.
  Rpc.make("Character.update", {
    payload: {
      scriptId: ScriptId,
      id: CharacterId,
      name: CharacterName,
      ability: CharacterAbility,
      team: AuthoredTeam,
    },
    success: Character,
    error: Schema.Union([CharacterNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Character.delete", {
    payload: { scriptId: ScriptId, id: CharacterId },
    // The deleted ID: JSON cannot carry a void result.
    success: CharacterId,
    error: Schema.Union([CharacterNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  // Anonymous browsers get null rather than an error, so this stays outside Authentication.
  Rpc.make("Account.current", {
    success: Schema.NullOr(User),
    error: AuthUnavailable,
  }),
  Rpc.make("Account.rename", {
    payload: { displayName: DisplayName },
    success: User,
    error: Schema.Union([AuthRejected, AuthUnavailable]),
  }).middleware(Authentication),
);
