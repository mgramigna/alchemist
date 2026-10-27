import {
  botcSchemaProblems,
  CharacterId,
  ScriptImportInvalid,
  ScriptNotFound,
  ScriptWriteUnavailable,
  type User,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { readFileSync } from "node:fs";
import { ArtworkStorage } from "../src/artwork-storage.ts";
import { ImageFetcher } from "../src/image-fetch.ts";
import { Scripts, ScriptsLive, ScriptStore } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";

const json = readFileSync(
  new URL("../../domain/test/fixtures/import-script.json", import.meta.url),
  "utf8",
);

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };

it.effect(
  "imports a new owned Script, isolates reused IDs, preserves integration data after edits, and keeps artwork private",
  () =>
    Effect.gen(function* () {
      const fixture = yield* scriptsFixture;

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const review = yield* scripts.reviewImport(json);
        assert.deepStrictEqual(review.errors, []);
        const first = yield* scripts.importJson(json, false, "https://alchemist.example");
        const second = yield* scripts.importJson(json, false, "https://alchemist.example");
        assert.notStrictEqual(first.id, second.id);
        assert.strictEqual(first.authorCredit, "Original Designer");
        assert.strictEqual((yield* scripts.listOwned()).length, 2);
        const characters = yield* scripts.listCharacters(first.id);
        const seer = characters.find((character) => character.id === "seer");
        assert(seer);
        yield* scripts.updateCharacter(first.id, seer.id, {
          ...seer,
          name: "Renamed Seer",
          team: "traveller",
        });
        assert.strictEqual(
          (yield* scripts.listCharacters(second.id)).find((character) => character.id === "seer")
            ?.name,
          "Seer",
        );
        assert.deepStrictEqual(yield* scripts.listJinxes(first.id), [
          {
            first: CharacterId.make("seer"),
            second: CharacterId.make("shade"),
            explanation: "They know one another.",
          },
        ]);
        const exported = yield* scripts.exportJson(first.id, "https://alchemist.example");
        assert.deepStrictEqual(botcSchemaProblems(JSON.parse(exported.json)), []);
        assert(exported.json.includes('"edition": "borrowedmoon"'));
        assert(exported.json.includes('"name": "card"'));
        assert(!exported.json.includes("example.org/seer"));
        const publicScript = yield* scripts.readPublic(first.id);
        assert(!JSON.stringify(publicScript).includes("example.org"));
        assert.strictEqual((yield* scripts.readImported(first.id))?.artwork.length, 3);
        assert.instanceOf(
          yield* scripts
            .readImported(first.id)
            .pipe(Effect.provideService(CurrentUser, bob), Effect.flip),
          ScriptNotFound,
        );
        assert.instanceOf(
          yield* scripts
            .useGenericArtwork(first.id, "image", CharacterId.make("seer"))
            .pipe(Effect.provideService(CurrentUser, bob), Effect.flip),
          ScriptNotFound,
        );
        yield* scripts.useGenericArtwork(first.id, "image", CharacterId.make("seer"));
        assert.strictEqual((yield* scripts.readImported(first.id))?.artwork.length, 2);
        assert.strictEqual((yield* scripts.readImported(second.id))?.artwork.length, 3);
        yield* scripts.deleteCharacter(first.id, CharacterId.make("shade"));
        assert.deepStrictEqual(yield* scripts.listJinxes(first.id), []);
        assert.strictEqual((yield* scripts.listCharacters(second.id)).length, 4);
      }).pipe(Effect.provide(fixture.layer), Effect.provideService(CurrentUser, alice));
    }),
);

it.effect(
  "rejects malformed input and unacknowledged extras before persistence; representable drafts import with blockers",
  () =>
    Effect.gen(function* () {
      const fixture = yield* scriptsFixture;

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        assert.instanceOf(
          yield* scripts.importJson("{", true, "https://alchemist.example").pipe(Effect.flip),
          ScriptImportInvalid,
        );
        assert.deepStrictEqual(yield* scripts.listOwned(), []);

        const extra =
          '[{"id":"custom","name":"","team":"townsfolk","ability":"","bloodstar":true}]';

        assert.instanceOf(
          yield* scripts.importJson(extra, false, "https://alchemist.example").pipe(Effect.flip),
          ScriptImportInvalid,
        );
        assert.deepStrictEqual(yield* scripts.listOwned(), []);
        const review = yield* scripts.reviewImport(extra);
        assert(review.blockers.length > 0);
        const saved = yield* scripts.importJson(extra, true, "https://alchemist.example");
        assert.strictEqual(saved.name, "Imported Script");
        assert.strictEqual(saved.authorCredit, "Alice");
        assert.strictEqual((yield* scripts.listCharacters(saved.id))[0]?.ability, "");
      }).pipe(Effect.provide(fixture.layer), Effect.provideService(CurrentUser, alice));
    }),
);

it.effect("reports an atomic store failure without returning an imported Script", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    assert.instanceOf(
      yield* scripts.importJson(json, false, "https://alchemist.example").pipe(Effect.flip),
      ScriptWriteUnavailable,
    );
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(Layer.mock(ArtworkStorage, {})),
        Layer.provide(Layer.mock(ImageFetcher, {})),
        Layer.provide(
          Layer.mock(ScriptStore, {
            insertImport: () => Effect.fail(new ScriptWriteUnavailable({})),
          }),
        ),
      ),
    ),
    Effect.provideService(CurrentUser, alice),
  ),
);
