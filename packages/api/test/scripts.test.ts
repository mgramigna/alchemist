import {
  CharacterNotFound,
  PublicScript,
  ScriptId,
  ScriptNotFound,
  ScriptReadUnavailable,
  type User,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { TestClock } from "effect/testing";
import { Scripts, ScriptsLive, ScriptStore } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";

const id = ScriptId.make("01k8ac00000000000000000001");

const fixture = {
  id,
  name: "The Midnight Alchemist",
  authorCredit: "Independent credit",
  characters: [],
  ownerId: "private",
  session: "secret",
  privateSource: "hidden",
};

it.effect("anonymous read projects only public data and preserves independent Author Credit", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const result = yield* scripts.readPublic(id);
    assert.deepStrictEqual(
      result,
      PublicScript.make({
        id,
        name: fixture.name,
        authorCredit: fixture.authorCredit,
        characters: [],
      }),
    );
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(
          Layer.mock(ScriptStore, {
            findPublic: (requested) => {
              assert.strictEqual(requested, id);

              return Effect.succeedSome(fixture);
            },
          }),
        ),
      ),
    ),
  ),
);

it.effect("unknown Script has a typed not-found result", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const error = yield* scripts.readPublic(id).pipe(Effect.flip);
    assert.instanceOf(error, ScriptNotFound);
    assert.deepStrictEqual(error, new ScriptNotFound({ id }));
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(Layer.mock(ScriptStore, { findPublic: () => Effect.succeedNone })),
      ),
    ),
  ),
);

it.effect("storage failure stays unavailable rather than looking like a missing Script", () =>
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const exit = yield* Effect.exit(scripts.readPublic(id));
    assert.isTrue(Exit.isFailure(exit));
    const error = yield* scripts.readPublic(id).pipe(Effect.flip);
    assert.instanceOf(error, ScriptReadUnavailable);
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(
          Layer.mock(ScriptStore, {
            findPublic: () => Effect.fail(new ScriptReadUnavailable({})),
          }),
        ),
      ),
    ),
  ),
);

const alice = { id: "alice-id", displayName: "Alice" };
const bob = { id: "bob-id", displayName: "Bob" };
const as = (user: User) => Effect.provideService(CurrentUser, user);

