import {
  Character,
  CharacterId,
  NO_SCRIPT_ARTWORK,
  OwnedScript,
  ScriptId,
  defaultNightOrders,
} from "@alchemist/domain";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { D1ScriptStore } from "../src/d1.ts";
import { ScriptStore } from "../src/scripts.ts";

const noInstructions = {
  reminders: [],
  remindersGlobal: [],
  setup: false,
  flavor: "",
  artworkCredit: "",
  firstNightInstructions: "",
  otherNightInstructions: "",
};

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
    logoCredit: "",
    backgroundCredit: "",
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
          yield* scripts.updateDetails(
            "bob",
            older.id,
            { name: "Hijack", authorCredit: "", logoCredit: "", backgroundCredit: "" },
            40,
          ),
        ),
      ).toBe(true);

      const saved = yield* scripts.updateDetails(
        "alice",
        older.id,
        {
          name: "Renamed",
          authorCredit: "Credit",
          logoCredit: "Logo by Ada",
          backgroundCredit: "Photo by Grace",
        },
        50,
      );

      expect(Option.getOrNull(saved)).toEqual({
        id: older.id,
        name: "Renamed",
        authorCredit: "Credit",
        logoCredit: "Logo by Ada",
        backgroundCredit: "Photo by Grace",
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
        logoCredit: "Logo by Ada",
        backgroundCredit: "Photo by Grace",
        artwork: NO_SCRIPT_ARTWORK,
        characters: [],
        nightOrders: defaultNightOrders,
        jinxes: [],
      });
      // The development fixture is readable with the initial schema.
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
        ...noInstructions,
      });

      const second = Character.make({
        ...first,
        id: CharacterId.make("01k8ae10000000000000000002"),
        name: "",
      });

      expect(
        Option.getOrNull(
          yield* scripts.insertCharacter("alice", mine.id, first, defaultNightOrders, 20),
        ),
      ).toEqual(first);
      yield* scripts.insertCharacter("alice", mine.id, second, defaultNightOrders, 21);
      // Bob can neither add to nor see Alice's Script.
      expect(
        Option.isNone(
          yield* scripts.insertCharacter(
            "bob",
            mine.id,
            { ...first, id: CharacterId.make("01k8ae10000000000000000003") },
            defaultNightOrders,
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
            { name: "Hijack", ability: "", team: "demon", ...noInstructions },
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
            { name: "x", ability: "", team: "demon", ...noInstructions },
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
        {
          name: "Imp",
          ability: first.ability,
          team: "demon",
          ...noInstructions,
          artworkCredit: "Icon by Lorc, CC BY 3.0",
        },
        40,
      );

      expect(Option.getOrNull(moved)).toEqual({
        id: first.id,
        name: "Imp",
        ability: first.ability,
        team: "demon",
        ...noInstructions,
        artworkCredit: "Icon by Lorc, CC BY 3.0",
      });
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(40);
      expect(
        Option.getOrNull(yield* scripts.findPublic(mine.id))?.characters.map(
          ({ name, artworkCredit }) => [name, artworkCredit],
        ),
      ).toEqual([
        ["Imp", "Icon by Lorc, CC BY 3.0"],
        ["", ""],
      ]);

      expect(yield* scripts.deleteCharacter("bob", mine.id, first.id, 50)).toBe(false);
      expect(yield* scripts.deleteCharacter("alice", mine.id, first.id, 50)).toBe(true);
      expect(yield* scripts.deleteCharacter("alice", mine.id, first.id, 51)).toBe(false);
      expect((yield* scripts.listCharacters("alice", mine.id)).map((row) => row.id)).toEqual([
        second.id,
      ]);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(50);
    }),
  ));

