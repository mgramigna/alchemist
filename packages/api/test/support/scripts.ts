import {
  type ImportedData,
  type Jinx,
  jinxKey,
  defaultNightOrders,
  isNightStep,
  setNightOrder,
  ScriptWriteUnavailable,
  type Character,
  type NightOrders,
  type OwnedScript,
} from "@alchemist/domain";
import { Effect, Layer, Option } from "effect";
import { ScriptStore, ScriptsLive } from "../../src/scripts.ts";

// In-memory ScriptStore with the same owner scoping as the D1 adapter.
export const scriptsFixture = Effect.sync(() => {
  const imports = new Map<string, ImportedData>();
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

  const jinxes = new Map<string, { scriptId: string; jinx: Jinx }>();

  const inJinxes = (scriptId: string) =>
    [...jinxes.values()].flatMap((row) => (row.scriptId === scriptId ? [row.jinx] : []));

  const nightOrders = new Map<string, NightOrders>();

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
    useGenericArtwork: (ownerId, id, field, characterId, now) =>
      Effect.sync(() => {
        const imported = imports.get(id);

        if (Option.isNone(owned(ownerId, id)) || imported === undefined) return false;
        imports.set(id, {
          ...imported,
          artwork: imported.artwork.filter(
            (art) => art.field !== field || (art.characterId ?? null) !== characterId,
          ),
        });
        touch(id, now);

        return true;
      }),
    insertImport: (ownerId, script, draft) =>
      Effect.sync(() => {
        rows.set(script.id, { ...script, ownerId });

        for (const character of draft.characters)
          characters.set(`${script.id}:${character.id}`, { scriptId: script.id, character });

        for (const jinx of draft.jinxes)
          jinxes.set(`${script.id}:${jinxKey(jinx)}`, { scriptId: script.id, jinx });
        nightOrders.set(script.id, draft.nightOrders);
        imports.set(script.id, draft.imported);
      }),
    readImported: (ownerId, id) =>
      Effect.sync(() => (Option.isSome(owned(ownerId, id)) ? (imports.get(id) ?? null) : null)),
    findExport: (id) =>
      Effect.sync(() =>
        Option.fromNullishOr(rows.get(id)).pipe(
          Option.map((row) => ({
            script: project(row),
            characters: inScript(id),
            nightOrders: nightOrders.get(id) ?? defaultNightOrders,
            jinxes: inJinxes(id),
            imported: imports.get(id),
          })),
        ),
      ),
    findPublic: (id) =>
      Effect.sync(() =>
        Option.fromNullishOr(rows.get(id)).pipe(
          Option.map((row) => ({
            id: row.id,
            name: row.name,
            authorCredit: row.authorCredit,
            characters: inScript(id),
            nightOrders: nightOrders.get(id) ?? defaultNightOrders,
            jinxes: inJinxes(id),
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
        nightOrders.set(script.id, defaultNightOrders);
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
    insertCharacter: (ownerId, scriptId, character, orders, now) =>
      Effect.sync(() => {
        if (Option.isNone(owned(ownerId, scriptId))) return Option.none();

        characters.set(`${scriptId}:${character.id}`, { scriptId, character });
        nightOrders.set(scriptId, orders);
        touch(scriptId, now);

        return Option.some(character);
      }),
    updateCharacter: (ownerId, scriptId, id, details, now) =>
      Effect.sync(() => {
        const row = characters.get(`${scriptId}:${id}`);

        if (Option.isNone(owned(ownerId, scriptId)) || row?.scriptId !== scriptId)
          return Option.none();

        const character = {
          id,
          name: details.name,
          ability: details.ability,
          team: details.team,
          firstNightInstructions: details.firstNightInstructions,
          otherNightInstructions: details.otherNightInstructions,
          reminders: details.reminders,
          remindersGlobal: details.remindersGlobal,
          setup: details.setup,
          flavor: details.flavor,
        };

        characters.set(`${scriptId}:${id}`, { scriptId, character });
        touch(scriptId, now);

        return Option.some(character);
      }),
    deleteCharacter: (ownerId, scriptId, id, now) =>
      Effect.sync(() => {
        if (
          Option.isNone(owned(ownerId, scriptId)) ||
          characters.get(`${scriptId}:${id}`)?.scriptId !== scriptId
        )
          return false;

        characters.delete(`${scriptId}:${id}`);

        for (const [key, row] of jinxes)
          if (row.scriptId === scriptId && (row.jinx.first === id || row.jinx.second === id))
            jinxes.delete(key);

        const orders = nightOrders.get(scriptId) ?? defaultNightOrders;

        nightOrders.set(scriptId, {
          firstNight: orders.firstNight.filter((entry) => entry !== id),
          otherNight: orders.otherNight.filter((entry) => entry !== id),
        });
        touch(scriptId, now);

        return true;
      }),
    listJinxes: (ownerId, scriptId) =>
      Effect.sync(() => (Option.isSome(owned(ownerId, scriptId)) ? inJinxes(scriptId) : [])),
    insertJinx: (ownerId, scriptId, jinx, now) =>
      Effect.gen(function* () {
        if (Option.isNone(owned(ownerId, scriptId))) return Option.none();

        if (
          ![jinx.first, jinx.second].every(
            (id) => characters.get(`${scriptId}:${id}`)?.scriptId === scriptId,
          ) ||
          jinx.first >= jinx.second
        )
          return yield* new ScriptWriteUnavailable({});
        const key = `${scriptId}:${jinxKey(jinx)}`;

        if (jinxes.has(key)) return Option.none();
        jinxes.set(key, { scriptId, jinx });
        touch(scriptId, now);

        return Option.some(jinx);
      }),
    updateJinx: (ownerId, scriptId, jinx, now) =>
      Effect.sync(() => {
        const key = `${scriptId}:${jinxKey(jinx)}`;

        if (Option.isNone(owned(ownerId, scriptId)) || !jinxes.has(key)) return Option.none();
        jinxes.set(key, { scriptId, jinx });
        touch(scriptId, now);

        return Option.some(jinx);
      }),
    deleteJinx: (ownerId, scriptId, pair, now) =>
      Effect.sync(() => {
        if (Option.isNone(owned(ownerId, scriptId))) return false;
        const removed = jinxes.delete(`${scriptId}:${jinxKey(pair)}`);

        if (removed) touch(scriptId, now);

        return removed;
      }),
    findNightOrders: (ownerId, scriptId) =>
      Effect.sync(() =>
        owned(ownerId, scriptId).pipe(
          Option.map(() => nightOrders.get(scriptId) ?? defaultNightOrders),
        ),
      ),
    // Mirrors the D1 foreign key: a reference to another Script's Character fails the write.
    replaceNightOrder: (ownerId, scriptId, night, order, now) =>
      Effect.gen(function* () {
        if (Option.isNone(owned(ownerId, scriptId))) return Option.none();

        if (
          order.some(
            (entry) =>
              !isNightStep(entry) && characters.get(`${scriptId}:${entry}`)?.scriptId !== scriptId,
          )
        )
          return yield* new ScriptWriteUnavailable({});

        const orders = setNightOrder(nightOrders.get(scriptId) ?? defaultNightOrders, night, order);

        nightOrders.set(scriptId, orders);
        touch(scriptId, now);

        return Option.some(orders);
      }),
  });

  return { rows, characters, nightOrders, layer: ScriptsLive.pipe(Layer.provide(store)) };
});
