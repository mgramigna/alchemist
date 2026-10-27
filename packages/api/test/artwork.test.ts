import {
  ArtworkConflict,
  ArtworkInvalid,
  ArtworkNotFound,
  CharacterNotFound,
  ScriptExportInvalid,
  ScriptWriteUnavailable,
  characterIcons,
  genericIcons,
  type AuthoredTeam,
  type User,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { Scripts, sourceKey } from "../src/scripts.ts";
import { png } from "./support/images.ts";
import { scriptsFixture } from "./support/scripts.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };
const as = (user: User) => Effect.provideService(CurrentUser, user);
const origin = "https://alchemist.example";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const variantsFor = (team: AuthoredTeam, marker = 0) =>
  genericIcons(team).map(({ variant }) => ({ variant, image: png(400, 400, marker) }));

const upload = (team: AuthoredTeam, source = jpeg) => ({
  source,
  style: { look: "auto" as const },
  team,
  variants: variantsFor(team),
});

const setup = Effect.gen(function* () {
  const scripts = yield* Scripts;
  const script = yield* scripts.create().pipe(as(alice));
  const character = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));

  return { scripts, script, character };
});

it.effect(
  "an upload keeps the original private and publishes the Team's variants for owners, viewers and export",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;

        const artwork = yield* scripts
          .uploadArtwork(script.id, character.id, upload("townsfolk"))
          .pipe(as(alice));

        assert.deepStrictEqual(
          artwork.variants.map(({ variant }) => variant),
          ["regular", "flipped"],
        );
        assert.deepStrictEqual(artwork.style, { look: "auto" });
        assert.deepStrictEqual(f.storage.sources.get(sourceKey(script.id, artwork.sourceId)), jpeg);

        for (const { path } of artwork.variants) {
          assert.match(path, /^\/artwork\/[0-9a-z]{26}\.png$/);
          assert.isTrue(f.storage.published.has(path.slice(1)));
        }

        const [owned] = yield* scripts.listCharacters(script.id).pipe(as(alice));
        assert.deepStrictEqual(owned?.artwork, artwork);
        assert.deepStrictEqual(owned && characterIcons(owned), artwork.variants);

        // Viewers see the published variants and their Team, never the original.
        const [viewed] = (yield* scripts.readPublic(script.id)).characters;
        assert.deepStrictEqual(viewed?.artwork, { team: "townsfolk", variants: artwork.variants });
        assert.notInclude(JSON.stringify(yield* scripts.readPublic(script.id)), artwork.sourceId);

        for (const team of ["outsider", "minion", "demon"] as const)
          yield* scripts.createCharacter(script.id, team, []).pipe(as(alice));

        for (const each of yield* scripts.listCharacters(script.id).pipe(as(alice)))
          yield* scripts
            .updateCharacter(script.id, each.id, { ...each, name: each.team, ability: "Ability" })
            .pipe(as(alice));

        const exported = JSON.parse(
          (yield* scripts.exportJson(script.id, origin).pipe(as(alice))).json,
        );

        assert.deepStrictEqual(
          exported.find((entry: { id: string }) => entry.id === character.id).image,
          artwork.variants.map(({ path }) => `${origin}${path}`),
        );
        assert.notInclude(JSON.stringify(exported), artwork.sourceId);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("Travellers publish unaligned, Good and Evil variants", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create();
      const traveller = yield* scripts.createCharacter(script.id, "traveller", []);
      const artwork = yield* scripts.uploadArtwork(script.id, traveller.id, upload("traveller"));

      assert.deepStrictEqual(
        artwork.variants.map(({ variant }) => variant),
        ["unaligned", "good", "evil"],
      );
    }).pipe(as(alice), Effect.provide(f.layer));
  }),
);