test("D1 Character Order appends new Characters, replaces positions for the owner only, and orders every read", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const mine = script("01k8ae00000000000000000011", 10);
      yield* scripts.insert("alice", mine);

      const make = (n: number, name: string) =>
        Character.make({
          id: CharacterId.make(`01k8ae1000000000000000001${n}`),
          name,
          ability: "",
          team: "townsfolk",
          ...noInstructions,
        });

      const [a, b, c] = [make(1, "A"), make(2, "B"), make(3, "C")];

      for (const character of [a, b, c])
        yield* scripts.insertCharacter("alice", mine.id, character, defaultNightOrders, 20);

      expect(Option.isNone(yield* scripts.replaceCharacterOrder("bob", mine.id, [c.id], 30))).toBe(
        true,
      );
      expect(
        Option.getOrNull(
          yield* scripts.replaceCharacterOrder("alice", mine.id, [c.id, a.id, b.id], 30),
        ),
      ).toEqual([c.id, a.id, b.id]);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(30);

      // A later Character joins the end.
      const d = make(4, "D");
      yield* scripts.insertCharacter("alice", mine.id, d, defaultNightOrders, 40);

      expect((yield* scripts.listCharacters("alice", mine.id)).map((row) => row.name)).toEqual([
        "C",
        "A",
        "B",
        "D",
      ]);
      expect(
        Option.getOrNull(yield* scripts.findPublic(mine.id))?.characters.map((row) => row.name),
      ).toEqual(["C", "A", "B", "D"]);
      expect(
        Option.getOrNull(yield* scripts.findExport(mine.id))?.characters.map((row) => row.name),
      ).toEqual(["C", "A", "B", "D"]);
    }),
  ));

test("D1 Night Orders default on creation, replace atomically, refuse other Scripts' Characters, and lose deleted members", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const mine = script("01k8af00000000000000000001", 10);
      const other = script("01k8af00000000000000000002", 10);
      yield* scripts.insert("alice", mine);
      yield* scripts.insert("alice", other);
      expect(Option.getOrNull(yield* scripts.findNightOrders("alice", mine.id))).toEqual(
        defaultNightOrders,
      );
      expect(Option.isNone(yield* scripts.findNightOrders("bob", mine.id))).toBe(true);

      const character = (id: string) =>
        Character.make({
          id: CharacterId.make(id),
          name: "Chef",
          ability: "You start knowing a number.",
          team: "townsfolk",
          firstNightInstructions: "Show the number.",
          otherNightInstructions: "",
          reminders: [],
          remindersGlobal: [],
          setup: false,
          flavor: "",
          artworkCredit: "",
        });

      const chef = character("01k8af10000000000000000001");
      const foreign = character("01k8af10000000000000000002");

      // The Character and its memberships are written together.
      const joined = {
        firstNight: ["dusk", "minioninfo", "demoninfo", chef.id, "dawn"],
        otherNight: ["dusk", "dawn", chef.id],
      } as const;

      expect(
        Option.getOrNull(yield* scripts.insertCharacter("alice", mine.id, chef, joined, 20)),
      ).toEqual(chef);
      yield* scripts.insertCharacter("alice", other.id, foreign, defaultNightOrders, 20);
      expect(Option.getOrNull(yield* scripts.findNightOrders("alice", mine.id))).toEqual(joined);
      expect((yield* scripts.listCharacters("alice", mine.id))[0]?.firstNightInstructions).toBe(
        "Show the number.",
      );

      const reordered = yield* scripts.replaceNightOrder(
        "alice",
        mine.id,
        "firstNight",
        [chef.id, "dusk", "minioninfo", "dawn", "demoninfo"],
        30,
      );

      expect(Option.getOrNull(reordered)).toEqual({
        firstNight: [chef.id, "dusk", "minioninfo", "dawn", "demoninfo"],
        otherNight: joined.otherNight,
      });
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(30);

      // The share link reads the same orders and instructions the sheets render.
      const shared = Option.getOrThrow(yield* scripts.findPublic(mine.id));

      expect(shared.nightOrders).toEqual(Option.getOrNull(reordered));
      expect(shared.characters).toEqual([
        {
          id: chef.id,
          name: "Chef",
          ability: "You start knowing a number.",
          team: "townsfolk",
          firstNightInstructions: "Show the number.",
          otherNightInstructions: "",
          artworkCredit: "",
        },
      ]);

      // The foreign key refuses another Script's Character and rolls back the whole write.
      const crossScript = yield* Effect.flip(
        scripts.replaceNightOrder("alice", mine.id, "otherNight", ["dusk", foreign.id, "dawn"], 40),
      );

      expect(crossScript._tag).toBe("ScriptWriteUnavailable");
      expect(
        Option.getOrNull(yield* scripts.findNightOrders("alice", mine.id))?.otherNight,
      ).toEqual(joined.otherNight);
      expect(Option.getOrNull(yield* scripts.findOwned("alice", mine.id))?.updatedAt).toBe(30);

      // Another owner changes nothing.
      expect(
        Option.isNone(
          yield* scripts.replaceNightOrder("bob", mine.id, "otherNight", ["dusk", "dawn"], 50),
        ),
      ).toBe(true);
      expect(
        Option.getOrNull(yield* scripts.findNightOrders("alice", mine.id))?.otherNight,
      ).toEqual(joined.otherNight);

      expect(yield* scripts.deleteCharacter("alice", mine.id, chef.id, 60)).toBe(true);
      expect(Option.getOrNull(yield* scripts.findNightOrders("alice", mine.id))).toEqual({
        firstNight: ["dusk", "minioninfo", "dawn", "demoninfo"],
        otherNight: ["dusk", "dawn"],
      });
    }),
  ));

