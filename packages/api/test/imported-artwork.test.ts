import {
  ArtworkConflict,
  CharacterId,
  INVALID_REFERENCE,
  ScriptNotFound,
  botcSchemaProblems,
  type User,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { Scripts, sourceKey } from "../src/scripts.ts";
import { UNREACHABLE, png } from "./support/images.ts";
import { scriptsFixture } from "./support/scripts.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };
const as = (user: User) => Effect.provideService(CurrentUser, user);
const origin = "https://alchemist.example";

const host = "https://art.example.net";
const seerImage = png(512, 512, 1);
const shadeEvil = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 2, 2]);
const shadeGood = png(300, 300, 3);
const logo = png(1200, 300, 4);
const background = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 5]);

const character = (id: string, team: string, image?: string | ReadonlyArray<string>) => ({
  id,
  name: id,
  team,
  ability: "An ability.",
  ...(image !== undefined && { image }),
});

const json = JSON.stringify([
  {
    id: "_meta",
    name: "Copied Moon",
    logo: `${host}/logo.png`,
    background: `${host}/background.jpg`,
  },
  character("seer", "townsfolk", `${host}/seer.png`),
  // A failed variant between two successful ones keeps its slot.
  character("shade", "minion", [`${host}/shade-evil.jpg`, `${host}/shade-good.png`, "not a url"]),
  character("moth", "outsider", [`${host}/moth.png`]),
  character("moon", "demon"),
]);

const images = (json: string): Record<string, string | ReadonlyArray<string>> =>
  Object.fromEntries(
    Schema.decodeUnknownSync(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          image: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
        }),
      ),
    )(JSON.parse(json)).flatMap(({ id, image }) => (image === undefined ? [] : [[id, image]])),
  );

const setup = Effect.gen(function* () {
  const f = yield* scriptsFixture;
  f.fetcher.images.set(`${host}/seer.png`, seerImage);
  f.fetcher.images.set(`${host}/shade-evil.jpg`, shadeEvil);
  f.fetcher.images.set(`${host}/logo.png`, logo);

  return f;
});

