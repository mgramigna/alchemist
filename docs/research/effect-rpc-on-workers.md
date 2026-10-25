# Effect v4 RPC on Cloudflare Workers

## Bottom line

- Effect **4.0.6** can expose a `RpcGroup` as HTTP POST through `RpcServer.layerHttp({ protocol: "http", ... })` and `HttpRouter.toWebHandler`, returning a Fetch-compatible handler. Explicitly select HTTP: `layerHttp` defaults to WebSocket. AtomRpc accepts the corresponding `RpcClient.layerProtocolHttp` layer. [Server][server], [router][router], [AtomRpc][atom-rpc].
- HTTP + NDJSON is available end to end, including streamed responses. Plain JSON buffers responses; **msgpack is not a built-in 4.0.6 serializer**. The binary alternative in this version is SchemaBinary. No comparative size/CPU measurement was established here. [Serialization][serialization], [HTTP server implementation][server].
- Worker lifecycle is the main constraint: 4.0.6 explicitly documents module-scope handler construction without request-time I/O, and a synchronous scheduler for shared fibers. This does not make timers, background work, or request-owned I/O safe to retain across requests. [Router][router], [scheduler][scheduler].
- Request context reaches RPC handlers. Session middleware can read the actual HTTP request's parsed cookie, validate the session, and provide `CurrentUser` around the handler. Bindings and secrets can be resolved during the request; avoid capturing a binding-derived client or an authenticated user forever in an isolate layer. [Server context merge][server], [request][request], [middleware][middleware], [Cloudflare bindings][bindings].
- Source/package inspection and a Node HTTP round trip confirmed the wiring and concurrent identity/binding separation. A deployed Workers/Alchemy test, browser React lifecycle test, and transport benchmarks remain unconfirmed. These findings describe available mechanisms and trade-offs, not the project's transport/lifetime decision.

## Evidence and version boundary