test("D1 Jinxes enforce concurrent uniqueness, Script membership, ownership, and atomic Character deletion rollback", async () => {
  const mine = script("01k8ag00000000000000000001", 10);
  const other = script("01k8ag00000000000000000002", 10);

  const character = (id: string) =>
    Character.make({
      id: CharacterId.make(id),
      name: "Draft",
      ability: "",
      team: "townsfolk",
      ...noInstructions,
    });

  const a = character("01k8ag10000000000000000001");
  const b = character("01k8ag10000000000000000002");
  const foreign = character("01k8ag10000000000000000003");
  const jinx = { first: a.id, second: b.id, explanation: "" };
  await run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      yield* scripts.insert("alice", mine);
      yield* scripts.insert("alice", other);
      yield* scripts.insertCharacter(
        "alice",
        mine.id,
        a,
        {
          otherNight: defaultNightOrders.otherNight,
          firstNight: [...defaultNightOrders.firstNight, a.id],
        },
        20,
      );
      yield* scripts.insertCharacter(
        "alice",
        mine.id,
        b,
        {
          otherNight: defaultNightOrders.otherNight,
          firstNight: [...defaultNightOrders.firstNight, a.id],
        },
        20,
      );
      yield* scripts.insertCharacter("alice", other.id, foreign, defaultNightOrders, 20);

      const attempts = yield* Effect.all(
        [
          scripts.insertJinx("alice", mine.id, jinx, 30),
          scripts.insertJinx("alice", mine.id, jinx, 30),
        ],
        { concurrency: "unbounded" },
      );

      expect(attempts.filter(Option.isSome)).toHaveLength(1);
      expect(yield* scripts.listJinxes("alice", mine.id)).toEqual([jinx]);
      expect(
        (yield* Effect.flip(
          scripts.insertJinx("alice", mine.id, { ...jinx, second: foreign.id }, 40),
        ))._tag,
      ).toBe("ScriptWriteUnavailable");
      expect(
        (yield* Effect.flip(scripts.insertJinx("alice", mine.id, { ...jinx, second: a.id }, 40)))
          ._tag,
      ).toBe("ScriptWriteUnavailable");
      expect(Option.isNone(yield* scripts.insertJinx("bob", mine.id, jinx, 40))).toBe(true);
      expect(
        Option.isNone(
          yield* scripts.updateJinx("bob", mine.id, { ...jinx, explanation: "Hijack" }, 40),
        ),
      ).toBe(true);
      expect(yield* scripts.deleteJinx("bob", mine.id, jinx, 40)).toBe(false);
      expect(yield* scripts.listJinxes("bob", mine.id)).toEqual([]);
      expect(Option.getOrThrow(yield* scripts.findOwned("alice", mine.id)).updatedAt).toBe(30);
      const saved = { ...jinx, explanation: "x".repeat(501) };
      expect(Option.getOrThrow(yield* scripts.updateJinx("alice", mine.id, saved, 50))).toEqual(
        saved,
      );
      expect(Option.getOrThrow(yield* scripts.findPublic(mine.id)).jinxes).toEqual([saved]);
    }),
  );
  // Force the final statement of Character deletion to fail, after Jinx and night removal.
  await db
    .prepare(
      `CREATE TRIGGER refuse_jinx_character_delete BEFORE DELETE ON characters WHEN OLD.id = '${a.id}' BEGIN SELECT RAISE(ABORT, 'injected deletion failure'); END`,
    )
    .run();

  try {
    await run(
      Effect.gen(function* () {
        const scripts = yield* ScriptStore;
        expect((yield* Effect.flip(scripts.deleteCharacter("alice", mine.id, a.id, 60)))._tag).toBe(
          "ScriptWriteUnavailable",
        );
        expect((yield* scripts.listCharacters("alice", mine.id)).map((c) => c.id)).toContain(a.id);
        expect(yield* scripts.listJinxes("alice", mine.id)).toEqual([
          { ...jinx, explanation: "x".repeat(501) },
        ]);
        expect(
          Option.getOrThrow(yield* scripts.findNightOrders("alice", mine.id)).firstNight,
        ).toContain(a.id);
        expect(Option.getOrThrow(yield* scripts.findOwned("alice", mine.id)).updatedAt).toBe(50);
      }),
    );
  } finally {
    await db.prepare("DROP TRIGGER refuse_jinx_character_delete").run();
  }

  await run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      expect(yield* scripts.deleteCharacter("alice", mine.id, a.id, 70)).toBe(true);
      expect(yield* scripts.listJinxes("alice", mine.id)).toEqual([]);
      expect(
        Option.getOrThrow(yield* scripts.findNightOrders("alice", mine.id)).firstNight,
      ).not.toContain(a.id);
      expect(Option.getOrThrow(yield* scripts.findOwned("alice", mine.id)).updatedAt).toBe(70);
    }),
  );
});

