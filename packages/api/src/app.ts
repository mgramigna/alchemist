import { ScriptId } from "@alchemist/domain";
import { Rpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer, Option, Scheduler, Schema } from "effect";
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

// The official BOTC app imports a Script from a URL that resolves directly to its
// JSON, fetched from the app's own origin. Every request reads the latest saved state.
const SCRIPT_JSON_PATH = /^\/scripts\/([^/]+)\/json$/;

const PUBLIC_JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

const jsonText = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { ...PUBLIC_JSON_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });

const serveScriptJson = Effect.fn("App.serveScriptJson")(function* (
  request: Request,
  segment: string,
) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: PUBLIC_JSON_HEADERS });

  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { ...PUBLIC_JSON_HEADERS, Allow: "GET, HEAD" },
    });

  const id = Schema.decodeOption(ScriptId)(segment);

  if (Option.isNone(id)) return jsonText("Script not found.", 404);
  const config = yield* AppConfig;
  const scripts = yield* Scripts;

  return yield* scripts.exportPublicJson(id.value, config.assetOrigin ?? config.origin).pipe(
    Effect.map(
      ({ filename, json }) =>
        new Response(request.method === "HEAD" ? null : json, {
          headers: {
            ...PUBLIC_JSON_HEADERS,
            "Content-Type": "application/json; charset=utf-8",
            // Browsers show the JSON; saving it keeps the export's file name.
            "Content-Disposition": `inline; filename="${filename}"`,
          },
        }),
    ),
    Effect.catchTags({
      ScriptNotFound: () => Effect.succeed(jsonText("Script not found.", 404)),
      ScriptExportInvalid: () =>
        Effect.succeed(
          jsonText(
            "This Script can’t be exported as BOTC JSON yet. Ask the Script Owner to fix its problems.",
            422,
          ),
        ),
      ScriptReadUnavailable: () =>
        Effect.succeed(jsonText("The Script is temporarily unavailable. Try again.", 503)),
    }),
  );
});

export const handleRequest = Effect.fn("App.handleRequest")(function* (request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");

  if (path.startsWith(PUBLISHED_PREFIX)) return yield* servePublished(request, path);
  const scriptJson = SCRIPT_JSON_PATH.exec(path);

  if (scriptJson !== null) return yield* serveScriptJson(request, scriptJson[1] ?? "");
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
