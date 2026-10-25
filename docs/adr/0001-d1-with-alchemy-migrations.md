# Use D1 with Alchemy-managed SQL migrations

Alchemist v1 uses Cloudflare D1 through Effect SQL, keeping persistence within the existing Cloudflare deployment for the owner and their group. We accept atomic batches instead of interactive Effect transactions; Postgres via Hyperdrive offers richer transactions but adds another provider and has unverified compatibility with the pinned Effect driver.

Schema changes live as numbered SQL migration files committed to Git and applied by Alchemy during deployment. This keeps migration application with our infrastructure tooling rather than using Effect's shared migrator, which depends on transactions unsupported by the D1 client.

## Consequences

- Applied migration files are immutable; subsequent changes use new files.
- Multi-statement writes must fit D1's atomic batch constraints rather than relying on `SqlClient.withTransaction`.
- Schema changes should remain compatible with the running Worker while deployment is in progress. A failed Worker deployment must not be assumed to undo applied migrations.
- Implementation must verify migration support in the selected Alchemy version, local migration application against the dev server's actual database, and migration-before-Worker deployment ordering. No up-front stack spike is required.

Context: [Persistence choice: D1 or Postgres via Hyperdrive](https://github.com/mgramigna/alchemist/issues/9). Alchemy documents numbered SQL migrations and applied-migration tracking in its [D1 migration guide](https://alchemy.run/cloudflare/data/d1/); that integration has not yet been exercised in Alchemist.
