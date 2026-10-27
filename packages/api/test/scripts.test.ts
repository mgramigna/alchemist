import {
  CharacterNotFound,
  CharacterOrderInvalid,
  NightOrderInvalid,
  defaultNightOrders,
  NO_SCRIPT_ARTWORK,
  type Character,
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
import { ArtworkStorage } from "../src/artwork-storage.ts";
import { ImageFetcher } from "../src/image-fetch.ts";
import { Scripts, ScriptsLive, ScriptStore } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";

const noInstructions = {
  reminders: [],
  remindersGlobal: [],
  setup: false,
  flavor: "",
  firstNightInstructions: "",
  otherNightInstructions: "",
};

// The public projection carries sheet content only.
const publicView = ({
  id,
  name,
  ability,
  team,
  firstNightInstructions,
  otherNightInstructions,
}: Character) => ({ id, name, ability, team, firstNightInstructions, otherNightInstructions });

const id = ScriptId.make("01k8ac00000000000000000001");

const fixture = {
  id,
  name: "The Midnight Alchemist",
  authorCredit: "Independent credit",
  artwork: NO_SCRIPT_ARTWORK,
  characters: [],
  nightOrders: defaultNightOrders,
  jinxes: [],
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
        artwork: NO_SCRIPT_ARTWORK,
        characters: [],
        nightOrders: defaultNightOrders,
        jinxes: [],
      }),
    );
  }).pipe(
    Effect.provide(
      ScriptsLive.pipe(
        Layer.provide(Layer.mock(ArtworkStorage, {})),
        Layer.provide(Layer.mock(ImageFetcher, {})),
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
        Layer.provide(Layer.mock(ArtworkStorage, {})),
        Layer.provide(Layer.mock(ImageFetcher, {})),
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
        Layer.provide(Layer.mock(ArtworkStorage, {})),
        Layer.provide(Layer.mock(ImageFetcher, {})),
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
          artwork: NO_SCRIPT_ARTWORK,
          characters: [],
          nightOrders: defaultNightOrders,
          jinxes: [],
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

        const added = yield* scripts.createCharacter(script.id, "demon", []).pipe(as(alice));
        assert.match(added.id, /^[0-7][0-9a-hjkmnp-tv-z]{25}$/);
        assert.deepStrictEqual(
          {
            name: added.name,
            ability: added.ability,
            team: added.team,
            firstNightInstructions: added.firstNightInstructions,
            otherNightInstructions: added.otherNightInstructions,
            reminders: added.reminders,
            remindersGlobal: added.remindersGlobal,
            setup: added.setup,
            flavor: added.flavor,
          },
          { name: "", ability: "", team: "demon", ...noInstructions },
        );
        assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 1_000);
        yield* TestClock.adjust(1_000);

        // Over-limit and blank drafts are stored as written, not truncated.
        const longName = "N".repeat(60);

        const renamed = yield* scripts
          .updateCharacter(script.id, added.id, {
            name: longName,
            ability: "",
            team: "demon",
            ...noInstructions,
          })
          .pipe(as(alice));

        assert.deepStrictEqual(renamed, {
          id: added.id,
          name: longName,
          ability: "",
          team: "demon",
          ...noInstructions,
        });

        // A Team change keeps every authored field and the Character's identity.
        const moved = yield* scripts
          .updateCharacter(script.id, added.id, {
            name: "Imp",
            ability: "Each night*",
            team: "minion",
            ...noInstructions,
          })
          .pipe(as(alice));

        assert.deepStrictEqual(moved, {
          id: added.id,
          name: "Imp",
          ability: "Each night*",
          team: "minion",
          ...noInstructions,
        });
        assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [moved]);
        assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 2_000);
        assert.deepStrictEqual((yield* scripts.readPublic(script.id)).characters, [
          publicView(moved),
        ]);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("deleting a Character removes it from storage and the public Script", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const keep = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));
      const drop = yield* scripts.createCharacter(script.id, "outsider", []).pipe(as(alice));

      yield* scripts.deleteCharacter(script.id, drop.id).pipe(as(alice));

      assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [keep]);
      assert.deepStrictEqual((yield* scripts.readPublic(script.id)).characters, [publicView(keep)]);
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
      const character = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));
      const notFound = new ScriptNotFound({ id: script.id });
      const missing = new CharacterNotFound({ id: character.id });

      assert.deepStrictEqual(
        yield* scripts.listCharacters(script.id).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts.createCharacter(script.id, "demon", []).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts
          .updateCharacter(script.id, character.id, {
            name: "Hijack",
            ability: "",
            team: "demon",
            ...noInstructions,
          })
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

it.effect(
  "creation places chosen nights before Dawn; owners reorder steps and Characters, including after Dawn",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(as(alice));

        const both = yield* scripts
          .createCharacter(script.id, "townsfolk", ["firstNight", "otherNight"])
          .pipe(as(alice));

        const other = yield* scripts
          .createCharacter(script.id, "demon", ["otherNight"])
          .pipe(as(alice));

        yield* scripts.createCharacter(script.id, "outsider", []).pipe(as(alice));

        assert.deepStrictEqual(yield* scripts.readNightOrders(script.id).pipe(as(alice)), {
          firstNight: ["dusk", "minioninfo", "demoninfo", both.id, "dawn"],
          otherNight: ["dusk", both.id, other.id, "dawn"],
        });

        yield* TestClock.adjust(1_000);

        const reordered = yield* scripts
          .replaceNightOrder(script.id, "otherNight", ["dusk", other.id, "dawn", both.id])
          .pipe(as(alice));

        assert.deepStrictEqual(reordered.otherNight, ["dusk", other.id, "dawn", both.id]);
        assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 1_000);

        // Standard steps move too; the other night is untouched.
        const moved = yield* scripts
          .replaceNightOrder(script.id, "firstNight", [
            "minioninfo",
            "dusk",
            both.id,
            "demoninfo",
            "dawn",
          ])
          .pipe(as(alice));

        assert.deepStrictEqual(moved, {
          firstNight: ["minioninfo", "dusk", both.id, "demoninfo", "dawn"],
          otherNight: ["dusk", other.id, "dawn", both.id],
        });
        assert.deepStrictEqual(yield* scripts.readNightOrders(script.id).pipe(as(alice)), moved);
        assert.deepStrictEqual(f.nightOrders.get(script.id), moved);
        // Anonymous viewers read the same orders for the night sheet.
        assert.deepStrictEqual((yield* scripts.readPublic(script.id)).nightOrders, moved);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "Night Instructions are independent of membership: blank keeps the entry, removal keeps the text",
  () =>
    Effect.gen(function* () {
      const f = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(as(alice));

        const character = yield* scripts
          .createCharacter(script.id, "minion", ["firstNight"])
          .pipe(as(alice));

        // A member with blank instructions remains in the order.
        assert.deepStrictEqual(
          (yield* scripts.readNightOrders(script.id).pipe(as(alice))).firstNight,
          ["dusk", "minioninfo", "demoninfo", character.id, "dawn"],
        );

        const written = yield* scripts
          .updateCharacter(script.id, character.id, {
            name: "Poisoner",
            ability: "Each night, poison a player.",
            team: "minion",
            firstNightInstructions: "The Poisoner chooses a player.",
            otherNightInstructions: "Not a member, but kept for later.",
            reminders: [],
            remindersGlobal: [],
            setup: false,
            flavor: "",
          })
          .pipe(as(alice));

        yield* scripts
          .replaceNightOrder(script.id, "firstNight", ["dusk", "minioninfo", "demoninfo", "dawn"])
          .pipe(as(alice));

        assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [written]);

        yield* scripts
          .replaceNightOrder(script.id, "firstNight", [
            "dusk",
            "minioninfo",
            "demoninfo",
            character.id,
            "dawn",
          ])
          .pipe(as(alice));

        assert.strictEqual(
          (yield* scripts.listCharacters(script.id).pipe(as(alice)))[0]?.firstNightInstructions,
          "The Poisoner chooses a player.",
        );
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("deleting a Character removes its memberships from both nights", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));

      const keep = yield* scripts
        .createCharacter(script.id, "townsfolk", ["firstNight", "otherNight"])
        .pipe(as(alice));

      const drop = yield* scripts
        .createCharacter(script.id, "outsider", ["firstNight", "otherNight"])
        .pipe(as(alice));

      yield* scripts.deleteCharacter(script.id, drop.id).pipe(as(alice));

      assert.deepStrictEqual(yield* scripts.readNightOrders(script.id).pipe(as(alice)), {
        firstNight: ["dusk", "minioninfo", "demoninfo", keep.id, "dawn"],
        otherNight: ["dusk", keep.id, "dawn"],
      });
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("malformed and cross-Script orders are refused without changing the saved order", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));

      const mine = yield* scripts
        .createCharacter(script.id, "townsfolk", ["otherNight"])
        .pipe(as(alice));

      const elsewhere = yield* scripts.create().pipe(as(alice));
      const foreign = yield* scripts.createCharacter(elsewhere.id, "demon", []).pipe(as(alice));
      const before = yield* scripts.readNightOrders(script.id).pipe(as(alice));

      for (const order of [
        ["dusk", mine.id],
        ["dusk", "dawn", "dawn", mine.id],
        ["dusk", "demoninfo", mine.id, "dawn"],
        ["dusk", mine.id, mine.id, "dawn"],
        ["dusk", foreign.id, "dawn"],
      ] as const) {
        const error = yield* scripts
          .replaceNightOrder(script.id, "otherNight", order)
          .pipe(as(alice), Effect.flip);

        assert.instanceOf(error, NightOrderInvalid);
        assert.strictEqual(error.night, "otherNight");
      }

      assert.deepStrictEqual(yield* scripts.readNightOrders(script.id).pipe(as(alice)), before);
      assert.deepStrictEqual(
        (yield* scripts.readNightOrders(elsewhere.id).pipe(as(alice))).otherNight,
        ["dusk", "dawn"],
      );
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("another user cannot read or replace an owner's Night Orders", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const notFound = new ScriptNotFound({ id: script.id });

      assert.deepStrictEqual(
        yield* scripts.readNightOrders(script.id).pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts
          .replaceNightOrder(script.id, "otherNight", ["dawn", "dusk"])
          .pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        yield* scripts
          .createCharacter(script.id, "demon", ["firstNight"])
          .pipe(as(bob), Effect.flip),
        notFound,
      );
      assert.deepStrictEqual(
        (yield* scripts.readNightOrders(script.id).pipe(as(alice))).otherNight,
        ["dusk", "dawn"],
      );
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("token, setup and flavor drafts survive Team changes and refuse another owner", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const character = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));
      assert.deepStrictEqual(
        [character.reminders, character.remindersGlobal, character.setup, character.flavor],
        [[], [], false, ""],
      );

      const details = {
        name: character.name,
        ability: character.ability,
        team: character.team,
        firstNightInstructions: character.firstNightInstructions,
        otherNightInstructions: character.otherNightInstructions,
        reminders: ["Dead", "Dead", " ", "x".repeat(31)],
        remindersGlobal: Array.from({ length: 21 }, () => "x".repeat(26)),
        setup: true,
        flavor: "x".repeat(501),
      };

      const saved = yield* scripts
        .updateCharacter(script.id, character.id, details)
        .pipe(as(alice));

      const moved = yield* scripts
        .updateCharacter(script.id, character.id, { ...details, team: "traveller" })
        .pipe(as(alice));

      assert.deepStrictEqual(moved, { ...details, id: saved.id, team: "traveller" });
      assert.instanceOf(
        yield* scripts
          .updateCharacter(script.id, character.id, { ...details, reminders: [], setup: false })
          .pipe(as(bob), Effect.flip),
        CharacterNotFound,
      );
      assert.deepStrictEqual(yield* scripts.listCharacters(script.id).pipe(as(alice)), [moved]);
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect("the owner replaces the Character Order with every Character on the Script, once", () =>
  Effect.gen(function* () {
    const f = yield* scriptsFixture;
    yield* Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create().pipe(as(alice));
      const first = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));
      const second = yield* scripts.createCharacter(script.id, "townsfolk", []).pipe(as(alice));

      yield* TestClock.adjust(1_000);

      assert.deepStrictEqual(
        yield* scripts.replaceCharacterOrder(script.id, [second.id, first.id]).pipe(as(alice)),
        [second.id, first.id],
      );
      assert.strictEqual((yield* scripts.readOwned(script.id).pipe(as(alice))).updatedAt, 1_000);
      assert.deepStrictEqual(
        (yield* scripts.listCharacters(script.id).pipe(as(alice))).map(({ id }) => id),
        [second.id, first.id],
      );
      assert.deepStrictEqual(
        (yield* scripts.readPublic(script.id)).characters.map(({ id }) => id),
        [second.id, first.id],
      );

      const missing = yield* scripts
        .replaceCharacterOrder(script.id, [first.id])
        .pipe(as(alice), Effect.flip);

      assert.instanceOf(missing, CharacterOrderInvalid);
      assert.instanceOf(
        yield* scripts
          .replaceCharacterOrder(script.id, [first.id, second.id])
          .pipe(as(bob), Effect.flip),
        ScriptNotFound,
      );
      assert.deepStrictEqual(
        (yield* scripts.listCharacters(script.id).pipe(as(alice))).map(({ id }) => id),
        [second.id, first.id],
      );
    }).pipe(Effect.provide(f.layer));
  }),
);