test("D1 keeps separate ordered duplicate token drafts, setup and flavor across reloads and Team changes", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      const mine = script("01k8ah00000000000000000001", 10);
      yield* scripts.insert("alice", mine);

      const character = Character.make({
        id: CharacterId.make("01k8ah10000000000000000001"),
        name: "Imp",
        ability: "Kills",
        team: "demon",
        ...noInstructions,
      });

      yield* scripts.insertCharacter("alice", mine.id, character, defaultNightOrders, 20);

      const draft = {
        ...character,
        reminders: ["Dead", "Dead", " ", "x".repeat(31)],
        remindersGlobal: Array.from({ length: 21 }, () => "x".repeat(26)),
        setup: true,
        flavor: "x".repeat(501),
        artworkCredit: "",
      };

      expect(
        Option.getOrNull(yield* scripts.updateCharacter("alice", mine.id, character.id, draft, 30)),
      ).toEqual(draft);
      const [loaded] = yield* scripts.listCharacters("alice", mine.id);
      expect(loaded).toEqual(draft);

      const moved = {
        ...draft,
        team: "traveller" as const,
        reminders: ["x".repeat(31), "Dead", "Dead"],
      };

      yield* scripts.updateCharacter("alice", mine.id, character.id, moved, 40);
      expect(
        Option.isNone(
          yield* scripts.updateCharacter(
            "bob",
            mine.id,
            character.id,
            { ...moved, reminders: [], setup: false },
            50,
          ),
        ),
      ).toBe(true);
      expect(yield* scripts.listCharacters("alice", mine.id)).toEqual([moved]);
      expect(
        (yield* scripts.findOwned("alice", mine.id)).pipe(
          Option.map((row) => row.updatedAt),
          Option.getOrNull,
        ),
      ).toBe(40);
    }),
  ));

