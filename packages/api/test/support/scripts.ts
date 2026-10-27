import {
  ScriptId,
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
  type ScriptArtworkField,
} from "@alchemist/domain";
import { Effect, Layer, Option } from "effect";
import { ArtworkStorage } from "../../src/artwork-storage.ts";
import {
  ScriptStore,
  ScriptsLive,
  publicScriptArtwork,
  type StoredArtwork,
  type StoredScriptArtwork,
} from "../../src/scripts.ts";

// In-memory buckets. Publishing refuses existing keys like the R2 adapter, and
// `failPublishAfter` makes the nth later publish fail to exercise partial writes.
export const storageFixture = () => {
  const sources = new Map<string, Uint8Array>();
  const published = new Map<string, Uint8Array>();
  const publishedTypes = new Map<string, string>();

  const control = {
    failPublishAfter: Number.POSITIVE_INFINITY,
    failSourceWrites: false,
    failCleanup: false,
    failCleanupAfter: Number.POSITIVE_INFINITY,
  };

  const layer = Layer.succeed(ArtworkStorage, {
    putSource: (key, bytes) =>
      control.failSourceWrites
        ? Effect.fail(new ScriptWriteUnavailable({}))
        : Effect.sync(() => void sources.set(key, bytes)),
    readSource: (key) => Effect.sync(() => Option.fromNullishOr(sources.get(key))),
    deleteSources: (prefix) =>
      Effect.suspend(() => {
        if (control.failCleanup) return Effect.fail(new ScriptWriteUnavailable({}));

        for (const key of sources.keys()) {
          if (!key.startsWith(prefix)) continue;

          if (control.failCleanupAfter-- <= 0) return Effect.fail(new ScriptWriteUnavailable({}));
          sources.delete(key);
        }

        return Effect.void;
      }),
    deleteSource: (key) => Effect.sync(() => void sources.delete(key)),
    publish: (key, image, contentType) =>
      Effect.suspend(() => {
        if (published.has(key) || control.failPublishAfter-- <= 0)
          return Effect.fail(new ScriptWriteUnavailable({}));
        published.set(key, image);
        publishedTypes.set(key, contentType);

        return Effect.void;
      }),
    readPublished: (key) =>
      Effect.sync(() =>
        Option.fromNullishOr(published.get(key)).pipe(
          Option.map((bytes) => ({ bytes, etag: `"${key}"` })),
        ),
      ),
  });

  return { sources, published, publishedTypes, control, layer };
};

