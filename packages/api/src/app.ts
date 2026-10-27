import { ScriptId } from "@alchemist/domain";
import { Rpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer, Option, Scheduler } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { ArtworkStorage, PUBLISHED_CACHE_CONTROL } from "./artwork-storage.ts";
import { PUBLISHED_PATH, PUBLISHED_PREFIX, PUBLISHED_TYPES, Scripts } from "./scripts.ts";
import { AuthenticationLive, Handlers, ExportOrigin } from "./rpc.ts";
import { authResponse, handleAuth, sameOrigin } from "./auth-http.ts";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly origin: string;
    readonly assetOrigin?: string;
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

// Anyone, including the official BOTC app and sheet capture on other origins,
// may read published artwork without credentials.
const PUBLIC_IMAGE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "X-Content-Type-Options": "nosniff",
};

const servePublished = Effect.fn("App.servePublished")(function* (request: Request, path: string) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: PUBLIC_IMAGE_HEADERS });

  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { ...PUBLIC_IMAGE_HEADERS, Allow: "GET, HEAD" },
    });
  const storage = yield* ArtworkStorage;

  // The extension names the stored format, so it also sets the Content-Type.
  const type = PUBLISHED_TYPES.get(PUBLISHED_PATH.exec(path)?.[1] ?? "");

  const image =
    type === undefined
      ? Option.none()
      : yield* storage
          .readPublished(path.slice(1))
          .pipe(Effect.catchTag("ScriptReadUnavailable", () => Effect.succeed(null)));

  if (image === null)
    return new Response("Artwork is temporarily unavailable.", {
      status: 503,
      headers: { ...PUBLIC_IMAGE_HEADERS, "Cache-Control": "no-store" },
    });

  if (type === undefined || Option.isNone(image))
    return new Response("Not found.", {
      status: 404,
      headers: { ...PUBLIC_IMAGE_HEADERS, "Cache-Control": "no-store" },
    });

  const headers = {
    ...PUBLIC_IMAGE_HEADERS,
    "Content-Type": type,
    "Content-Length": String(image.value.bytes.length),
    "Cache-Control": PUBLISHED_CACHE_CONTROL,
    ETag: image.value.etag,
  };

  if (request.headers.get("If-None-Match") === image.value.etag)
    return new Response(null, { status: 304, headers });

  return new Response(request.method === "HEAD" ? null : new Uint8Array(image.value.bytes), {
    headers,
  });
});

// Public links always export the current saved Script, using the same validation as RPC.
const serveJson = Effect.fn("App.serveJson")(function* (request: Request, id: string) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD, OPTIONS" },
    });

  const scripts = yield* Scripts;
  const config = yield* AppConfig;

  return yield* scripts
    .exportPublicJson(ScriptId.make(id), config.assetOrigin ?? config.origin)
    .pipe(
      Effect.map(
        ({ json }) =>
          new Response(request.method === "HEAD" ? null : json, {
            headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
          }),
      ),
      Effect.catchTags({
        ScriptNotFound: () => Effect.succeed(new Response(null, { status: 404, headers })),
        ScriptExportInvalid: () => Effect.succeed(new Response(null, { status: 422, headers })),
        ScriptReadUnavailable: () => Effect.succeed(new Response(null, { status: 503, headers })),
      }),
    );
});

export const handleRequest = Effect.fn("App.handleRequest")(function* (request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");

  if (path.startsWith(PUBLISHED_PREFIX)) return yield* servePublished(request, path);
  const json = /^\/api\/scripts\/([^/]+)\.json$/.exec(path);

  if (json?.[1]) return yield* serveJson(request, json[1]);
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

  const context = Context.add(services, ExportOrigin, {
    origin: config.assetOrigin ?? config.origin,
  });

  const response = yield* Effect.promise(() => rpcApp.handler(request, context));

  if (isRpc) response.headers.set("Cache-Control", "no-store");

  return response;
});