test("D1 imports reused IDs atomically, keeps integration data across edits, and scopes fallback repair by owner", async () => {
  const { reviewImport } = await import("@alchemist/domain");

  const json = await readFile(
    new URL("../../domain/test/fixtures/import-script.json", import.meta.url),
    "utf8",
  );

  const review = reviewImport(json, "Alice");
  const draft = review.draft;
  expect(draft).not.toBeNull();

  if (draft === null) return;
  const first = script("01k8aj00000000000000000001", 10);
  const second = script("01k8aj00000000000000000002", 10);

  await run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      yield* scripts.insertImport("alice", first, draft);
      yield* scripts.insertImport("bob", second, draft);
      expect(
        (yield* scripts.listCharacters("alice", first.id)).map((character) => character.id),
        // Imported Characters keep the draft's Standard order.
      ).toEqual(draft.characters.map((character) => character.id));
      expect((yield* scripts.listCharacters("bob", second.id)).length).toBe(4);
      expect(Option.getOrThrow(yield* scripts.findNightOrders("alice", first.id))).toEqual(
        draft.nightOrders,
      );
      expect(yield* scripts.listJinxes("alice", first.id)).toEqual(draft.jinxes);
      expect(yield* scripts.readImported("bob", first.id)).toBeNull();
      expect(yield* scripts.readImported("alice", first.id)).toEqual(draft.imported);
      const snapshot = Option.getOrThrow(yield* scripts.findExport(first.id));
      expect(snapshot).toEqual({
        script: {
          name: first.name,
          authorCredit: first.authorCredit,
        },
        characters: draft.characters,
        nightOrders: draft.nightOrders,
        jinxes: draft.jinxes,
        imported: draft.imported,
        artwork: NO_SCRIPT_ARTWORK,
      });
      expect(Option.isNone(yield* scripts.findExport(ScriptId.make("missing")))).toBe(true);
      expect(
        yield* scripts.useGenericArtwork("bob", first.id, "image", CharacterId.make("seer"), 20),
      ).toBe(false);
      expect(
        yield* scripts.useGenericArtwork("alice", first.id, "image", CharacterId.make("seer"), 20),
      ).toBe(true);
      expect((yield* scripts.readImported("alice", first.id))?.artwork).toEqual(
        draft.imported.artwork.slice(1),
      );
      expect((yield* scripts.readImported("alice", first.id))?.characters).toEqual(
        draft.imported.characters,
      );
      expect(yield* scripts.useGenericArtwork("alice", first.id, "logo", null, 30)).toBe(true);
      expect((yield* scripts.readImported("alice", first.id))?.artwork).toHaveLength(1);
      const seer = draft.characters[0];
      expect(seer).toBeDefined();

      if (seer === undefined) return;
      yield* scripts.updateCharacter("alice", first.id, seer.id, { ...seer, name: "Renamed" }, 40);
      expect(
        (yield* scripts.listCharacters("bob", second.id)).find(
          (character) => character.id === "seer",
        )?.name,
      ).toBe("Seer");
      expect(
        (yield* scripts.listCharacters("alice", first.id)).find(
          (character) => character.id === "seer",
        )?.name,
      ).toBe("Renamed");
      expect((yield* scripts.readImported("alice", first.id))?.characters).toEqual(
        draft.imported.characters,
      );
    }),
  );

  // A failure at the final statement must roll back Script, Characters, orders, and Jinxes.
  await db
    .prepare(
      "CREATE TRIGGER refuse_import BEFORE INSERT ON script_imports BEGIN SELECT RAISE(ABORT, 'injected import failure'); END",
    )
    .run();
  const rejected = script("01k8aj00000000000000000003", 10);

  try {
    await run(
      Effect.gen(function* () {
        const scripts = yield* ScriptStore;
        expect((yield* scripts.insertImport("alice", rejected, draft).pipe(Effect.flip))._tag).toBe(
          "ScriptWriteUnavailable",
        );
        expect(Option.isNone(yield* scripts.findOwned("alice", rejected.id))).toBe(true);
        expect(Option.isNone(yield* scripts.findPublic(rejected.id))).toBe(true);
        expect(yield* scripts.listCharacters("alice", rejected.id)).toEqual([]);
        expect(yield* scripts.listJinxes("alice", rejected.id)).toEqual([]);
        expect(yield* scripts.readImported("alice", rejected.id)).toBeNull();
      }),
    );

    const rows = await db
      .prepare(
        "SELECT (SELECT count(*) FROM characters WHERE script_id = ?) AS characters, (SELECT count(*) FROM night_order_entries WHERE script_id = ?) AS nights, (SELECT count(*) FROM jinxes WHERE script_id = ?) AS jinxes",
      )
      .bind(rejected.id, rejected.id, rejected.id)
      .first();

    expect(rows).toEqual({ characters: 0, nights: 0, jinxes: 0 });
  } finally {
    await db.prepare("DROP TRIGGER refuse_import").run();
  }
});