// In-memory ScriptStore with the same owner scoping as the D1 adapter.
export const scriptsFixture = Effect.sync(() => {
  const imports = new Map<string, ImportedData>();
  const artwork = new Map<string, StoredArtwork>();
  const scriptArtwork = new Map<string, StoredScriptArtwork>();

  const slotsOf = (scriptId: string) =>
    scriptArtwork.get(scriptId) ?? { logo: null, background: null };

  const withArtwork = (scriptId: string, character: Character): Character => {
    const stored = artwork.get(`${scriptId}:${character.id}`);

    return stored === undefined
      ? character
      : {
          ...character,
          artwork: {
            team: stored.team,
            variants: stored.variants,
            sourceId: stored.sourceId,
            style: stored.style,
          },
        };
  };

  const deletions = new Map<string, string>();
  const completedDeletions = new Set<string>();
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

  // Drops imported references the new artwork supersedes.
  const dropImported = (scriptId: string, field: string, characterId: string | null) => {
    const imported = imports.get(scriptId);

    if (imported !== undefined)
      imports.set(scriptId, {
        ...imported,
        artwork: imported.artwork.filter(
          (art) => art.field !== field || (art.characterId ?? null) !== characterId,
        ),
      });
  };

  const setSlot = (
    scriptId: string,
    field: ScriptArtworkField,
    image: StoredScriptArtwork[ScriptArtworkField],
  ) => scriptArtwork.set(scriptId, { ...slotsOf(scriptId), [field]: image });

  const store = Layer.succeed(ScriptStore, {
    pendingDeletions: (ownerId) =>
      Effect.sync(() =>
        [...deletions].flatMap(([id, owner]) =>
          owner === ownerId && !completedDeletions.has(id) ? [ScriptId.make(id)] : [],
        ),
      ),
    finishDeletion: (_, id) => Effect.sync(() => void completedDeletions.add(id)),
    deleteOwned: (ownerId, id) =>
      Effect.sync(() => {
        if (Option.isSome(owned(ownerId, id))) {
          deletions.set(id, ownerId);
          rows.delete(id);
          imports.delete(id);
          scriptArtwork.delete(id);
          nightOrders.delete(id);

          for (const [key, row] of characters) if (row.scriptId === id) characters.delete(key);

          for (const [key, row] of jinxes) if (row.scriptId === id) jinxes.delete(key);

          for (const key of artwork.keys()) if (key.startsWith(`${id}:`)) artwork.delete(key);
        }

        const allowed = deletions.get(id) === ownerId;

        if (allowed) completedDeletions.delete(id);

        return allowed;
      }),
    findScriptArtwork: (ownerId, scriptId) =>
      Effect.sync(() => owned(ownerId, scriptId).pipe(Option.map(() => slotsOf(scriptId)))),
    replaceScriptArtwork: (ownerId, scriptId, field, image, expectedSourceId, now) =>
      Effect.sync(() => {
        if (
          Option.isNone(owned(ownerId, scriptId)) ||
          (slotsOf(scriptId)[field]?.sourceId ?? null) !== expectedSourceId
        )
          return false;
        setSlot(scriptId, field, image);
        dropImported(scriptId, field, null);
        touch(scriptId, now);

        return true;
      }),
    deleteScriptArtwork: (ownerId, scriptId, field, expectedSourceId, now) =>
      Effect.sync(() => {
        if (
          Option.isNone(owned(ownerId, scriptId)) ||
          slotsOf(scriptId)[field]?.sourceId !== expectedSourceId
        )
          return false;
        setSlot(scriptId, field, null);
        touch(scriptId, now);

        return true;
      }),
    findArtwork: (ownerId, scriptId, id) =>
      Effect.sync(() => {
        const row = characters.get(`${scriptId}:${id}`);

        if (Option.isNone(owned(ownerId, scriptId)) || row === undefined) return Option.none();

        return Option.some({
          team: row.character.team,
          artwork: artwork.get(`${scriptId}:${id}`) ?? null,
        });
      }),
    replaceArtwork: (ownerId, scriptId, id, next, expectedSourceId, now) =>
      Effect.sync(() => {
        const key = `${scriptId}:${id}`;

        if (
          Option.isNone(owned(ownerId, scriptId)) ||
          !characters.has(key) ||
          (artwork.get(key)?.sourceId ?? null) !== expectedSourceId
        )
          return false;
        artwork.set(key, next);
        dropImported(scriptId, "image", id);
        touch(scriptId, now);

        return true;
      }),
    deleteArtwork: (ownerId, scriptId, id, now) =>
      Effect.sync(() => {
        if (Option.isNone(owned(ownerId, scriptId))) return false;
        const removed = artwork.delete(`${scriptId}:${id}`);

        if (removed) touch(scriptId, now);

        return removed;
      }),
    useGenericArtwork: (ownerId, id, field, characterId, now) =>
      Effect.sync(() => {
        const imported = imports.get(id);

        if (Option.isNone(owned(ownerId, id)) || imported === undefined) return false;
        dropImported(id, field, characterId);
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
            artwork: publicScriptArtwork(slotsOf(id)),
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
            artwork: publicScriptArtwork(slotsOf(id)),
            characters: inScript(id).map((character) => {
              const stored = artwork.get(`${id}:${character.id}`);

              return {
                id: character.id,
                name: character.name,
                ability: character.ability,
                team: character.team,
                firstNightInstructions: character.firstNightInstructions,
                otherNightInstructions: character.otherNightInstructions,
                ...(stored && { artwork: { team: stored.team, variants: stored.variants } }),
              };
            }),
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
      Effect.sync(() =>
        Option.isSome(owned(ownerId, scriptId))
          ? inScript(scriptId).map((character) => withArtwork(scriptId, character))
          : [],
      ),
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

        return Option.some(withArtwork(scriptId, character));
      }),
    deleteCharacter: (ownerId, scriptId, id, now) =>
      Effect.sync(() => {
        if (
          Option.isNone(owned(ownerId, scriptId)) ||
          characters.get(`${scriptId}:${id}`)?.scriptId !== scriptId
        )
          return false;

        characters.delete(`${scriptId}:${id}`);
        artwork.delete(`${scriptId}:${id}`);

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

  const storage = storageFixture();

  return {
    rows,
    characters,
    nightOrders,
    artwork,
    scriptArtwork,
    imports,
    storage,
    layer: ScriptsLive.pipe(Layer.provide(store), Layer.provideMerge(storage.layer)),
  };
});
