import { AccountRpcs, PublicRpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { Scripts } from "./scripts.ts";
import { AccountHandlers, PublicHandlers } from "./rpc.ts";
import {
  BrowserSession,
  SESSION_COOKIE,
  authResponse,
  handleAuth,
  readCookie,
  sameOrigin,
} from "./auth-http.ts";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly origin: string;
  }
>()("alchemist/AppConfig") {}

// These values construct routes and handlers. Request services are supplied by
// handleRequest, so no binding, identity or active SQL client lives in this scope.
const publicRpc = RpcServer.toHttpEffect(PublicRpcs).pipe(
  Effect.flatMap((handle) => handle),
  Effect.provide([PublicHandlers, RpcSerialization.layerNdjson]),
);

const accountRpc = RpcServer.toHttpEffect(AccountRpcs).pipe(
  Effect.flatMap((handle) => handle),
  Effect.provide([AccountHandlers, RpcSerialization.layerNdjson]),
);

const Routes = Layer.mergeAll(
  HttpRouter.add("POST", "/api/public/rpc", publicRpc),
  HttpRouter.add("POST", "/api/account/rpc", accountRpc),
).pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))),
);

const rpcApp = HttpRouter.toWebHandler(Routes);

export const handleRequest = Effect.fn("App.handleRequest")(function* (request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const isAccountRpc = path === "/api/account/rpc";

  if (path.startsWith("/auth/") || isAccountRpc) {
    const config = yield* AppConfig;

    if (new URL(request.url).origin !== config.origin)
      return authResponse("Unexpected application origin.", 400);

    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      !sameOrigin(request, config.origin)
    )
      return authResponse("Cross-origin request rejected.", 403);

    if (!isAccountRpc) {
      return yield* handleAuth(request).pipe(
        Effect.catchTag("AuthUnavailable", () =>
          Effect.succeed(authResponse("Sign-in is temporarily unavailable. Try again.", 503)),
        ),
      );
    }
  }

  const context = yield* Effect.context<Auth | Scripts>();

  const response = yield* Effect.promise(() =>
    rpcApp.handler(
      request,
      Context.add(context, BrowserSession, {
        token: readCookie(request, SESSION_COOKIE),
      }),
    ),
  );

  if (isAccountRpc) response.headers.set("Cache-Control", "no-store");

  return response;
});
