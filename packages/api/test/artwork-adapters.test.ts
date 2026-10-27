import {
  Character,
  CharacterId,
  OwnedScript,
  ScriptId,
  defaultNightOrders,
} from "@alchemist/domain";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, assert, beforeAll, expect, test } from "vitest";
import { AppConfig, handleRequest } from "../src/app.ts";
import {
  ArtworkStorage,
  PUBLISHED_CACHE_CONTROL,
  r2ArtworkStorage,
} from "../src/artwork-storage.ts";
import { D1ScriptStore } from "../src/d1.ts";
import { Auth } from "../src/auth.ts";
import {
  ScriptStore,
  Scripts,
  type StoredArtwork,
  type StoredScriptImage,
} from "../src/scripts.ts";
import { png } from "./support/images.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  compatibilityDate: "2026-07-01",
  d1Databases: ["DB"],
  r2Buckets: ["SOURCES", "PUBLISHED"],
});

const db = await mf.getD1Database("DB");
const sources = await mf.getR2Bucket("SOURCES");
const published = await mf.getR2Bucket("PUBLISHED");
const store = D1ScriptStore.pipe(Layer.provide(D1Client.layer({ db })));
const storage = r2ArtworkStorage(sources, published);

const run = <A, E>(
  effect: Effect.Effect<A, E, ScriptStore | ArtworkStorage | AppConfig | Auth | Scripts>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          store,
          storage,
          Layer.succeed(AppConfig, { origin: "https://a.test" }),
          // Artwork requests never reach authentication or Script workflows.
          Layer.mock(Auth, {}),
          Layer.mock(Scripts, {}),
        ),
      ),
    ),
  );

const scriptId = ScriptId.make("01k8ae00000000000000000001");
const characterId = CharacterId.make("01k8ae00000000000000000002");

const artwork = (sourceId: string, team: "townsfolk" | "minion" = "townsfolk"): StoredArtwork => ({
  sourceId,
  sourceType: "image/png",
  style: { look: "auto" },
  team,
  variants: [
    { variant: "regular", path: `/artwork/${sourceId}r.png` },
    { variant: "flipped", path: `/artwork/${sourceId}f.png` },
  ],
});

beforeAll(async () => {
  const migrations = new URL("../migrations/", import.meta.url);

  for (const filename of (await readdir(migrations)).sort()) {
    const sql = await readFile(new URL(filename, migrations), "utf8");

    for (const statement of sql.split(";")) if (statement.trim()) await db.prepare(statement).run();
  }

  await db.batch([
    db.prepare("INSERT INTO users (id, display_name) VALUES ('alice', 'Alice')"),
    db.prepare("INSERT INTO users (id, display_name) VALUES ('bob', 'Bob')"),
  ]);
  await run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      yield* scripts.insert(
        "alice",
        OwnedScript.make({ id: scriptId, name: "Art", authorCredit: "Alice", updatedAt: 1 }),
      );
      yield* scripts.insertCharacter(
        "alice",
        scriptId,
        Character.make({
          id: characterId,
          name: "Seer",
          ability: "",
          team: "townsfolk",
          firstNightInstructions: "",
          otherNightInstructions: "",
          reminders: [],
          remindersGlobal: [],
          setup: false,
          flavor: "",
        }),
        defaultNightOrders,
        2,
      );
    }),
  );
});

afterAll(() => mf.dispose());