it.effect(
  "import copies every reachable slot unchanged, falls back per slot and exports no external URL",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.importJson(json, false, origin);
        const characters = yield* scripts.listCharacters(script.id);
        const seer = characters.find(({ id }) => id === "seer")?.artwork;
        const shade = characters.find(({ id }) => id === "shade")?.artwork;
        assert(seer && shade);

        // One variant per supplied slot, in order, flagged as imported and unstyled.
        assert.isTrue(seer.imported);
        assert.deepStrictEqual(seer.style, { look: "auto" });
        assert.lengthOf(seer.variants, 1);
        assert.match(seer.variants[0]?.path ?? "", /^\/artwork\/[0-9a-z]{26}\.png$/);
        assert.deepStrictEqual(
          f.storage.published.get(seer.variants[0]?.path.slice(1) ?? ""),
          seerImage,
        );
        assert.deepStrictEqual(
          f.storage.sources.get(sourceKey(script.id, seer.sourceId)),
          seerImage,
        );
        assert.deepStrictEqual(
          shade.variants.map(({ variant, path }) => [
            variant,
            path.startsWith("/icons/") ? path : "copy",
          ]),
          [
            ["regular", "copy"],
            ["flipped", "/icons/generic/v1/minion-good.svg"],
            ["regular", "/icons/generic/v1/minion-evil.svg"],
          ],
        );
        assert.match(shade.variants[0]?.path ?? "", /\.jpg$/);
        assert.isUndefined(characters.find(({ id }) => id === "moth")?.artwork);

        const imported = yield* scripts.readImported(script.id);

        const states = (id?: string, field = "image") =>
          imported?.artwork
            .find((art) => art.characterId === id && art.field === field)
            ?.slots.map(({ state, problem }) => (problem ? `${state}: ${problem}` : state));

        assert.deepStrictEqual(states("seer"), ["copied"]);
        assert.deepStrictEqual(states("shade"), [
          "copied",
          `failed: ${UNREACHABLE}`,
          `failed: ${INVALID_REFERENCE}`,
        ]);
        assert.deepStrictEqual(states("moth"), [`failed: ${UNREACHABLE}`]);
        assert.deepStrictEqual(states(undefined, "logo"), ["copied"]);
        assert.deepStrictEqual(states(undefined, "background"), [`failed: ${UNREACHABLE}`]);

        const artwork = yield* scripts.readScriptArtwork(script.id);
        assert.isNull(artwork.background);
        assert.deepStrictEqual(f.storage.published.get(artwork.logo?.slice(1) ?? ""), logo);

        for (const exported of [
          (yield* scripts.exportJson(script.id, origin)).json,
          (yield* scripts.exportPublicJson(script.id, origin)).json,
        ]) {
          assert.deepStrictEqual(botcSchemaProblems(JSON.parse(exported)), []);
          assert.notInclude(exported, host);
          const exportedImages = images(exported);
          // Single stays single; arrays keep their cardinality and order.
          assert.strictEqual(exportedImages["seer"], `${origin}${seer.variants[0]?.path}`);
          assert.deepStrictEqual(exportedImages["shade"], [
            `${origin}${shade.variants[0]?.path}`,
            `${origin}/icons/generic/v1/minion-good.svg`,
            `${origin}/icons/generic/v1/minion-evil.svg`,
          ]);
          assert.deepStrictEqual(exportedImages["moth"], [
            `${origin}/icons/generic/v1/outsider-good.svg`,
          ]);
          const meta = JSON.parse(exported)[0];
          assert.strictEqual(meta.logo, `${origin}${artwork.logo}`);
          assert.notProperty(meta, "background");
        }

        const viewed = JSON.stringify(yield* scripts.readPublic(script.id));
        assert.notInclude(viewed, host);
        assert.include(viewed, seer.variants[0]?.path ?? "missing");

        // The retained original is the imported image, the starting point for a restyle.
        const source = yield* scripts.readArtworkSource(script.id, CharacterId.make("seer"));
        assert.deepStrictEqual(source.bytes, seerImage);
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect(
  "retry copies only failed slots, keeps copies immune to host changes and is owner-only",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.importJson(json, false, origin).pipe(as(alice));
        const shadeId = CharacterId.make("shade");

        const before = (yield* scripts.listCharacters(script.id).pipe(as(alice))).find(
          ({ id }) => id === shadeId,
        )?.artwork;

        assert(before);

        assert.instanceOf(
          yield* scripts
            .retryImportedArtwork(script.id, "image", shadeId, origin)
            .pipe(as(bob), Effect.flip),
          ScriptNotFound,
        );

        // The host changes the copied image and fixes the missing one.
        f.fetcher.images.set(`${host}/shade-evil.jpg`, png(10, 10, 9));
        f.fetcher.images.set(`${host}/shade-good.png`, shadeGood);
        f.fetcher.requests.length = 0;

        const repair = yield* scripts
          .retryImportedArtwork(script.id, "image", shadeId, origin)
          .pipe(as(alice));

        assert.deepStrictEqual(f.fetcher.requests, [`${host}/shade-good.png`]);
        assert.deepStrictEqual(
          repair.reference.slots.map(({ state }) => state),
          ["copied", "copied", "failed"],
        );
        const after = repair.characterArtwork;
        assert(after);
        assert.strictEqual(after.sourceId, before.sourceId);
        assert.strictEqual(after.variants[0]?.path, before.variants[0]?.path);
        assert.deepStrictEqual(
          f.storage.published.get(after.variants[0]?.path.slice(1) ?? ""),
          shadeEvil,
        );
        assert.deepStrictEqual(
          f.storage.published.get(after.variants[1]?.path.slice(1) ?? ""),
          shadeGood,
        );
        assert.strictEqual(after.variants[2]?.path, "/icons/generic/v1/minion-evil.svg");

        // The repair is persisted and visible to later reads.
        const stored = (yield* scripts.readImported(script.id).pipe(as(alice)))?.artwork.find(
          (art) => art.characterId === shadeId,
        );

        assert.deepStrictEqual(stored, repair.reference);
        assert.deepStrictEqual(
          (yield* scripts.listCharacters(script.id).pipe(as(alice))).find(
            ({ id }) => id === shadeId,
          )?.artwork,
          after,
        );

        // A Script field whose first attempt failed gets its own private source.
        f.fetcher.images.set(`${host}/background.jpg`, background);

        const backgroundRepair = yield* scripts
          .retryImportedArtwork(script.id, "background", null, origin)
          .pipe(as(alice));

        assert.deepStrictEqual(
          f.storage.published.get(backgroundRepair.scriptArtwork.background?.slice(1) ?? ""),
          background,
        );

        const exported = JSON.parse(
          (yield* scripts.exportJson(script.id, origin).pipe(as(alice))).json,
        );

        assert.strictEqual(
          exported[0].background,
          `${origin}${backgroundRepair.scriptArtwork.background}`,
        );
        assert.strictEqual(
          f.storage.sources.get(
            sourceKey(script.id, f.scriptArtwork.get(script.id)?.background?.sourceId ?? ""),
          ),
          background,
        );

        // Moth's only slot copies on retry and becomes its artwork.
        f.fetcher.images.set(`${host}/moth.png`, png(64, 64, 6));

        const moth = yield* scripts
          .retryImportedArtwork(script.id, "image", CharacterId.make("moth"), origin)
          .pipe(as(alice));

        assert.strictEqual(moth.characterArtwork?.variants.length, 1);
        assert.strictEqual(
          images((yield* scripts.exportJson(script.id, origin).pipe(as(alice))).json)["moth"]?.[0],
          `${origin}${moth.characterArtwork?.variants[0]?.path}`,
        );
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "replacement and generic fallback supersede the import; a superseded retry conflicts",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.importJson(json, false, origin);
        const shadeId = CharacterId.make("shade");

        const shade = (yield* scripts.listCharacters(script.id)).find(
          ({ id }) => id === shadeId,
        )?.artwork;

        assert(shade);

        yield* scripts.useGenericArtwork(script.id, "image", shadeId);
        assert.isUndefined(
          (yield* scripts.listCharacters(script.id)).find(({ id }) => id === shadeId)?.artwork,
        );
        assert.isFalse(f.storage.sources.has(sourceKey(script.id, shade.sourceId)));
        // Published copies are retained for earlier exports.
        assert.isTrue(f.storage.published.has(shade.variants[0]?.path.slice(1) ?? ""));
        assert.instanceOf(
          yield* scripts
            .retryImportedArtwork(script.id, "image", shadeId, origin)
            .pipe(Effect.flip),
          ArtworkConflict,
        );
        assert.deepStrictEqual(
          images((yield* scripts.exportJson(script.id, origin)).json)["shade"],
          [
            `${origin}/icons/generic/v1/minion-evil.svg`,
            `${origin}/icons/generic/v1/minion-good.svg`,
          ],
        );

        // Removing the imported icons in the editor also ends the repair.
        yield* scripts.removeArtwork(script.id, CharacterId.make("seer"));
        assert.isUndefined(
          (yield* scripts.readImported(script.id))?.artwork.find(
            (art) => art.characterId === "seer",
          ),
        );

        // An uploaded logo replaces the imported one.
        const uploaded = yield* scripts.uploadScriptArtwork(
          script.id,
          "background",
          png(20, 20, 7),
        );

        assert.instanceOf(
          yield* scripts
            .retryImportedArtwork(script.id, "background", null, origin)
            .pipe(Effect.flip),
          ArtworkConflict,
        );
        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id), uploaded);
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect("re-importing an Alchemist export reuses its published images without fetching", () =>
  Effect.gen(function* () {
    const f = yield* setup;

    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const first = yield* scripts.importJson(json, false, origin);
      const exported = (yield* scripts.exportJson(first.id, origin)).json;
      f.fetcher.requests.length = 0;
      const published = f.storage.published.size;

      const second = yield* scripts.importJson(exported, true, origin);

      assert.deepStrictEqual(f.fetcher.requests, []);
      assert.strictEqual(f.storage.published.size, published);
      const again = (yield* scripts.exportJson(second.id, origin)).json;
      assert.deepStrictEqual(images(again), images(exported));
      assert.strictEqual(JSON.parse(again)[0].logo, JSON.parse(exported)[0].logo);

      // Exported generic icons are deliberate fallbacks, not images to repair.
      for (const id of ["seer", "shade", "moth"])
        assert.isTrue(
          (yield* scripts.readImported(second.id))?.artwork
            .find((art) => art.characterId === id)
            ?.slots.every(({ state }) => state === "copied"),
        );
    }).pipe(as(alice), Effect.provide(f.layer));
  }),
);

it.effect("a storage failure while copying keeps the import and leaves slots to retry", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    f.storage.control.failSourceWrites = true;

    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.importJson(json, false, origin);

      assert.lengthOf(yield* scripts.listCharacters(script.id), 4);
      assert.deepStrictEqual(
        (yield* scripts.readImported(script.id))?.artwork
          .find((art) => art.characterId === "seer")
          ?.slots.map(({ state }) => state),
        ["pending"],
      );

      f.storage.control.failSourceWrites = false;

      const repair = yield* scripts.retryImportedArtwork(
        script.id,
        "image",
        CharacterId.make("seer"),
        origin,
      );

      assert.deepStrictEqual(
        repair.reference.slots.map(({ state }) => state),
        ["copied"],
      );
    }).pipe(as(alice), Effect.provide(f.layer));
  }),
);
