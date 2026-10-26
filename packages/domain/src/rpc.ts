import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AuthRejected, AuthUnavailable, DisplayName, User } from "./auth.ts";
import { PublicScript, ScriptId, ScriptNotFound, ScriptReadUnavailable } from "./script.ts";

export const PublicRpcs = RpcGroup.make(
  Rpc.make("Script.readPublic", {
    payload: { id: ScriptId },
    success: PublicScript,
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }),
);

export const AccountRpcs = RpcGroup.make(
  Rpc.make("Account.current", {
    success: Schema.NullOr(User),
    error: AuthUnavailable,
  }),
  Rpc.make("Account.rename", {
    payload: { displayName: DisplayName },
    success: User,
    error: Schema.Union([AuthRejected, AuthUnavailable]),
  }),
);
