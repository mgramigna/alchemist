---
name: effect-rpc
description: Design and implement typed Effect RPC contracts, handlers, middleware, clients, and runtime layers. Use when working with Rpc.make, RpcGroup, RpcServer, transport schemas, RPC authentication, or service-to-RPC error translation.
---

# Effect RPC

Read `../effect/SKILL.md` before implementation. For reactive atom-based consumers, also read `../effect-atom/SKILL.md`.

Use Effect v4 APIs. Inspect the configured `#effect` source before guessing, then verify compatibility with the target project's pinned version. RPC APIs are unstable; use the version's actual exports and signatures rather than stable Effect v3 examples.

## Workflow

1. Identify the application operation and its service boundary. Keep business and persistence behavior in services.
2. Define payload, success, and expected-error schemas in a contract module that both client and server can consume.
3. Add operations with `Rpc.make`, compose them into an `RpcGroup`, and apply required middleware.
4. Implement thin handlers that delegate to services and translate failures into declared RPC errors.
5. Compose handler, middleware, and service layers into the existing server runtime.
6. Configure clients with a compatible transport and serialization protocol.
7. Test delegation, error translation, middleware, and transport behavior at the appropriate seams.

Completion: contract, handler, middleware, layer dependencies, client consumption, and tests agree on the operation's success and full error channels.

## Contract and error model

Use schemas for payloads and success values, and `Schema.TaggedErrorClass` for expected failures:

```ts
export class EntityReadError extends Schema.TaggedErrorClass<EntityReadError>()(
  "EntityReadError",
  { message: Schema.String },
) {}

export const EntityRpcs = RpcGroup.make(
  Rpc.make("Entity.read", {
    payload: ReadTarget,
    success: ReadResult,
    error: EntityReadError,
  }),
);
```

`ReadTarget` and `ReadResult` represent application-defined schemas. Apply authentication middleware to the operations or group that require it using the version's middleware API.

Use operation-specific tags when callers need distinct recovery. Use stable machine-readable fields for decisions and safe messages for display. Keep database and infrastructure details out of public errors.

Shared errors such as unauthorized, forbidden, not found, conflict, or validation failures belong in the contract when they represent expected outcomes. Middleware can contribute its own typed errors. Client transport errors such as `RpcClientError` are separate from server-declared domain failures; AtomRpc adds transport failures to its client result channel.

Defects and interruption are not expected domain errors. Preserve that distinction through client UI and logging rather than labelling every failure as a recoverable business outcome.

## Handler layers

Handlers are transport adapters. Let the RPC contract handle decoding; obtain services, delegate, and translate service errors:

```ts
export const EntityHandlers = EntityRpcs.toLayer(
  Effect.gen(function* () {
    const service = yield* EntityService;

    return {
      "Entity.read": (target) =>
        service.read(target).pipe(
          Effect.mapError(() =>
            new EntityReadError({ message: "Failed to read entity" }),
          ),
        ),
    };
  }),
);
```

This example intentionally exposes one safe read failure. When service failures require different caller responses, preserve them with exhaustive typed recovery, such as `Effect.catchTags`, rather than collapsing them all into one error.

Keep business branching and persistence queries in the application service. Translate errors only at a boundary with enough context to provide a truthful response.

Compose handler and middleware layers once and provide their required services. Reuse the existing server composition when one exists; do not introduce parallel runtimes to satisfy missing layer dependencies.

## Authentication and authorization

Declare middleware-provided services and typed errors in the shared contract. Implement session or credential resolution on the server, providing the authenticated identity around the handler effect.

Centralize authentication rather than reading cookies or reconstructing users in every handler. Public operations omit authentication deliberately. Resource-level authorization belongs in application/domain services and should yield an appropriate typed failure.

Test missing, invalid, and expired credentials as relevant, identity propagation, and permission failures. Authentication success alone does not establish authorization.

## Transport and clients

Keep transport configuration at the application boundary. Client and server must agree on protocol, serialization, credentials, and middleware requirements. HTTP with NDJSON is one option, not a universal application requirement.

Reuse clients and runtime layers within an explicitly owned lifecycle. Distinguish transport reuse from cached query results: sharing configuration or a transport client does not automatically share an atom registry or its data.

Keep user-specific state within its session/request scope. A long-lived transport is safe to share only when its credential and state behavior supports that ownership model. Dispose clients and runtimes at their owner's teardown, not after every operation.

Keep workflows in Effect until the actual Promise or framework boundary. Handle expected typed errors before that boundary when the caller has a meaningful recovery; a rejected Promise does not preserve a typed Effect error channel for callers.

For AtomRpc consumers, use `../effect-atom/SKILL.md` as the source of truth for query identity, `AsyncResult`, mutation state, invalidation keys, and registry ownership.

## Tests and verification

Use handler tests as a service-adapter seam: provide a fake service layer and invoke the operation through the group's handler facilities supported by the pinned version.

Cover:

- Payload delegation and success results.
- Every meaningful service-to-RPC error translation.
- Middleware behavior and identity propagation.
- Server layer construction and required dependencies.
- Serialization and client/server compatibility where an in-memory handler test cannot establish them.

Construct real service errors and schema-valid payloads rather than casting values into the desired type. Use the target project's existing focused tests, typechecking, and formatting tools. Run contract/domain tests when schemas change, and integration tests when transport or authentication wiring changes.