Research for [issue #6](https://github.com/mgramigna/alchemist/issues/6), against the repository's `effect@4.0.6` catalog pin, on 2026-10-25. Downloaded and inspected the [published npm metadata][npm], [tarball][tarball], included TypeScript source, generated JavaScript, declarations, and package exports. The tarball's registry SHA-1 is `d92f3cdc1c7bd240eac7142db17e649a3850135e`. Its exports include `effect/rpc`, `effect/http`, and `effect/reactivity`; AtomRpc is inside `effect`, while React hooks are a separate `@effect/atom-react` package. The published `@effect/atom-react@4.0.6` peer requirements include `effect: ^4.0.6`, React 19, and scheduler. [Effect package][package], [React package][react-package].

Also inspected actual [effect-smol RPC source at its archived HEAD][smol-server]. That repository now [redirects v4 work to Effect-TS/effect][smol-readme]. Compared the release tag [`effect@4.0.6` / `3b28bf6`][release] with npm: RpcServer, RpcSerialization, RpcMiddleware, and AtomRpc matched byte for byte; inspected differences in RpcClient, HttpRouter, HttpEffect, and Atom were documentation/formatting changes. Versioned npm source is the reference below, rather than treating archived smol's `unstable/*` paths or v3 documentation as the installed API.

## Transport and serialization

`RpcServer.layerHttp` registers a POST route for HTTP when `protocol: "http"` is supplied. `RpcClient.layerProtocolHttp({ url })` supplies its matching client; it requires `HttpClient` and `RpcSerialization` layers. Optional HTTP client batching has `window` and `maxSize` settings; it is not required to connect AtomRpc. Both endpoints must be configured for the same serialization; this API does not negotiate a serializer from the request's content type. [Server][server], [client][client].

`RpcSerialization.layerNdjson` uses `application/x-ndjson`, newline framing and JSON codecs. It allows responses to be sent in chunks; the server may return a completed body for a fast response or a stream for an unfinished response. `layerJson` uses `application/json` without framing: the HTTP server collects all messages before returning a response. Consequently, JSON can carry the eventual values of a finite stream but does not provide incremental delivery. HTTP transport has no acknowledgment protocol or transferables; framed response queues default to 16 chunks, and the NDJSON incomplete-frame limit defaults to 16 MiB. Those limits do not constitute an application upload limit: HTTP request decoding first reads the request text/array buffer. [Serialization][serialization], [server][server], [client][client].

The other built-ins are JSON-RPC variants and `layerSchemaBinary`. SchemaBinary supplies framing, a 16 MiB default frame limit, fingerprinted envelopes and optional payload fingerprints. There is no `layerMsgPack` in this package. NDJSON is inspectable text; SchemaBinary requires binary tooling and compatibility testing. Neither performance superiority nor smaller production bundles can be concluded from the source. These are options to measure if the application's payloads justify it. [Complete serializer implementation][serialization].

Workers support streaming `Response` bodies. Preserve the response stream rather than consuming it with `.text()` in an adapter. Effect's `HttpEffect` adapter transfers request-scope cleanup to the response stream and handles aborts. Therefore do not dispose an app immediately after `handler` resolves: resolution can precede body completion. [Cloudflare streaming][streams], [HttpEffect][http-effect].

## Wiring the Worker and static assets

This minimal server illustrates the 4.0.6 API shape; real contracts and handler/service layers replace `Ping`. No Node HTTP listener or Node platform layer is involved. `HttpServer.layerServices` supplies the generic platform services, including a no-op filesystem, rather than a local disk implementation. [Server][server], [router][router], [platform services][http-server].

```ts
import { Effect, Layer, Scheduler, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { Rpc, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";

const Api = RpcGroup.make(Rpc.make("Ping", { success: Schema.String }));
const Handlers = Api.toLayer({ Ping: () => Effect.succeed("pong") });
const SyncScheduler = Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"));

const Routes = RpcServer.layerHttp({
  group: Api,
  path: "/rpc",
  protocol: "http",
}).pipe(
  Layer.provide([Handlers, RpcSerialization.layerNdjson, HttpServer.layerServices]),
  Layer.provideMerge(SyncScheduler),
);

// Construct outside fetch; no request-time I/O in layer construction.
const app = HttpRouter.toWebHandler(Routes);

export default {
  fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    if (new URL(request.url).pathname === "/rpc") {
      return app.handler(request);
    }
    return env.ASSETS.fetch(request);
  },
};
```

`Fetcher` above is a Cloudflare-generated type. Keep `/rpc` reserved even for unsupported methods so they reach the router's error response, instead of falling into SPA HTML. OAuth routes can be dispatched to the same Effect router before the asset fallback. Configure static assets with an `ASSETS` binding and SPA fallback, and route the RPC/auth paths Worker-first (`assets.run_worker_first`, globally or selective patterns). Otherwise asset-first navigation/fallback rules can bypass the Worker. These are Cloudflare settings; translating them into the chosen Alchemy version's configuration still needs verification. [Cloudflare routing][assets].

The lower-level APIs also exist: `RpcServer.toHttpEffect(group)` builds an RPC server and returns its HTTP effect; `HttpEffect.toWebHandlerLayer` adapts a layer-backed HTTP effect. The module is **HttpEffect**, not an assumed v3 `HttpApp.toWebHandler` API, and there is no `RpcServer.toWebHandler` in 4.0.6. Router composition is useful when OAuth/health endpoints share the Worker; the lower-level adapter avoids a router if dispatch is owned elsewhere. [Server][server], [HttpEffect][http-effect].

## Bindings: per request versus per isolate

Cloudflare supplies binding handles, environment values and secrets through `env`; it also supports importing `env` from `cloudflare:workers`. Effect does not automatically turn them into application services. Define a `Context.Service` for the binding interface and adapters for database/object-storage/session operations. Constructing a pure service object is distinct from executing its I/O methods. [Cloudflare bindings][bindings], [router's Workers guidance][router].

Two supported context/layer mechanisms have different lifetimes:

- **Request injection:** the generated `app.handler(request, context)` accepts an Effect `Context`. `HttpEffect` merges it with the app context for that request; RpcServer merges the request fiber's context with the handler entry's captured context, with request values taking precedence. Passing `Context.make(WorkerBindings, env)` can therefore supply request-specific handles to effects executed by the handler/middleware. Express deferred dependencies through the router's `HttpRouter.Request<"Requires", ...>` mechanism when building a typed integration; do not pretend a service required during layer construction will be supplied later by this argument. This argument supplies services, not already-built layers. [Router request types and handler signature][router], [adapter][http-effect], [RPC handler context][server].
- **Isolate layers:** a module-scope web handler builds its layers immediately and retains their resources and captured service values until `dispose`. Share pure contracts, routing, codecs and service implementations whose operations acquire request-specific resources when called. Layer construction must not open network connections or query DB/R2 at module scope. A service may instead resolve the live imported Cloudflare `env` during each method call. Cloudflare explicitly warns that binding-only deploys may reuse isolates, leaving globally cached binding-derived clients with old secrets. [Adapter lifecycle][http-effect], [Workers guidance][router], [binding changes][bindings].

A request-built service layer can be provided inside a request effect and closed with its request scope, but rebuilding the entire long-lived RPC app inside `fetch` also creates its shared fibers in that request's async context. That conflicts with the documented shared-handler recipe. Keep the scope of per-request construction deliberate; don't use a first-request `let app ??= ...` cache as a lifecycle substitute. This is an implication of the documented lifecycle, not a deployed experiment. [Router][router], [scheduler][scheduler].

`ExecutionContext` and its `waitUntil` are request-specific too. If needed, pass a small service wrapping the current context; don't retain it globally. `waitUntil` has a bounded post-response lifetime, not durable execution. [Cloudflare context][execution-context].

## Session middleware and current user

Declare an authentication middleware in the shared contract using `RpcMiddleware.Service<Auth, { provides: CurrentUser; requires: HttpServerRequest.HttpServerRequest }>()("Auth", { error: Unauthorized })`, where `Unauthorized` is a schema-backed error. Apply `.middleware(Auth)` to protected RPCs/the protected group; public share-link reads can remain outside that group. `requiredForClient` defaults to false, so cookie authentication need not impose a client middleware layer. [Middleware][middleware], [group][group].

Its server layer receives `(effect, metadata)` and returns an effect that:

1. Reads `HttpServerRequest.HttpServerRequest`, then `request.cookies.session` (use the actual configured cookie name).
2. Resolves a session service's lookup/validation effect. Missing, expired or invalid sessions fail with the declared `Unauthorized`; session storage and validation policy remain application code.
3. Executes `Effect.provideService(effect, CurrentUser, user)` so the current identity exists only around this invocation. Domain services still check Script ownership for writes.

The middleware's metadata includes headers, but there is a trust distinction: HTTP RPC combines actual HTTP headers **followed by encoded RPC-message headers**, and `Headers.fromInput` lets later duplicate names overwrite earlier ones. Do not use `metadata.headers.cookie` as proof of the browser's original cookie or use forwarded identity headers without a trust policy. Reading `HttpServerRequest.cookies` instead accesses the actual request, independent of RPC envelope overrides. [HTTP message handling and middleware execution][server], [header normalization][headers], [request cookies][request].

Ordinary same-origin browser Fetch sends cookies by default. If explicit credentials are desired, supply `FetchHttpClient.RequestInit` with `{ credentials: "same-origin" }` to the FetchHttpClient layer. AtomRpc query/mutation `headers` are RPC metadata, not a way to set the browser's forbidden HTTP Cookie header. Login/logout routes can set cookies through normal HTTP responses; clear or replace the authenticated atom registry on identity changes so prior-user query results are not reused. Cookie attributes, CSRF policy and the session model are unresolved application choices, not automatically supplied by RpcMiddleware. [Fetch client][fetch-client], [Fetch credentials standard][fetch-standard], [AtomRpc][atom-rpc], [React registry][react-registry].

## AtomRpc and React

The browser transport composition is:

```ts
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { AtomRpc } from "effect/reactivity";
import { RpcClient, RpcSerialization } from "effect/rpc";

class ApiClient extends AtomRpc.Service<ApiClient>()("ApiClient", {
  group: Api, // shared contract, not the server handlers
  protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  ),
}) {}
```

`ApiClient.query("Ping", undefined)` returns an atom exposing `AsyncResult`; render it with `useAtomValue` from `@effect/atom-react`, within a `RegistryProvider`. `ApiClient.mutation(tag)` returns a writable mutation atom; `useAtomSet(..., { mode: "promiseExit" })` permits typed success/failure handling. Queries are memoized by request/options; mutation helper state is shared by operation tag. Reactivity keys connect successful mutations to query invalidation. Reuse the client and registry within the intended session; do not construct them during every component render. No SSR hydration is needed for this SPA. [AtomRpc implementation][atom-rpc], [Atom runtime][atom], [React hooks][react-hooks], [registry][react-registry].

Transport failures add `RpcClientError` to the operation/middleware error channel; constructing the protocol layer with AtomRpc uses `Layer.orDie` for layer-build errors. UI handling must distinguish those failure modes from declared business errors. [AtomRpc][atom-rpc].

## Workers gotchas and remaining uncertainty

- The default mixed scheduler can schedule request-owned timers that disappear after the initiating request, stranding shared fibers. The source recipe retains `new Scheduler.MixedScheduler("sync")` for both layer construction and request execution via `Layer.provideMerge`. Sync scheduling can delay other requests during CPU-heavy work; it does not fix `Effect.sleep`, cross-request I/O ownership or indefinite background execution. [Scheduler][scheduler], [router][router].
- A request-local scope follows streaming completion/abort, while `app.dispose()` closes the application layer scope. Dispose belongs to the application's owner/test teardown, not every Fetch return. Workers offer no promise that module-level state is durable; background tasks need an appropriate platform lifecycle. [HttpEffect][http-effect], [Cloudflare context][execution-context].
- This Fetch integration itself does not require a Node HTTP server. That does not establish compatibility of every SQL adapter, image-processing library or OAuth dependency; those need their own Worker dependency checks. The generic filesystem service is a no-op, not disk access. [Platform layer][http-server].
- No deployed Worker was provisioned and no Alchemy API shape, cold-start latency, multi-request workerd behavior, streaming disconnect behavior, binary performance, browser cache teardown or complete OAuth/CSRF flow was confirmed. The repository's 4.0.6 package pin is the tested version; unstable module APIs must be rechecked when updating it. [Package version][package], [unstable RPC API][server].

Validation performed outside tracked files: a Node 24 probe using installed `effect@4.0.6` built a module-scope NDJSON HTTP RPC app, called it through `RpcClient.layerProtocolHttp` and a Fetch adapter, and disposed it afterward. Two overlapping calls with distinct actual HTTP session cookies and injected binding contexts returned `alice:A` and `bob:B`; an absent cookie produced a failure exit. It read the real request cookie and provided a current-user service around the handler. This confirms that adapter/context path in Node, not Workers scheduling or real session validation. React package source/exports were inspected, but no React component was mounted.

[server]: https://unpkg.com/effect@4.0.6/src/rpc/RpcServer.ts
[serialization]: https://unpkg.com/effect@4.0.6/src/rpc/RpcSerialization.ts
[client]: https://unpkg.com/effect@4.0.6/src/rpc/RpcClient.ts
[middleware]: https://unpkg.com/effect@4.0.6/src/rpc/RpcMiddleware.ts
[group]: https://unpkg.com/effect@4.0.6/src/rpc/RpcGroup.ts
[router]: https://unpkg.com/effect@4.0.6/src/http/HttpRouter.ts
[http-effect]: https://unpkg.com/effect@4.0.6/src/http/HttpEffect.ts
[http-server]: https://unpkg.com/effect@4.0.6/src/http/HttpServer.ts
[request]: https://unpkg.com/effect@4.0.6/src/http/HttpServerRequest.ts
[headers]: https://unpkg.com/effect@4.0.6/src/http/Headers.ts
[fetch-client]: https://unpkg.com/effect@4.0.6/src/http/FetchHttpClient.ts
[atom-rpc]: https://unpkg.com/effect@4.0.6/src/reactivity/AtomRpc.ts
[atom]: https://unpkg.com/effect@4.0.6/src/reactivity/Atom.ts
[scheduler]: https://unpkg.com/effect@4.0.6/src/Scheduler.ts
[package]: https://unpkg.com/effect@4.0.6/package.json
[npm]: https://registry.npmjs.org/effect/4.0.6
[tarball]: https://registry.npmjs.org/effect/-/effect-4.0.6.tgz
[react-package]: https://unpkg.com/@effect/atom-react@4.0.6/package.json
[react-hooks]: https://unpkg.com/@effect/atom-react@4.0.6/src/Hooks.ts
[react-registry]: https://unpkg.com/@effect/atom-react@4.0.6/src/RegistryContext.ts
[release]: https://github.com/Effect-TS/effect/tree/3b28bf686bf26e9700edd39c025aff2744dc5303/packages/effect
[smol-server]: https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/effect/src/unstable/rpc/RpcServer.ts
[smol-readme]: https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/README.md
[bindings]: https://developers.cloudflare.com/workers/runtime-apis/bindings/
[assets]: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
[streams]: https://developers.cloudflare.com/workers/runtime-apis/streams/
[execution-context]: https://developers.cloudflare.com/workers/runtime-apis/context/
[fetch-standard]: https://fetch.spec.whatwg.org/#concept-request-credentials-mode
