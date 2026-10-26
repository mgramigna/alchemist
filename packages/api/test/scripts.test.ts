import {
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
