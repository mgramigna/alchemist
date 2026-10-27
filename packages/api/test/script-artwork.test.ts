import {
  ArtworkInvalid,
  ScriptNotFound,
  ScriptWriteUnavailable,
  botcSchemaProblems,
  type User,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { Scripts, sourceKey } from "../src/scripts.ts";
import { png } from "./support/images.ts";
import { scriptsFixture } from "./support/scripts.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };
const as = (user: User) => Effect.provideService(CurrentUser, user);
const origin = "https://alchemist.example";

// Script artwork keeps its own shape and format: no 400×400 styling.
const logo = png(1200, 300, 1);
const background = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]);

// A Script that exports cleanly, so artwork is the only variable.
const setup = Effect.gen(function* () {
  const scripts = yield* Scripts;
  const script = yield* scripts.create().pipe(as(alice));

  for (const team of ["townsfolk", "outsider", "minion", "demon"] as const) {
    const character = yield* scripts.createCharacter(script.id, team, []).pipe(as(alice));

    yield* scripts
      .updateCharacter(script.id, character.id, { ...character, name: team, ability: "Ability" })
      .pipe(as(alice));
  }

  return { scripts, script };
});

const meta = (json: string) => JSON.parse(json)[0];

it.effect(
  "uploads keep originals private and publish them unchanged for owners, viewers and both exports",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script } = yield* setup;

        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id).pipe(as(alice)), {
          logo: null,
          background: null,
        });

        yield* scripts.uploadScriptArtwork(script.id, "logo", logo).pipe(as(alice));

        const artwork = yield* scripts
          .uploadScriptArtwork(script.id, "background", background)
          .pipe(as(alice));

        assert.match(artwork.logo ?? "", /^\/artwork\/[0-9a-z]{26}\.png$/);
        assert.match(artwork.background ?? "", /^\/artwork\/[0-9a-z]{26}\.jpg$/);
        assert.deepStrictEqual(
          yield* scripts.readScriptArtwork(script.id).pipe(as(alice)),
          artwork,
        );

        // The published copy is the original, byte for byte, in its own format.
        const logoKey = (artwork.logo ?? "").slice(1);
        const backgroundKey = (artwork.background ?? "").slice(1);
        assert.deepStrictEqual(f.storage.published.get(logoKey), logo);
        assert.strictEqual(f.storage.publishedTypes.get(logoKey), "image/png");
        assert.deepStrictEqual(f.storage.published.get(backgroundKey), background);
        assert.strictEqual(f.storage.publishedTypes.get(backgroundKey), "image/jpeg");

        // Each original is kept privately under the Script, for its deletion.
        const stored = f.scriptArtwork.get(script.id);
        assert.deepStrictEqual(
          [...f.storage.sources.keys()].sort(),
          [
            sourceKey(script.id, stored?.logo?.sourceId ?? ""),
            sourceKey(script.id, stored?.background?.sourceId ?? ""),
          ].sort(),
        );

        // Viewers see only the published paths.
        const viewed = yield* scripts.readPublic(script.id);
        assert.deepStrictEqual(viewed.artwork, artwork);

        for (const sourceId of [stored?.logo?.sourceId, stored?.background?.sourceId])
          assert.notInclude(JSON.stringify(viewed), sourceId ?? "missing");

        for (const exported of [
          yield* scripts.exportJson(script.id, origin).pipe(as(alice)),
          yield* scripts.exportPublicJson(script.id, origin),
        ]) {
          assert.deepStrictEqual(botcSchemaProblems(JSON.parse(exported.json)), []);
          assert.strictEqual(meta(exported.json).logo, `${origin}${artwork.logo}`);
          assert.strictEqual(meta(exported.json).background, `${origin}${artwork.background}`);
        }
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "replacement and removal keep every published image and drop only the replaced original",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script } = yield* setup;
        const first = yield* scripts.uploadScriptArtwork(script.id, "logo", logo);
        const firstSource = f.scriptArtwork.get(script.id)?.logo?.sourceId ?? "";
        const replacement = png(600, 600, 2);
        const second = yield* scripts.uploadScriptArtwork(script.id, "logo", replacement);
        const secondSource = f.scriptArtwork.get(script.id)?.logo?.sourceId ?? "";

        assert.notStrictEqual(second.logo, first.logo);
        assert.isFalse(f.storage.sources.has(sourceKey(script.id, firstSource)));
        assert.deepStrictEqual(
          f.storage.sources.get(sourceKey(script.id, secondSource)),
          replacement,
        );

        const removed = yield* scripts.removeScriptArtwork(script.id, "logo");
        assert.deepStrictEqual(removed, { logo: null, background: null });
        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id), removed);
        assert.strictEqual(f.storage.sources.size, 0);

        // Earlier exports keep loading their images.
        for (const path of [first.logo, second.logo])
          assert.isTrue(f.storage.published.has((path ?? "").slice(1)));

        const exported = meta((yield* scripts.exportJson(script.id, origin)).json);
        assert.notProperty(exported, "logo");
        assert.notProperty(exported, "background");

        // Removing an empty slot changes nothing.
        assert.deepStrictEqual(
          yield* scripts.removeScriptArtwork(script.id, "background"),
          removed,
        );
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect(
  "a failed publish or source write keeps the previous artwork and no unused original; a retry succeeds",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script } = yield* setup;
        const first = yield* scripts.uploadScriptArtwork(script.id, "background", background);
        const sources = [...f.storage.sources.keys()];
        f.storage.control.failPublishAfter = 0;

        assert.instanceOf(
          yield* scripts.uploadScriptArtwork(script.id, "background", logo).pipe(Effect.flip),
          ScriptWriteUnavailable,
        );
        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id), first);
        assert.deepStrictEqual([...f.storage.sources.keys()], sources);

        f.storage.control.failPublishAfter = Number.POSITIVE_INFINITY;
        f.storage.control.failSourceWrites = true;
        assert.instanceOf(
          yield* scripts.uploadScriptArtwork(script.id, "background", logo).pipe(Effect.flip),
          ScriptWriteUnavailable,
        );
        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id), first);

        f.storage.control.failSourceWrites = false;
        const retried = yield* scripts.uploadScriptArtwork(script.id, "background", logo);
        assert.match(retried.background ?? "", /\.png$/);
        assert.deepStrictEqual(yield* scripts.readScriptArtwork(script.id), retried);
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect("uploads are authorized and validated before anything is stored", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const { scripts, script } = yield* setup;
      const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");

      for (const source of [svg, new Uint8Array(), new Uint8Array(10 * 1024 * 1024 + 1)])
        assert.instanceOf(
          yield* scripts
            .uploadScriptArtwork(script.id, "logo", source)
            .pipe(as(alice), Effect.flip),
          ArtworkInvalid,
        );

      // Another user's Script is indistinguishable from a missing one.
      const notFound = new ScriptNotFound({ id: script.id });
      assert.deepStrictEqual(
        yield* scripts.uploadScriptArtwork(script.id, "logo", logo).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.strictEqual(f.storage.sources.size, 0);
      assert.strictEqual(f.storage.published.size, 0);

      yield* scripts.uploadScriptArtwork(script.id, "logo", logo).pipe(as(alice));
      assert.deepStrictEqual(
        yield* scripts.removeScriptArtwork(script.id, "logo").pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts.readScriptArtwork(script.id).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.isNotNull((yield* scripts.readScriptArtwork(script.id).pipe(as(alice))).logo);
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("an upload supersedes the imported reference for the same slot only", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;

    const json = yield* Effect.promise(() =>
      readFile(new URL("../../domain/test/fixtures/import-script.json", import.meta.url), "utf8"),
    );

    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.importJson(json, true);
      const slots = (yield* scripts.readImported(script.id))?.artwork ?? [];
      assert.isTrue(slots.some((art) => art.field === "logo"));

      yield* scripts.uploadScriptArtwork(script.id, "background", background);
      assert.deepStrictEqual((yield* scripts.readImported(script.id))?.artwork, slots);

      yield* scripts.uploadScriptArtwork(script.id, "logo", logo);
      assert.deepStrictEqual(
        (yield* scripts.readImported(script.id))?.artwork,
        slots.filter((art) => art.field !== "logo"),
      );
    }).pipe(as(alice), Effect.provide(f.layer));
  }),
);
