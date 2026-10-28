import { ScriptNotFound, ScriptWriteUnavailable, type User } from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { Scripts } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";
import { png } from "./support/images.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };
const as = (user: User) => Effect.provideService(CurrentUser, user);

it.effect(
  "deletion denies other owners, removes all private sources and content, and retains every published image",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(as(alice));
        const other = yield* scripts.create().pipe(as(bob));

        const first = yield* scripts
          .createCharacter(script.id, "townsfolk", ["firstNight"])
          .pipe(as(alice));

        const second = yield* scripts
          .createCharacter(script.id, "demon", ["otherNight"])
          .pipe(as(alice));

        yield* scripts
          .createJinx(script.id, { first: first.id, second: second.id })
          .pipe(as(alice));
        yield* scripts
          .uploadArtwork(script.id, first.id, {
            source: png(100, 100),
            team: "townsfolk",
            style: { look: "auto" },
            variants: [
              { variant: "regular", image: png(400, 400) },
              { variant: "flipped", image: png(400, 400) },
            ],
          })
          .pipe(as(alice));
        yield* scripts.uploadScriptArtwork(script.id, "logo", png(100, 100)).pipe(as(alice));
        yield* scripts.uploadScriptArtwork(script.id, "background", png(100, 100)).pipe(as(alice));
        // Prefix cleanup includes imported or unreferenced originals, not only current rows.
        f.storage.sources.set(`${script.id}/imported-original`, png(100, 100));
        f.storage.sources.set(`${other.id}/keep`, png(100, 100));
        const published = [...f.storage.published];
        assert.instanceOf(
          yield* scripts.delete(script.id).pipe(as(bob), Effect.flip),
          ScriptNotFound,
        );
        assert.isNotEmpty((yield* scripts.readPublic(script.id)).characters);
        assert.strictEqual(yield* scripts.delete(script.id).pipe(as(alice)), script.id);
        assert.deepStrictEqual(yield* scripts.listOwned().pipe(as(alice)), []);
        assert.deepStrictEqual([...f.storage.sources.keys()], [`${other.id}/keep`]);
        assert.deepStrictEqual([...f.storage.published], published);
        assert.instanceOf(yield* scripts.readPublic(script.id).pipe(Effect.flip), ScriptNotFound);
        assert.instanceOf(
          yield* scripts.exportPublicJson(script.id, "https://a.test").pipe(Effect.flip),
          ScriptNotFound,
        );
        assert.instanceOf(
          yield* scripts
            .updateDetails(script.id, {
              name: "Late save",
              authorCredit: "",
              logoCredit: "",
              backgroundCredit: "",
            })
            .pipe(as(alice), Effect.flip),
          ScriptNotFound,
        );
        assert.instanceOf(
          yield* scripts.createCharacter(script.id, "minion", []).pipe(as(alice), Effect.flip),
          ScriptNotFound,
        );
        yield* scripts.delete(script.id).pipe(as(alice));
        assert.instanceOf(
          yield* scripts.delete(script.id).pipe(as(bob), Effect.flip),
          ScriptNotFound,
        );
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "a committed deletion stays unavailable when R2 fails and workspace loading retries cleanup",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(as(alice));
        yield* scripts.uploadScriptArtwork(script.id, "logo", png(100, 100)).pipe(as(alice));
        f.storage.sources.set(`${script.id}/imported`, png(100, 100));
        f.storage.sources.set(`${script.id}/orphaned`, png(100, 100));
        f.storage.control.failCleanupAfter = 1;
        assert.instanceOf(
          yield* scripts.delete(script.id).pipe(as(alice), Effect.flip),
          ScriptWriteUnavailable,
        );
        assert.instanceOf(yield* scripts.readPublic(script.id).pipe(Effect.flip), ScriptNotFound);
        assert.strictEqual(f.storage.sources.size, 2);
        // A different owner cannot consume the receipt or clean up this prefix.
        yield* scripts.listOwned().pipe(as(bob));
        assert.strictEqual(f.storage.sources.size, 2);
        f.storage.control.failCleanupAfter = Number.POSITIVE_INFINITY;
        assert.deepStrictEqual(yield* scripts.listOwned().pipe(as(alice)), []);
        assert.strictEqual(f.storage.sources.size, 0);
        yield* scripts.delete(script.id).pipe(as(alice));
        assert.strictEqual(f.storage.published.size, 1);
      }).pipe(Effect.provide(f.layer));
    }),
);