it.effect(
  "replacement publishes new URLs, retains every earlier published image and drops only the old original",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;
        const first = yield* scripts.uploadArtwork(script.id, character.id, upload("townsfolk"));
        const replacementSource = png(1200, 900);

        const second = yield* scripts.uploadArtwork(
          script.id,
          character.id,
          upload("townsfolk", replacementSource),
        );

        assert.notStrictEqual(second.sourceId, first.sourceId);

        for (const { path } of [...first.variants, ...second.variants])
          assert.isTrue(f.storage.published.has(path.slice(1)));
        assert.isFalse(f.storage.sources.has(sourceKey(script.id, first.sourceId)));
        assert.deepStrictEqual(
          f.storage.sources.get(sourceKey(script.id, second.sourceId)),
          replacementSource,
        );
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect(
  "a failed publish leaves the previous artwork current and no unused original, and a retry succeeds",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;
        const first = yield* scripts.uploadArtwork(script.id, character.id, upload("townsfolk"));
        f.storage.control.failPublishAfter = 1;

        const error = yield* scripts
          .uploadArtwork(script.id, character.id, upload("townsfolk", png(800, 800)))
          .pipe(Effect.flip);

        assert.instanceOf(error, ScriptWriteUnavailable);
        const [kept] = yield* scripts.listCharacters(script.id);
        assert.deepStrictEqual(kept?.artwork, first);
        assert.deepStrictEqual(
          [...f.storage.sources.keys()],
          [sourceKey(script.id, first.sourceId)],
        );

        f.storage.control.failSourceWrites = true;
        assert.instanceOf(
          yield* scripts
            .uploadArtwork(script.id, character.id, upload("townsfolk"))
            .pipe(Effect.flip),
          ScriptWriteUnavailable,
        );
        assert.deepStrictEqual((yield* scripts.listCharacters(script.id))[0]?.artwork, first);

        f.storage.control.failSourceWrites = false;
        f.storage.control.failPublishAfter = Number.POSITIVE_INFINITY;
        const retried = yield* scripts.uploadArtwork(script.id, character.id, upload("townsfolk"));
        assert.deepStrictEqual((yield* scripts.listCharacters(script.id))[0]?.artwork, retried);
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect("uploads are validated and authorized before anything is stored", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const { scripts, script, character } = yield* setup;
      const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");

      const invalid = [
        { ...upload("townsfolk"), source: svg },
        { ...upload("townsfolk"), source: new Uint8Array() },
        { ...upload("townsfolk"), variants: variantsFor("traveller") },
        { ...upload("townsfolk"), variants: variantsFor("townsfolk").slice(0, 1) },
        {
          ...upload("townsfolk"),
          variants: variantsFor("townsfolk").map((variant) => ({
            ...variant,
            image: png(512, 512),
          })),
        },
        {
          ...upload("townsfolk"),
          variants: variantsFor("townsfolk").map((v) => ({ ...v, image: jpeg })),
        },
      ];

      for (const payload of invalid)
        assert.instanceOf(
          yield* scripts
            .uploadArtwork(script.id, character.id, payload)
            .pipe(as(alice), Effect.flip),
          ArtworkInvalid,
        );

      // Another user gets the same answer as for a missing Character.
      assert.deepStrictEqual(
        yield* scripts
          .uploadArtwork(script.id, character.id, upload("townsfolk"))
          .pipe(as(bob), Effect.flip),
        new CharacterNotFound({ id: character.id }),
      );

      assert.strictEqual(f.storage.sources.size, 0);
      assert.strictEqual(f.storage.published.size, 0);
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect(
  "Studio settings persist per Character, replay on Team changes and reset to auto; old variants stay published",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;
        const uploaded = yield* scripts.uploadArtwork(script.id, character.id, upload("outsider"));

        const studio = {
          look: "auto",
          cutout: "edge",
          tolerance: 0.2,
          color: "shaded",
          detail: 0.4,
          teamShades: true,
          texture: 0,
          outline: 0,
          shadow: 0.2,
          shadowBlur: 4,
          shadowY: -3,
          size: 0.6,
          offsetX: 30,
          offsetY: -40,
        } as const;

        const customized = yield* scripts.restyleArtwork(script.id, character.id, {
          sourceId: uploaded.sourceId,
          style: studio,
          team: "outsider",
          variants: variantsFor("outsider", 1),
        });

        assert.deepStrictEqual(customized.style, studio);
        assert.strictEqual(customized.sourceId, uploaded.sourceId);
        assert.deepStrictEqual(
          (yield* scripts.listCharacters(script.id))[0]?.artwork?.style,
          studio,
        );

        // Viewers never see the settings, only the variants they produced.
        const [viewed] = (yield* scripts.readPublic(script.id)).characters;
        assert.deepStrictEqual(viewed?.artwork, {
          team: "outsider",
          variants: customized.variants,
        });

        // The editor replays the saved settings for the new Team; they are kept unchanged.
        yield* scripts.updateCharacter(script.id, character.id, { ...character, team: "minion" });
        assert.deepStrictEqual(
          (yield* scripts.listCharacters(script.id))[0]?.artwork?.style,
          studio,
        );

        const replayed = yield* scripts.restyleArtwork(script.id, character.id, {
          sourceId: uploaded.sourceId,
          style: studio,
          team: "minion",
          variants: variantsFor("minion", 2),
        });

        const reset = yield* scripts.restyleArtwork(script.id, character.id, {
          sourceId: uploaded.sourceId,
          style: { look: "auto" },
          team: "minion",
          variants: variantsFor("minion", 3),
        });

        assert.deepStrictEqual(reset.style, { look: "auto" });
        assert.deepStrictEqual((yield* scripts.listCharacters(script.id))[0]?.artwork, reset);

        // Every Studio replacement got fresh URLs, and none of the old ones were removed.
        const paths = [uploaded, customized, replayed, reset].flatMap(({ variants }) =>
          variants.map(({ path }) => path),
        );

        assert.strictEqual(new Set(paths).size, paths.length);

        for (const path of paths) assert.isTrue(f.storage.published.has(path.slice(1)));
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect(
  "a Team change waits for a restyle from the retained original; authored fields and style survive",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;

        const artwork = yield* scripts.uploadArtwork(script.id, character.id, {
          ...upload("townsfolk"),
          style: { look: "lines" },
        });

        const moved = yield* scripts.updateCharacter(script.id, character.id, {
          ...character,
          name: "Seer",
          ability: "Learns things.",
          team: "minion",
        });

        // Variants styled for the old Team are not shown or exported meanwhile.
        assert.deepStrictEqual(characterIcons(moved), genericIcons("minion"));
        const blocked = yield* scripts.exportJson(script.id, origin).pipe(Effect.flip);
        assert.instanceOf(blocked, ScriptExportInvalid);
        assert.isTrue(blocked.problems.some(({ field }) => field === "artwork"));

        const source = yield* scripts.readArtworkSource(script.id, character.id);
        assert.deepStrictEqual(source, {
          sourceId: artwork.sourceId,
          contentType: "image/jpeg",
          bytes: jpeg,
        });

        const restyled = yield* scripts.restyleArtwork(script.id, character.id, {
          sourceId: source.sourceId,
          style: { look: "lines" },
          team: "minion",
          variants: variantsFor("minion", 1),
        });

        assert.strictEqual(restyled.sourceId, artwork.sourceId);
        const [saved] = yield* scripts.listCharacters(script.id);
        assert.deepStrictEqual(
          saved && { name: saved.name, ability: saved.ability, team: saved.team },
          { name: "Seer", ability: "Learns things.", team: "minion" },
        );
        assert.deepStrictEqual(saved?.artwork, restyled);
        assert.deepStrictEqual(saved && characterIcons(saved), restyled.variants);

        for (const { path } of [...artwork.variants, ...restyled.variants])
          assert.isTrue(f.storage.published.has(path.slice(1)));

        // A restyle rendered from a replaced original is refused rather than applied.
        yield* scripts.uploadArtwork(script.id, character.id, upload("minion"));
        assert.instanceOf(
          yield* scripts
            .restyleArtwork(script.id, character.id, {
              sourceId: artwork.sourceId,
              style: { look: "solid" },
              team: "minion",
              variants: variantsFor("minion"),
            })
            .pipe(Effect.flip),
          ArtworkConflict,
        );
      }).pipe(as(alice), Effect.provide(f.layer));
    }),
);

