import { Character, CharacterId, OwnedScript, ScriptId } from "@alchemist/domain";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { D1ScriptStore } from "../src/d1.ts";
import { ScriptStore } from "../src/scripts.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  compatibilityDate: "2026-07-01",
  d1Databases: ["DB"],
});

const db = await mf.getD1Database("DB");
const store = D1ScriptStore.pipe(Layer.provide(D1Client.layer({ db })));

const run = <A, E>(effect: Effect.Effect<A, E, ScriptStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(store)));

const script = (id: string, updatedAt: number) =>
  OwnedScript.make({
    id: ScriptId.make(id),
    name: "Untitled Script",
    authorCredit: "Alice",
    updatedAt,
  });

beforeAll(async () => {
  const migrations = new URL("../migrations/", import.meta.url);

  // Apply every migration in order, as Alchemy does, then the development fixture.
  for (const filename of (await readdir(migrations)).sort()) {
    const sql = await readFile(new URL(filename, migrations), "utf8");

    for (const statement of sql.split(";")) if (statement.trim()) await db.prepare(statement).run();
  }

  const fixture = await readFile(new URL("../fixtures/public-script.sql", import.meta.url), "utf8");

  for (const statement of fixture.split(";"))
    if (statement.trim()) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO users (id, display_name) VALUES ('alice', 'Alice')"),
    db.prepare("INSERT INTO users (id, display_name) VALUES ('bob', 'Bob')"),
  ]);
});

afterAll(() => mf.dispose());

test("D1 owner queries are scoped by owner, ordered by last change, and updates return saved rows", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const older = script("01k8ad00000000000000000001", 10);
      const newer = script("01k8ad00000000000000000002", 20);
      yield* scripts.insert("alice", older);
      yield* scripts.insert("alice", newer);
      yield* scripts.insert("bob", script("01k8ad00000000000000000003", 30));

      expect((yield* scripts.listOwned("alice")).map((row) => row.id)).toEqual([
        newer.id,
        older.id,
      ]);
      expect(Option.isNone(yield* scripts.findOwned("bob", older.id))).toBe(true);
      expect(
        Option.isNone(
          yield* scripts.updateDetails("bob", older.id, { name: "Hijack", authorCredit: "" }, 40),
        ),
      ).toBe(true);

      const saved = yield* scripts.updateDetails(
        "alice",
        older.id,
        { name: "Renamed", authorCredit: "Credit" },
        50,
      );

      expect(Option.getOrNull(saved)).toEqual({
        id: older.id,
        name: "Renamed",
        authorCredit: "Credit",
        updatedAt: 50,
      });
      expect((yield* scripts.listOwned("alice")).map((row) => row.id)).toEqual([
        older.id,
        newer.id,
      ]);
      expect(Option.getOrNull(yield* scripts.findPublic(older.id))).toEqual({
        id: older.id,
        name: "Renamed",
        authorCredit: "Credit",
        characters: [],
      });
      // Migrated rows (the fixture) remain readable after the change-tracking migration.
      expect(
        Option.getOrNull(yield* scripts.findPublic(ScriptId.make("01k8ac00000000000000000001")))
          ?.name,
      ).toBe("The Midnight Alchemist");
    }),
  ));

test("D1 Character writes are owner-scoped, atomic with the Script change time, and delete by ID", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const mine = script("01k8ae00000000000000000001", 10);
      const theirs = script("01k8ae00000000000000000002", 10);
      yield* scripts.insert("alice", mine);
      yield* scripts.insert("bob", theirs);

      const first = Character.make({
        id: CharacterId.make("01k8ae10000000000000000001"),
        name: "Washerwoman",
        ability: "You start knowing a Townsfolk.",
        team: "townsfolk",
      });

      const second = Character.make({
        ...first,
        id: CharacterId.make("01k8ae10000000000000000002"),
        name: "",
      });

      expect(Option.getOrNull(yield* scripts.insertCharacter("alice", mine.id, first, 20))).toEqual(
        first,
      );
      yield* scripts.insertCharacter("alice", mine.id, second, 21);
      // Bob can neither add to nor see Alice's Script.
      expect(
        Option.isNone(
          yield* scripts.insertCharacter(
            "bob",
            mine.id,
            { ...first, id: CharacterId.make("01k8ae10000000000000000003") },
            22,
          ),
        ),
      ).toBe(true);
      expect((yield* scripts.listCharacters("bob", mine.id)).length).toBe(0);
      expect((yield* scripts.listCharacters("alice", mine.id)).map((row) => row.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(21);

      expect(
        Option.isNone(
          yield* scripts.updateCharacter(
            "bob",
            mine.id,
            first.id,
            { name: "Hijack", ability: "", team: "demon" },
            30,
          ),
        ),
      ).toBe(true);
      // The Character's own Script must match, not merely any Script the owner has.
      expect(
        Option.isNone(
          yield* scripts.updateCharacter(
            "alice",
            mine.id,
            CharacterId.make("01k8ae10000000000000000009"),
            { name: "x", ability: "", team: "demon" },
            30,
          ),
        ),
      ).toBe(true);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(21);

      // A Team change replaces only the Team, keeping the name and ability sent with it.
      const moved = yield* scripts.updateCharacter(
        "alice",
        mine.id,
        first.id,
        { name: "Imp", ability: first.ability, team: "demon" },
        40,
      );

      expect(Option.getOrNull(moved)).toEqual({
        id: first.id,
        name: "Imp",
        ability: first.ability,
        team: "demon",
      });
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(40);
      expect(
        Option.getOrNull(yield* scripts.findPublic(mine.id))?.characters.map((row) => row.name),
      ).toEqual(["Imp", ""]);

      expect(yield* scripts.deleteCharacter("bob", mine.id, first.id, 50)).toBe(false);
      expect(yield* scripts.deleteCharacter("alice", mine.id, first.id, 50)).toBe(true);
      expect(yield* scripts.deleteCharacter("alice", mine.id, first.id, 51)).toBe(false);
      expect((yield* scripts.listCharacters("alice", mine.id)).map((row) => row.id)).toEqual([
        second.id,
      ]);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(50);
    }),
  ));
