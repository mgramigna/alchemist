import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { PublicScript, ScriptId, ScriptNotFound, ScriptReadUnavailable } from "./index.ts";

export const PublicRpcs = RpcGroup.make(
  Rpc.make("Script.readPublic", {
    payload: { id: ScriptId },
    success: PublicScript,
    error: Schema.Union([ScriptNotFound, ScriptReadUnavailable]),
  }),
);