it.effect(
  "only the owner reads the original; removal and Character deletion drop it but keep published images",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const { scripts, script, character } = yield* setup;

        const artwork = yield* scripts
          .uploadArtwork(script.id, character.id, upload("townsfolk"))
          .pipe(as(alice));

        assert.deepStrictEqual(
          yield* scripts.readArtworkSource(script.id, character.id).pipe(as(bob), Effect.flip),
          new ArtworkNotFound({ id: character.id }),
        );
        assert.instanceOf(
          yield* scripts.removeArtwork(script.id, character.id).pipe(as(bob), Effect.flip),
          ArtworkNotFound,
        );

        yield* scripts.removeArtwork(script.id, character.id).pipe(as(alice));
        const [generic] = yield* scripts.listCharacters(script.id).pipe(as(alice));
        assert.isUndefined(generic?.artwork);
        assert.strictEqual(f.storage.sources.size, 0);

        for (const { path } of artwork.variants)
          assert.isTrue(f.storage.published.has(path.slice(1)));

        const again = yield* scripts
          .uploadArtwork(script.id, character.id, upload("townsfolk"))
          .pipe(as(alice));

        yield* scripts.deleteCharacter(script.id, character.id).pipe(as(alice));
        assert.strictEqual(f.storage.sources.size, 0);

        for (const { path } of again.variants)
          assert.isTrue(f.storage.published.has(path.slice(1)));
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("an upload supersedes an imported image reference awaiting repair", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;

      const json = JSON.stringify([
        { id: "_meta", name: "Imported" },
        ...["one", "two", "three", "four"].map((id) => ({
          id,
          name: id,
          team: "townsfolk",
          ability: "Ability",
          image: [`https://example.com/${id}.png`, `https://example.com/${id}-evil.png`],
        })),
      ]);

      const script = yield* scripts.importJson(json, false);
      const [one] = yield* scripts.listCharacters(script.id);
      assert(one);
      const artwork = yield* scripts.uploadArtwork(script.id, one.id, upload("townsfolk"));

      const imported = yield* scripts.readImported(script.id);
      assert.deepStrictEqual(
        imported?.artwork.map(({ characterId }) => `${characterId}`),
        ["one", "two", "three", "four"].filter((id) => id !== one.id),
      );
      const exported = JSON.parse((yield* scripts.exportJson(script.id, origin)).json);
      assert.deepStrictEqual(
        exported.find((entry: { id: string }) => entry.id === one.id).image,
        artwork.variants.map(({ path }) => `${origin}${path}`),
      );
    }).pipe(as(alice), Effect.provide(f.layer));
  }),
);
