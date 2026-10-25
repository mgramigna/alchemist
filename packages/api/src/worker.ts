import type { D1Database } from "@cloudflare/workers-types";
import * as D1Client from "@effect/sql-d1/D1Client";
import { PublicRpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { D1ScriptStore } from "./d1.ts";
import { PublicHandlers } from "./rpc.ts";
import { ScriptsLive } from "./scripts.ts";

export interface Bindings {
  readonly DB: D1Database;
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
}

class RequestBindings extends Context.Service<RequestBindings, Bindings>()(
  "alchemist/RequestBindings",
) {}

// The protocol, SQL client, and handlers belong to the current HTTP request's scope.
// No request-owned binding, identity, or I/O is captured by the isolate runtime.
const rpcRequest = Effect.gen(function* () {
  const env = yield* RequestBindings;

  const services = ScriptsLive.pipe(
    Layer.provide(D1ScriptStore),
    Layer.provide(D1Client.layer({ db: env.DB })),
  );

  return yield* RpcServer.toHttpEffect(PublicRpcs).pipe(
    Effect.flatMap((handle) => handle),
    Effect.provide([PublicHandlers.pipe(Layer.provide(services)), RpcSerialization.layerNdjson]),
  );
});

const Routes = HttpRouter.add("POST", "/api/public/rpc", rpcRequest).pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))),
);

export const publicApp = HttpRouter.toWebHandler(Routes);

export default {
  fetch(request: Request, env: Bindings): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/auth" ||
      path.startsWith("/auth/")
    ) {
      return publicApp.handler(request, Context.make(RequestBindings, env));
    }

    return env.ASSETS.fetch(request);
  },
};
