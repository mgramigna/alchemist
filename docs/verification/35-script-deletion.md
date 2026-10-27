# Script deletion verification

Issue: [#35](https://github.com/mgramigna/alchemist/issues/35). Follows the
approved spec in [#18](https://github.com/mgramigna/alchemist/issues/18) and
ADRs 0001–0003.

## Delivered behavior

- Each Script on the owner's dashboard has a Delete Script button. The modal
  names the Script and explains permanent loss, unavailable sharing, and retained
  exported artwork. Cancel, pending and retry states work with keyboard controls
  and a narrow viewport. No duplicate or restore controls were added.
- `Script.delete` requires authentication. The application service passes the
  current owner to an atomic D1 operation. Other owners and missing IDs return
  `ScriptNotFound`; the same owner can safely repeat deletion using its receipt.
- Migration `0004` adds durable owner-scoped deletion receipts. One D1 batch
  records the receipt and deletes Night Order entries, Jinxes, Character artwork,
  Script artwork, import data, Characters and the Script in foreign-key order.
  A failure rolls back the entire batch. Existing writes require surviving owner
  rows, so delayed updates cannot recreate a deleted Script or its Characters.
- After D1 commits, R2 cleanup lists the private `<scriptId>/` prefix and deletes
  each page in a batch. This includes current Character/Script originals and any
  imported or orphaned sources under that prefix. Published storage is untouched.
  R2 and D1 do not share a transaction. A cleanup failure remains visible and
  leaves a pending receipt. Retrying deletion or the owner's next workspace read
  resumes cleanup; completion marks the receipt clean. Receipts remain for safe
  retries. Recovery requires another request; there is no scheduled sweeper.
- Successful deletion invalidates the workspace list and all related owner/public
  queries for that Script. Public reads/exports and owner edit loaders return
  not-found after deletion. Previously exported artwork remains immutable.

## Checks

- `bun run check`: formatting, lint, typecheck and 172 tests across 27 files.
  Existing non-fatal lint warnings remain.
- `bun run test:e2e e2e/delete-script.spec.ts`: one Chromium journey against the
  managed local Worker, D1 and R2. Covers a 390px viewport, keyboard confirmation,
  cancellation, transport failure/retry, non-owner denial, list invalidation,
  cached share-page invalidation, unavailable edit/share pages, repeated deletion,
  and anonymous loading of a logo URL from a previous JSON export.
- Service tests cover complete content/private-original removal, other Scripts
  remaining intact, published retention, late saves/creation denial, repeated
  cleanup, partial R2 failure and owner-scoped recovery on workspace loading.
- Real Miniflare adapter tests cover rollback after an injected final D1 delete
  failure, removal of every dependent table, owner receipts and late-write denial.
  R2 tests cover more than one listing page (1,003 originals), repeated cleanup,
  and retention of another Script's sources and published assets.

## External prerequisites

Deploy migration `0004` before serving the updated Worker. Production deployment
and Cloudflare binding/permission checks were not performed. Real mobile Safari
and Android Chrome were not available; the narrow-screen check uses Chromium.
