import type { OwnedScript } from "@alchemist/domain";
import { Effect, Layer, Option } from "effect";
import { ScriptStore, ScriptsLive } from "../../src/scripts.ts";

// In-memory ScriptStore with the same owner scoping as the D1 adapter.
export const scriptsFixture = Effect.sync(() => {
  const rows = new Map<string, OwnedScript & { readonly ownerId: string }>();

  const project = (row: OwnedScript): OwnedScript => ({
    id: row.id,
    name: row.name,
    authorCredit: row.authorCredit,
    updatedAt: row.updatedAt,
  });

  const owned = (ownerId: string, id: string) =>
    Option.fromNullishOr(rows.get(id)).pipe(Option.filter((row) => row.ownerId === ownerId));

  const store = Layer.succeed(ScriptStore, {
    findPublic: (id) =>
      Effect.sync(() =>
        Option.fromNullishOr(rows.get(id)).pipe(
          Option.map((row) => ({
            id: row.id,
            name: row.name,
            authorCredit: row.authorCredit,
            characters: [],
          })),
        ),
      ),
    insert: (ownerId, script) =>
      Effect.sync(() => {
        rows.set(script.id, {
          ownerId,
          id: script.id,
          name: script.name,
          authorCredit: script.authorCredit,
          updatedAt: script.updatedAt,
        });
      }),
    listOwned: (ownerId) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((row) => row.ownerId === ownerId)
          .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
          .map(project),
      ),
    findOwned: (ownerId, id) => Effect.sync(() => owned(ownerId, id).pipe(Option.map(project))),
    updateDetails: (ownerId, id, details, now) =>
      Effect.sync(() =>
        owned(ownerId, id).pipe(
          Option.map((row) => {
            const updated = {
              ownerId,
              id: row.id,
              name: details.name,
              authorCredit: details.authorCredit,
              updatedAt: now,
            };

            rows.set(id, updated);

            return project(updated);
          }),
        ),
      ),
  });

  return { rows, layer: ScriptsLive.pipe(Layer.provide(store)) };
});
