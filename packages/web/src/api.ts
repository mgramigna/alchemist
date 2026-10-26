import { PublicRpcs } from "@alchemist/domain/rpc";
import type { ScriptId } from "@alchemist/domain";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { AtomRpc } from "effect/reactivity";
import { RpcClient, RpcSerialization } from "effect/rpc";

class PublicClient extends AtomRpc.Service<PublicClient>()("alchemist/PublicClient", {
  group: PublicRpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/api/public/rpc" }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  ),
}) {}

export const publicScript = (id: ScriptId) => PublicClient.query("Script.readPublic", { id });

import { AccountRpcs } from "@alchemist/domain/rpc";

class AccountClient extends AtomRpc.Service<AccountClient>()("alchemist/AccountClient", {
  group: AccountRpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/api/account/rpc" }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  ),
}) {}

export const currentAccount = AccountClient.query("Account.current", undefined, {
  reactivityKeys: ["Account"],
});

export const renameAccount = AccountClient.mutation("Account.rename");