test("D1 switches artwork only from the expected original, scoped to the owner, and projects it per reader", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const first = artwork("aaaaaaaaaaaaaaaaaaaaaaaaa1");

      // Studio settings round-trip through D1 alongside the Look.
      const second: StoredArtwork = {
        ...artwork("aaaaaaaaaaaaaaaaaaaaaaaaa2", "minion"),
        style: { look: "shaded", cutout: "edge", tolerance: 0.15, teamShades: true, offsetX: -12 },
      };

      expect(yield* scripts.replaceArtwork("bob", scriptId, characterId, first, null, 3)).toBe(
        false,
      );
      expect(yield* scripts.replaceArtwork("alice", scriptId, characterId, first, null, 3)).toBe(
        true,
      );
      // A second "first upload" or a stale expected original writes nothing.
      expect(yield* scripts.replaceArtwork("alice", scriptId, characterId, second, null, 4)).toBe(
        false,
      );
      expect(
        yield* scripts.replaceArtwork("alice", scriptId, characterId, second, "stale", 4),
      ).toBe(false);
      expect(
        yield* scripts.replaceArtwork("alice", scriptId, characterId, second, first.sourceId, 5),
      ).toBe(true);

      expect(yield* scripts.findArtwork("alice", scriptId, characterId)).toEqual(
        Option.some({ team: "townsfolk", artwork: second }),
      );
      expect(yield* scripts.findArtwork("bob", scriptId, characterId)).toEqual(Option.none());
      expect(
        (yield* scripts.findOwned("alice", scriptId)).pipe(Option.map((s) => s.updatedAt)),
      ).toEqual(Option.some(5));

      const [owned] = yield* scripts.listCharacters("alice", scriptId);
      assert(owned);
      expect(owned.artwork).toEqual({
        team: "minion",
        variants: second.variants,
        sourceId: second.sourceId,
        style: second.style,
      });

      const updated = yield* scripts.updateCharacter(
        "alice",
        scriptId,
        characterId,
        { ...owned, team: "minion" },
        6,
      );

      expect(Option.getOrNull(updated)?.artwork?.sourceId).toBe(second.sourceId);

      const viewed = Option.getOrNull(yield* scripts.findPublic(scriptId))?.characters[0];
      expect(viewed?.artwork).toEqual({ team: "minion", variants: second.variants });

      // Removing the Character removes its artwork row in the same batch.
      expect(yield* scripts.deleteCharacter("alice", scriptId, characterId, 7)).toBe(true);

      const rows = yield* Effect.promise(() =>
        db.prepare("SELECT COUNT(*) AS n FROM character_artwork").first<{ n: number }>(),
      );

      expect(rows?.n).toBe(0);
    }),
  ));

test("R2 never overwrites a published key and the Worker serves it publicly with immutable caching", () =>
  run(
    Effect.gen(function* () {
      const artworkStorage = yield* ArtworkStorage;
      const image = png(400, 400, 7);
      const key = "artwork/01k8ae00000000000000000009.png";
      yield* artworkStorage.publish(key, image, "image/png");

      const overwrite = yield* artworkStorage
        .publish(key, png(400, 400, 8), "image/png")
        .pipe(Effect.flip);

      expect(overwrite._tag).toBe("ScriptWriteUnavailable");

      const response = yield* handleRequest(
        new Request(`https://a.test/${key}`, { headers: { Origin: "https://botc.app" } }),
      );

      expect(response.status).toBe(200);
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "access-control-allow-origin": "*",
        "cache-control": PUBLISHED_CACHE_CONTROL,
        "content-type": "image/png",
      });
      expect(new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))).toEqual(image);

      const etag = response.headers.get("etag") ?? "";

      const revalidated = yield* handleRequest(
        new Request(`https://a.test/${key}`, { headers: { "If-None-Match": etag } }),
      );

      expect(revalidated.status).toBe(304);

      const head = yield* handleRequest(new Request(`https://a.test/${key}`, { method: "HEAD" }));
      expect(head.status).toBe(200);

      for (const path of [
        "artwork/01k8ae00000000000000000000.png",
        "artwork/not-an-id.png",
        "artwork/01k8ae00000000000000000009.png.bak",
      ]) {
        const missing = yield* handleRequest(new Request(`https://a.test/${path}`));
        expect(missing.status).toBe(404);
        expect(missing.headers.get("cache-control")).toBe("no-store");
      }

      // Originals live in a separate bucket that has no public route.
      yield* artworkStorage.putSource(`${scriptId}/original`, image, "image/png");
      expect(yield* artworkStorage.readSource(`${scriptId}/original`)).toEqual(Option.some(image));
      yield* artworkStorage.deleteSource(`${scriptId}/original`);
      expect(yield* artworkStorage.readSource(`${scriptId}/original`)).toEqual(Option.none());
      expect(yield* artworkStorage.readPublished(`${scriptId}/original`)).toEqual(Option.none());
    }),
  ));

