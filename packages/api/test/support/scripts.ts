import type { Character, OwnedScript } from "@alchemist/domain";
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

  const characters = new Map<
    string,
    { readonly scriptId: string; readonly character: Character }
  >();

  const inScript = (scriptId: string) =>
    [...characters.values()]
      .flatMap((row) => (row.scriptId === scriptId ? [row.character] : []))
      .sort((a, b) => a.id.localeCompare(b.id));

  // Callers have already checked ownership.
  const touch = (scriptId: string, now: number) => {
    const row = rows.get(scriptId);

    if (row !== undefined)
      rows.set(scriptId, {
        ownerId: row.ownerId,
        id: row.id,
        name: row.name,
        authorCredit: row.authorCredit,
        updatedAt: now,
      });
  };

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
            characters: inScript(id),
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
    listCharacters: (ownerId, scriptId) =>
      Effect.sync(() => (Option.isSome(owned(ownerId, scriptId)) ? inScript(scriptId) : [])),
    insertCharacter: (ownerId, scriptId, character, now) =>
      Effect.sync(() => {
        if (Option.isNone(owned(ownerId, scriptId))) return Option.none();

        characters.set(character.id, { scriptId, character });
        touch(scriptId, now);

        return Option.some(character);
      }),
    updateCharacter: (ownerId, scriptId, id, details, now) =>
      Effect.sync(() => {
        const row = characters.get(id);

        if (Option.isNone(owned(ownerId, scriptId)) || row?.scriptId !== scriptId)
          return Option.none();

        const character = { id, name: details.name, ability: details.ability, team: details.team };

        characters.set(id, { scriptId, character });
        touch(scriptId, now);

        return Option.some(character);
      }),
    deleteCharacter: (ownerId, scriptId, id, now) =>
      Effect.sync(() => {
        if (Option.isNone(owned(ownerId, scriptId)) || characters.get(id)?.scriptId !== scriptId)
          return false;

        characters.delete(id);
        touch(scriptId, now);

        return true;
      }),
  });

  return { rows, characters, layer: ScriptsLive.pipe(Layer.provide(store)) };
});
