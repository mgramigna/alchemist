import { Rpcs } from "@alchemist/domain/rpc";
import type { ScriptId } from "@alchemist/domain";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { AtomRpc } from "effect/reactivity";
import { RpcClient, RpcSerialization } from "effect/rpc";

class Client extends AtomRpc.Service<Client>()("alchemist/Client", {
  group: Rpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/api/rpc" }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  ),
}) {}

export const publicScript = (id: ScriptId) => Client.query("Script.readPublic", { id });

export const currentAccount = Client.query("Account.current", undefined, {
  reactivityKeys: ["Account"],
});

export const renameAccount = Client.mutation("Account.rename");

// Owner reads are scoped to this browser's session; signing out reloads the page and registry.
export const ScriptKeys = {
  owned: "Scripts:owned",
} as const;

export const ownedScripts = Client.query("Script.listOwned", undefined, {
  reactivityKeys: [ScriptKeys.owned],
});

export const ownedScript = (id: ScriptId) => Client.query("Script.readOwned", { id });

export const createScript = Client.mutation("Script.create");

export const updateScriptDetails = Client.mutation("Script.updateDetails");

export const ownedCharacters = (scriptId: ScriptId) => Client.query("Character.list", { scriptId });

export const createCharacter = Client.mutation("Character.create");

export const updateCharacter = Client.mutation("Character.update");

export const deleteCharacter = Client.mutation("Character.delete");