test("D1 deletes the complete dependency graph atomically, retains an owner receipt and refuses late writes", async () => {
  const id = ScriptId.make("01k8af00000000000000000035");
  const { reviewImport } = await import("@alchemist/domain");

  const json = await readFile(
    new URL("../../domain/test/fixtures/import-script.json", import.meta.url),
    "utf8",
  );

  const draft = reviewImport(json, "Alice").draft;
  expect(draft).not.toBeNull();

  if (draft === null) return;
  await run(
    Effect.gen(function* () {
      yield* (yield* ScriptStore).insertImport("alice", script(id, 1), draft);
    }),
  );
  await db
    .prepare(
      "INSERT INTO script_artwork VALUES (?, 'logo', 'original', 'image/png', '/artwork/retained.png')",
    )
    .bind(id)
    .run();
  await db
    .prepare(
      "INSERT INTO character_artwork SELECT script_id, id, 'original', 'image/png', '{\"look\":\"auto\"}', team, '[]', 0 FROM characters WHERE script_id = ? LIMIT 1",
    )
    .bind(id)
    .run();

  // A late failure must roll back the receipt and every dependent deletion.
  await db
    .prepare(
      "CREATE TRIGGER reject_script_deletion BEFORE DELETE ON scripts WHEN OLD.id = '01k8af00000000000000000035' BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    )
    .run();
  expect(
    await run(
      Effect.gen(function* () {
        return yield* (yield* ScriptStore).deleteOwned("alice", id).pipe(Effect.isFailure);
      }),
    ),
  ).toBe(true);
  expect(
    (await db.prepare("SELECT * FROM script_deletions WHERE script_id = ?").bind(id).all()).results,
  ).toHaveLength(0);
  expect(
    (await db.prepare("SELECT * FROM characters WHERE script_id = ?").bind(id).all()).results
      .length,
  ).toBeGreaterThan(0);
  await db.prepare("DROP TRIGGER reject_script_deletion").run();

  await run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      expect(yield* scripts.deleteOwned("bob", id)).toBe(false);
      expect(yield* scripts.deleteOwned("alice", id)).toBe(true);
      expect(yield* scripts.deleteOwned("alice", id)).toBe(true);
      expect(yield* scripts.deleteOwned("bob", id)).toBe(false);
      expect(Option.isNone(yield* scripts.findPublic(id))).toBe(true);
      expect(Option.isNone(yield* scripts.findExport(id))).toBe(true);
      expect(
        Option.isNone(
          yield* scripts.updateDetails(
            "alice",
            id,
            { name: "Late", authorCredit: "", logoCredit: "", backgroundCredit: "" },
            100,
          ),
        ),
      ).toBe(true);
      expect(yield* scripts.pendingDeletions("alice")).toContain(id);
      yield* scripts.finishDeletion("alice", id);
      expect(yield* scripts.pendingDeletions("alice")).not.toContain(id);
    }),
  );

  for (const table of [
    "characters",
    "night_order_entries",
    "jinxes",
    "character_artwork",
    "script_artwork",
    "script_imports",
  ]) {
    expect(
      (await db.prepare(`SELECT * FROM ${table} WHERE script_id = ?`).bind(id).all()).results,
    ).toHaveLength(0);
  }
});
