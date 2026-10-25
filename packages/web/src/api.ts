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
