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

export const publicScript = (id: ScriptId) =>
  Client.query("Script.readPublic", { id }, { reactivityKeys: [ScriptKeys.script(id)] });

export const publicScriptExport = (id: ScriptId) =>
  Client.query("Script.exportPublic", { id }, { reactivityKeys: [ScriptKeys.script(id)] });

export const currentAccount = Client.query("Account.current", undefined, {
  reactivityKeys: ["Account"],
});

export const renameAccount = Client.mutation("Account.rename");

// Owner reads are scoped to this browser's session; signing out reloads the page and registry.
export const ScriptKeys = {
  owned: "Scripts:owned",
  script: (id: ScriptId) => `Script:${id}`,
} as const;

export const ownedScripts = Client.query("Script.listOwned", undefined, {
  reactivityKeys: [ScriptKeys.owned],
});

export const ownedScript = (id: ScriptId) =>
  Client.query("Script.readOwned", { id }, { reactivityKeys: [ScriptKeys.script(id)] });

export const createScript = Client.mutation("Script.create");

export const updateScriptDetails = Client.mutation("Script.updateDetails");

export const ownedCharacters = (scriptId: ScriptId) =>
  Client.query("Character.list", { scriptId }, { reactivityKeys: [ScriptKeys.script(scriptId)] });

export const createCharacter = Client.mutation("Character.create");

export const updateCharacter = Client.mutation("Character.update");

export const deleteCharacter = Client.mutation("Character.delete");

export const ownedNightOrders = (scriptId: ScriptId) =>
  Client.query("NightOrder.read", { scriptId }, { reactivityKeys: [ScriptKeys.script(scriptId)] });

export const replaceNightOrder = Client.mutation("NightOrder.replace");

export const ownedJinxes = (scriptId: ScriptId) =>
  Client.query("Jinx.list", { scriptId }, { reactivityKeys: [ScriptKeys.script(scriptId)] });

export const createJinx = Client.mutation("Jinx.create");
export const updateJinx = Client.mutation("Jinx.update");
export const deleteJinx = Client.mutation("Jinx.delete");

export const exportScript = Client.mutation("Script.export");

export const reviewScriptImport = Client.mutation("Script.reviewImport");
export const importScript = Client.mutation("Script.import");

export const importedScriptData = (id: ScriptId) =>
  Client.query(
    "Script.readImported",
    { id },
    { reactivityKeys: [`Script:imported:${id}`, ScriptKeys.script(id)] },
  );

export const useGenericArtwork = Client.mutation("Script.useGenericArtwork");
export const retryImportedArtwork = Client.mutation("Script.retryImportedArtwork");

export const uploadArtwork = Client.mutation("Artwork.upload");
export const restyleArtwork = Client.mutation("Artwork.restyle");
export const readArtworkSource = Client.mutation("Artwork.readSource");
export const removeArtwork = Client.mutation("Artwork.remove");

export const ownedScriptArtwork = (id: ScriptId) =>
  Client.query("Script.readArtwork", { id }, { reactivityKeys: [ScriptKeys.script(id)] });

export const uploadScriptArtwork = Client.mutation("Script.uploadArtwork");
export const removeScriptArtwork = Client.mutation("Script.removeArtwork");

export const deleteScript = Client.mutation("Script.delete");