it.effect(
  "creating a Script links it to the owner and copies Author Credit from the current display name once",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        yield* TestClock.adjust(1_000);
        const created = yield* scripts.create().pipe(as(alice));
        assert.match(created.id, /^[0-7][0-9a-hjkmnp-tv-z]{25}$/);
        assert.deepStrictEqual(
          { name: created.name, authorCredit: created.authorCredit, updatedAt: created.updatedAt },
          { name: "Untitled Script", authorCredit: "Alice", updatedAt: 1_000 },
        );
        assert.strictEqual(f.rows.get(created.id)?.ownerId, alice.id);

        // A later display name change is a different CurrentUser; the stored credit stays.
        const renamed = { ...alice, displayName: "Alice Renamed" };
        assert.strictEqual(
          (yield* scripts.readOwned(created.id).pipe(as(renamed))).authorCredit,
          "Alice",
        );
        const second = yield* scripts.create().pipe(as(renamed));
        assert.strictEqual(second.authorCredit, "Alice Renamed");
        assert.notStrictEqual(second.id, created.id);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "owners edit name and Author Credit, see newest first, and the public read shows the saved state",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const first = yield* scripts.create().pipe(as(alice));
        yield* TestClock.adjust(1_000);
        const second = yield* scripts.create().pipe(as(alice));
        yield* TestClock.adjust(1_000);

        const updated = yield* scripts
          .updateDetails(first.id, { name: "Night of Mirrors", authorCredit: "" })
          .pipe(as(alice));

        assert.deepStrictEqual(updated, {
          id: first.id,
          name: "Night of Mirrors",
          authorCredit: "",
          updatedAt: 2_000,
        });
        assert.deepStrictEqual(
          (yield* scripts.listOwned().pipe(as(alice))).map((script) => script.id),
          [first.id, second.id],
        );
        assert.deepStrictEqual(yield* scripts.readOwned(first.id).pipe(as(alice)), updated);
        assert.deepStrictEqual(yield* scripts.readPublic(first.id), {
          id: first.id,
          name: "Night of Mirrors",
          authorCredit: "",
          characters: [],
        });
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "another user cannot list, read or edit an owner's Script, even with its ID; guessed IDs are not found",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const owned = yield* scripts.create().pipe(as(alice));
        assert.deepStrictEqual(yield* scripts.listOwned().pipe(as(bob)), []);

        for (const id of [owned.id, ScriptId.make("01k8ac0000000000000000zzzz")]) {
          assert.deepStrictEqual(
            yield* scripts.readOwned(id).pipe(as(bob), Effect.flip),
            new ScriptNotFound({ id }),
          );
          assert.deepStrictEqual(
            yield* scripts
              .updateDetails(id, { name: "Hijacked", authorCredit: "Bob" })
              .pipe(as(bob), Effect.flip),
            new ScriptNotFound({ id }),
          );
        }

        assert.deepStrictEqual(yield* scripts.readOwned(owned.id).pipe(as(alice)), owned);
        assert.strictEqual(f.rows.size, 1);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "owners add Characters by Team, edit them with stable IDs, save invalid drafts and see them publicly",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(as(alice));
        yield* TestClock.adjust(1_000);

        const added = yield* scripts.createCharacter(script.id, "demon").pipe(as(alice));
        assert.match(added.id, /^[0-7][0-9a-hjkmnp-tv-z]{25}$/);
        assert.deepStrictEqual(
          { name: added.name, ability: added.ability, team: added.team },
          { name: "", ability: "", team: "demon" },
        );
        assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 1_000);
        yield* TestClock.adjust(1_000);

        // Over-limit and blank drafts are stored as written, not truncated.
        const longName = "N".repeat(60);

        const renamed = yield* scripts
          .updateCharacter(script.id, added.id, { name: longName, ability: "", team: "demon" })
          .pipe(as(alice));

        assert.deepStrictEqual(renamed, {
          id: added.id,
          name: longName,
          ability: "",
          team: "demon",
        });

        // A Team change keeps every authored field and the Character's identity.
        const moved = yield* scripts
          .updateCharacter(script.id, added.id, {
            name: "Imp",
            ability: "Each night*",
            team: "minion",
          })
          .pipe(as(alice));

        assert.deepStrictEqual(moved, {
          id: added.id,
          name: "Imp",
          ability: "Each night*",
          team: "minion",
        });
        assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [moved]);
        assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 2_000);
        assert.deepStrictEqual((yield* scripts.readPublic(script.id)).characters, [moved]);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("deleting a Character removes it from storage and the public Script", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const keep = yield* scripts.createCharacter(script.id, "townsfolk").pipe(as(alice));
      const drop = yield* scripts.createCharacter(script.id, "outsider").pipe(as(alice));

      yield* scripts.deleteCharacter(script.id, drop.id).pipe(as(alice));

      assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [keep]);
      assert.deepStrictEqual((yield* scripts.readPublic(script.id)).characters, [keep]);
      assert.deepStrictEqual(
        yield* scripts.deleteCharacter(script.id, drop.id).pipe(as(alice), Effect.flip),
        new CharacterNotFound({ id: drop.id }),
      );
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("another user cannot list, add, edit or delete Characters on an owner's Script", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const character = yield* scripts.createCharacter(script.id, "townsfolk").pipe(as(alice));
      const notFound = new ScriptNotFound({ id: script.id });
      const missing = new CharacterNotFound({ id: character.id });

      assert.deepStrictEqual(
        yield* scripts.listCharacters(script.id).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts.createCharacter(script.id, "demon").pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts
          .updateCharacter(script.id, character.id, { name: "Hijack", ability: "", team: "demon" })
          .pipe(as(bob), Effect.flip),
        missing,
      );
      assert.deepStrictEqual(
        yield* scripts.deleteCharacter(script.id, character.id).pipe(as(bob), Effect.flip),
        missing,
      );
      assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [character]);
      assert.strictEqual(f.characters.size, 1);
    }).pipe(Effect.provide(f.layer));
  }),
);
