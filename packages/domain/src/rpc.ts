import {
  ImportedArtwork,
  ImportedData,
  ImportJson,
  ImportReview,
  ScriptImportInvalid,
} from "./import.ts";
import { ScriptExportInvalid } from "./export.ts";
import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import {
  AuthoredTeam,
  Character,
  CharacterDetails,
  CharacterId,
  CharacterNotFound,
} from "./character.ts";
import {
  Jinx,
  JinxPair,
  JinxExplanation,
  JinxInvalid,
  JinxConflict,
  JinxNotFound,
} from "./jinx.ts";
import { Night, NightOrder, NightOrderInvalid, NightOrders } from "./night.ts";
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
  Rpc.make("Script.exportPublic", {
    payload: { id: ScriptId },
    success: Schema.Struct({ filename: Schema.String, json: Schema.String }),
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable, ScriptExportInvalid]),
  }),
  Rpc.make("Script.useGenericArtwork", {
    payload: {
      id: ScriptId,
      field: ImportedArtwork.fields.field,
      characterId: Schema.NullOr(CharacterId),
    },
    success: ScriptId,
    error: Schema.Union([ScriptNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Script.reviewImport", {
    payload: { json: ImportJson },
    success: ImportReview,
  }).middleware(Authentication),
  Rpc.make("Script.import", {
    payload: { json: ImportJson, acknowledgeDiscard: Schema.Boolean },
    success: OwnedScript,
    error: Schema.Union([ScriptImportInvalid, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Script.readImported", {
    payload: { id: ScriptId },
    success: Schema.NullOr(ImportedData),
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }).middleware(Authentication),
  // Owner operations. Another user's Script is indistinguishable from a missing one.
  Rpc.make("Script.export", {
    payload: { id: ScriptId },
    success: Schema.Struct({ filename: Schema.String, json: Schema.String }),
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable, ScriptExportInvalid]),
  }).middleware(Authentication),
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
  // Creation asks which nights the Character acts on; each chosen night gains it before Dawn.
  Rpc.make("Character.create", {
    payload: {
      scriptId: ScriptId,
      team: AuthoredTeam,
      nights: Schema.Array(Night).check(Schema.isMaxLength(2)),
    },
    success: Character,
    error: Schema.Union([ScriptNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  // Replaces every authored field at once, so a Team change keeps all other content.
  Rpc.make("Character.update", {
    payload: {
      scriptId: ScriptId,
      id: CharacterId,
      ...CharacterDetails.fields,
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
  Rpc.make("Jinx.list", {
    payload: { scriptId: ScriptId },
    success: Schema.Array(Jinx),
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Jinx.create", {
    payload: { scriptId: ScriptId, ...JinxPair.fields },
    success: Jinx,
    error: Schema.Union([ScriptNotFound, JinxInvalid, JinxConflict, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Jinx.update", {
    payload: { scriptId: ScriptId, ...JinxPair.fields, explanation: JinxExplanation },
    success: Jinx,
    error: Schema.Union([JinxNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("Jinx.delete", {
    payload: { scriptId: ScriptId, ...JinxPair.fields },
    success: JinxPair,
    error: Schema.Union([JinxNotFound, ScriptWriteUnavailable]),
  }).middleware(Authentication),
  Rpc.make("NightOrder.read", {
    payload: { scriptId: ScriptId },
    success: NightOrders,
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }).middleware(Authentication),
  // Replaces one night's complete order. Membership, standard steps and
  // positions all change through this one write.
  Rpc.make("NightOrder.replace", {
    payload: { scriptId: ScriptId, night: Night, order: NightOrder },
    success: NightOrders,
    error: Schema.Union([ScriptNotFound, NightOrderInvalid, ScriptWriteUnavailable]),
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
