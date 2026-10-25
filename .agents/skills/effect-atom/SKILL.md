---
name: effect-atom
description: Build reactive state with Effect Atom and AtomRpc. Use when defining query or mutation atoms, consuming AsyncResult in React, designing reactivity keys, choosing mutation state scope, implementing cursor pagination, or managing registry lifecycles.
---

# Effect Atom

Read `../effect/SKILL.md` before implementation. For RPC contracts and server handlers, also read `../effect-rpc/SKILL.md`.

Use Effect v4 APIs. Verify signatures and behavior against the configured `#effect` source and the target project's pinned version. Atom and RPC APIs are unstable; imports and helper signatures can change between releases.

## Workflow

1. Inspect the data source's success and complete error channels, including middleware and client transport errors.
2. Define canonical query factories with normalized inputs.
3. Choose entity-based reactivity keys and the narrowest truthful invalidation scopes.
4. Choose mutation state scope from actual concurrency requirements.
5. Render pending, success, typed failure, and unexpected failure states explicitly.
6. Test identity, invalidation, mutation scope, and lifecycle behavior relevant to the change.

Completion: equivalent reads share atom identity within the intended registry; writes invalidate affected reads; expected errors remain typed; registry ownership and teardown are explicit.

## Query identity

Define one canonical factory per query. In these examples, `ApiClient` is an application-defined AtomRpc service, not a built-in export.

```ts
export const entityAtom = (target: Target) =>
  ApiClient.query("Domain.read", normalizeTarget(target), {
    reactivityKeys: DomainKeys.query(target),
  });
```

`ApiClient.query` memoizes by its query arguments and options. Keep normalization and options consistent across consumers. It already owns query identity; use an additional `Atom.family` only for state the query helper does not own.

`serializationKey` is optional serialization/hydration metadata, not the mechanism for in-memory cache sharing. When serialization is needed, include every normalized input that changes the result. Use a canonical encoder for ambiguous filters or pagination.

`Atom.family` supports structural equality for plain object keys in Effect v4. Normalize semantic equivalents before lookup and check behavior for custom key types against the installed version. Avoid stringify/parse round trips solely to manufacture identity.

## React consumption

Queries expose `AsyncResult<A, E>`. Use `AsyncResult.matchWithError` or `matchWithWaiting` when rendering typed failures separately from defects and interruption.

- Use `useAtom` for explicit asynchronous UI.
- Use `useAtomSuspense` when Suspense and error boundaries own the query UI.
- Suspense normally applies to the initial result. `suspendOnWaiting: true` also suspends during refresh, which can hide previously available data.
- Use `includeFailure: true` when a suspense consumer must render typed failures locally rather than throw them to an error boundary.
- Use `result.waiting` for refresh/pending indicators. Reserve initial-loading placeholders for `AsyncResult.isInitial(result)`.

For event-driven mutation follow-up, preserve the error channel with `promiseExit`:

```ts
const mutate = useAtomSet(mutationAtom, { mode: "promiseExit" });
const exit = await mutate(args);
```

Use `useAtomSet` when the component does not render mutation state; use `useAtom` when it does. Inspect a failed exit's cause, handle tagged failures exhaustively, and give defects/interruption their own policy. A cause without a typed failure is not an expected domain error.

`mode: "promise"` turns the typed channel into an untyped Promise rejection. Prefer `promiseExit` when callers need typed recovery.

Keep navigation, notifications, and other follow-up actions in the initiating event handler. Derive UI from atom state rather than adding an effect to observe mutation completion.

## Mutation scope

Default to `ApiClient.mutation("Domain.operation")` for simple forms and low-frequency actions. Pending/disabled UI usually suffices to prevent accidental duplicate submissions.

Use independent mutation state when normal usage involves overlapping actions on independently interactive entities. Build a fresh `ApiClient.runtime.fn` inside an `Atom.family` keyed by normalized entity identity when isolation is required.

Wrapping `ApiClient.mutation("Domain.operation")` in a family does not isolate writes: that helper already memoizes the mutation atom by operation tag.

A family isolates different keys, not multiple invocations for the same key. Shared mutation state can share or cancel overlapping work depending on runtime function options. Verify those semantics before relying on every invocation completing.

Add queues or serialization only for an explicit requirement that every overlapping invocation complete in order. Choose state scope from real workflow requirements rather than speculative concurrency.

## Reactivity keys

Reactivity matches keys exactly, not by string prefix. Register every supported invalidation scope on each query:

```ts
export const DomainKeys = {
  all: "Domain:all",
  parent: (parentId: string) => `Domain:parent:${parentId}`,
  target: ({ parentId, entityId }: Target) =>
    `Domain:parent:${parentId}:entity:${entityId}`,
  query: (target: Target) => [
    DomainKeys.all,
    DomainKeys.parent(target.parentId),
    DomainKeys.target(target),
  ],
} as const;
```

Keys describe changed entities, not screens. A mutation supplies the narrowest sufficient scope:

```ts
const args = {
  payload: target,
  reactivityKeys: [DomainKeys.target(target)],
};
```

Test target isolation, parent fan-out, and global fan-out for the supported scopes. Use the shared runtime's reactivity service when integrating other write sources with atom reads.

## Cursor pagination

A Stream-based reader can compose cursor-paginated RPC calls. Scope pagination state by every input that identifies the feed.

- Keep writable page count and the reader atom in separate families. `Atom.family` weakly caches its return value; a family returning a wrapper object can lose that wrapper even while its atoms remain mounted, producing new atom identities on a later lookup.
- A page-count reader can use `Stream.paginate`, `Stream.take(count)`, and `Stream.runCollect`.
- Convert the next cursor with `Option.fromNullishOr`. A valid cursor such as `0` must not be treated as end-of-feed.
- Omit an optional cursor from the initial payload rather than sending `cursor: undefined` when the schema distinguishes absence.
- Keep existing pages visible during refresh and preserve page count when that is the intended interaction.

Page-count pagination refetches the requested range from page one on each recomputation. It is not append-only caching. Consider `Atom.pull` or the runtime's pull helper when incremental fetching matters, and define reset and refresh behavior explicitly.

Test equivalent inputs, feed isolation, initial cursor omission, cursor traversal, end-of-feed handling, and state retention on refresh.

## Registry ownership and retention

Consumers share cached results only through the intended atom identities and registry. Reuse the existing runtime and registry within their ownership scope rather than constructing new ones per render or invocation.

Scope authenticated caches to the session or user. In server-rendered applications, scope user data to the request as appropriate. Dispose scoped registries and runtimes when their owner ends so cached data and resources do not leak across identities.

Idle TTL controls retention of unobserved results, not server-data freshness. Invalidation controls refresh after writes. Longer retention trades memory for reuse; select retention and any external refresh policy from domain requirements rather than a universal duration.

## Verification

Use the target project's existing typecheck and test tooling. Cover canonical query identity with equivalent inputs, meaningful error paths, invalidation scope, independent mutation state where required, and lifecycle isolation. Avoid inventing repository commands or adding test infrastructure solely to follow this skill.