test("D1 switches Script artwork only from the expected original, scoped to the owner, and projects paths", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;

      const image = (sourceId: string, extension = "png"): StoredScriptImage => ({
        sourceId,
        sourceType: extension === "png" ? "image/png" : "image/jpeg",
        path: `/artwork/${sourceId}.${extension}`,
      });

      const first = image("bbbbbbbbbbbbbbbbbbbbbbbbb1");
      const second = image("bbbbbbbbbbbbbbbbbbbbbbbbb2", "jpg");

      expect(yield* scripts.findScriptArtwork("alice", scriptId)).toEqual(
        Option.some({ logo: null, background: null }),
      );
      expect(yield* scripts.findScriptArtwork("bob", scriptId)).toEqual(Option.none());

      expect(yield* scripts.replaceScriptArtwork("bob", scriptId, "logo", first, null, 10)).toBe(
        false,
      );
      expect(yield* scripts.replaceScriptArtwork("alice", scriptId, "logo", first, null, 10)).toBe(
        true,
      );
      // A second "first upload" or a stale expected original writes nothing.
      expect(yield* scripts.replaceScriptArtwork("alice", scriptId, "logo", second, null, 11)).toBe(
        false,
      );
      expect(
        yield* scripts.replaceScriptArtwork("alice", scriptId, "logo", second, "stale", 11),
      ).toBe(false);
      expect(
        yield* scripts.replaceScriptArtwork("alice", scriptId, "background", second, null, 12),
      ).toBe(true);

      expect(yield* scripts.findScriptArtwork("alice", scriptId)).toEqual(
        Option.some({ logo: first, background: second }),
      );
      expect(
        (yield* scripts.findOwned("alice", scriptId)).pipe(Option.map((s) => s.updatedAt)),
      ).toEqual(Option.some(12));

      const paths = { logo: first.path, background: second.path };
      expect(Option.getOrNull(yield* scripts.findPublic(scriptId))?.artwork).toEqual(paths);
      expect(Option.getOrNull(yield* scripts.findExport(scriptId))?.artwork).toEqual(paths);
      expect(JSON.stringify(yield* scripts.findPublic(scriptId))).not.toContain("image/png");

      // Removal is scoped to the owner and the expected original.
      expect(yield* scripts.deleteScriptArtwork("bob", scriptId, "logo", first.sourceId, 13)).toBe(
        false,
      );
      expect(yield* scripts.deleteScriptArtwork("alice", scriptId, "logo", "stale", 13)).toBe(
        false,
      );
      expect(
        yield* scripts.deleteScriptArtwork("alice", scriptId, "logo", first.sourceId, 13),
      ).toBe(true);
      expect(Option.getOrNull(yield* scripts.findPublic(scriptId))?.artwork).toEqual({
        logo: null,
        background: second.path,
      });
    }),
  ));

test("D1 Script artwork supersedes only the matching imported reference", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const importedId = ScriptId.make("01k8ae00000000000000000003");

      yield* scripts.insertImport(
        "alice",
        OwnedScript.make({ id: importedId, name: "Imported", authorCredit: "A", updatedAt: 1 }),
        {
          script: { name: "Imported", authorCredit: "A" },
          characters: [],
          nightOrders: defaultNightOrders,
          jinxes: [],
          imported: {
            metadata: {},
            characters: [],
            artwork: (["logo", "background"] as const).map((field) => ({
              field,
              format: "single" as const,
              slots: [{ source: `https://example.org/${field}.png`, state: "pending" as const }],
            })),
          },
        },
      );

      expect(
        yield* scripts.replaceScriptArtwork(
          "alice",
          importedId,
          "logo",
          {
            sourceId: "ccccccccccccccccccccccccc1",
            sourceType: "image/png",
            path: "/artwork/ccccccccccccccccccccccccc1.png",
          },
          null,
          2,
        ),
      ).toBe(true);
      expect(
        (yield* scripts.readImported("alice", importedId))?.artwork.map(({ field }) => field),
      ).toEqual(["background"]);
    }),
  ));

test("the Worker serves Script artwork in its published format", () =>
  run(
    Effect.gen(function* () {
      const artworkStorage = yield* ArtworkStorage;
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
      const key = "artwork/01k8ae0000000000000000000a.jpg";
      yield* artworkStorage.publish(key, jpeg, "image/jpeg");

      const response = yield* handleRequest(new Request(`https://a.test/${key}`));
      expect(response.status).toBe(200);
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "access-control-allow-origin": "*",
        "cache-control": PUBLISHED_CACHE_CONTROL,
        "content-type": "image/jpeg",
      });
      expect(new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))).toEqual(jpeg);

      for (const path of [
        "artwork/01k8ae0000000000000000000a.svg",
        "artwork/01k8ae0000000000000000000a.jpeg",
      ])
        expect((yield* handleRequest(new Request(`https://a.test/${path}`))).status).toBe(404);
    }),
  ));

test("R2 prefix deletion spans pages, is repeatable, and leaves other Scripts and published images intact", async () => {
  const prefix = "deleted-script/";
  await Promise.all(
    Array.from({ length: 1003 }, (_, i) =>
      sources.put(`${prefix}${String(i).padStart(4, "0")}`, png(10, 10)),
    ),
  );
  await sources.put("another-script/original", png(10, 10));
  await published.put("artwork/deleted-script.png", png(10, 10));
  await run(
    Effect.gen(function* () {
      const storage = yield* ArtworkStorage;
      yield* storage.deleteSources(prefix);
      yield* storage.deleteSources(prefix);
    }),
  );
  expect((await sources.list({ prefix })).objects).toHaveLength(0);
  expect(await sources.get("another-script/original")).not.toBeNull();
  expect(await published.get("artwork/deleted-script.png")).not.toBeNull();
});
