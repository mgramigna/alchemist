import { Rpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { Scripts } from "./scripts.ts";
import { AuthenticationLive, Handlers, ExportOrigin } from "./rpc.ts";
import { authResponse, handleAuth, sameOrigin } from "./auth-http.ts";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly origin: string;
  }
>()("alchemist/AppConfig") {}

// These values construct routes and handlers. Request services are supplied by
// handleRequest, so no binding, identity or active SQL client lives in this scope.
const rpc = RpcServer.toHttpEffect(Rpcs).pipe(
  Effect.flatMap((handle) => handle),
  Effect.provide([Handlers, AuthenticationLive, RpcSerialization.layerNdjson]),
);

const Routes = HttpRouter.add("POST", "/api/rpc", rpc).pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))),
);

const rpcApp = HttpRouter.toWebHandler(Routes);

export const handleRequest = Effect.fn("App.handleRequest")(function* (request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const isRpc = path === "/api/rpc";

  if (path.startsWith("/auth/") || isRpc) {
    const config = yield* AppConfig;

    if (new URL(request.url).origin !== config.origin)
      return authResponse("Unexpected application origin.", 400);

    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      !sameOrigin(request, config.origin)
    )
      return authResponse("Cross-origin request rejected.", 403);

    if (!isRpc) {
      return yield* handleAuth(request).pipe(
        Effect.catchTag("AuthUnavailable", () =>
          Effect.succeed(authResponse("Sign-in is temporarily unavailable. Try again.", 503)),
        ),
      );
    }
  }

  const config = yield* AppConfig;
  const services = yield* Effect.context<Auth | Scripts>();
  const context = Context.add(services, ExportOrigin, { origin: config.origin });

  const response = yield* Effect.promise(() => rpcApp.handler(request, context));

  if (isRpc) response.headers.set("Cache-Control", "no-store");

  return response;
});
