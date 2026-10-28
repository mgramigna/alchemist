import {
  CharacterId,
  OwnedScript,
  ScriptId,
  reviewImport,
  type ImportedArtwork,
} from "@alchemist/domain";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option } from "effect";
import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, assert, beforeAll, expect, test } from "vitest";
import { D1ScriptStore } from "../src/d1.ts";
import { ScriptStore, type StoredArtwork } from "../src/scripts.ts";

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

const scriptId = ScriptId.make("01k8ae00000000000000000101");
const seer = CharacterId.make("seer");
const shade = CharacterId.make("shade");

const json = JSON.stringify([
  { id: "_meta", name: "Moon", logo: "https://art.botc.app/logo.png" },
  {
    id: "seer",
    name: "Seer",
    team: "townsfolk",
    ability: "A",
    image: "https://art.botc.app/s.png",
  },
  {
    id: "shade",
    name: "Shade",
    team: "minion",
    ability: "B",
    image: ["https://art.botc.app/a.png", "https://art.botc.app/b.png"],
  },
]);

const reference = (art: ImportedArtwork, states: ReadonlyArray<"copied" | "failed">) => ({
  ...art,
  slots: art.slots.map((slot, index) =>
    states[index] === "failed"
      ? { source: slot.source, state: "failed" as const, problem: "Unreachable." }
      : { source: slot.source, state: "copied" as const },
  ),
});

const imported = (artwork: StoredArtwork["variants"], sourceId = "src1"): StoredArtwork => ({
  sourceId,
  sourceType: "image/png",
  style: { look: "auto" },
  team: "minion",
  variants: artwork,
  imported: true,
});

const draft = reviewImport(json, "Alice").draft;

const find = (data: { readonly artwork: ReadonlyArray<ImportedArtwork> } | null, id?: string) =>
  data?.artwork.find((art) => art.characterId === id && (id !== undefined || art.field === "logo"));

beforeAll(async () => {
  const migrations = new URL("../migrations/", import.meta.url);

  for (const filename of (await readdir(migrations)).sort()) {
    const sql = await readFile(new URL(filename, migrations), "utf8");

    for (const statement of sql.split(";")) if (statement.trim()) await db.prepare(statement).run();
  }

  await db.batch([
    db.prepare("INSERT INTO users (id, display_name) VALUES ('alice', 'Alice')"),
    db.prepare("INSERT INTO users (id, display_name) VALUES ('bob', 'Bob')"),
  ]);
  assert(draft);
  await run(
    ScriptStore.use((scripts) =>
      scripts.insertImport(
        "alice",
        OwnedScript.make({
          id: scriptId,
          name: "Moon",
          authorCredit: "Alice",
          logoCredit: "",
          backgroundCredit: "",
          updatedAt: 1,
        }),
        draft,
      ),
    ),
  );
});

afterAll(() => mf.dispose());

test("D1 records imported copies with their reference atomically, only while the reference exists", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;
      assert(draft);
      const shadeRef = find(draft.imported, shade);
      const logoRef = find(draft.imported);
      assert(shadeRef && logoRef);

      const partial = imported([
        { variant: "regular", path: "/artwork/aaaaaaaaaaaaaaaaaaaaaaaaaa.jpg" },
        { variant: "flipped", path: "/icons/generic/v1/minion-good.svg" },
      ]);

      const copied = { kind: "character", artwork: partial, expectedSourceId: null } as const;
      const partialRef = reference(shadeRef, ["copied", "failed"]);

      // Another owner writes nothing.
      expect(yield* scripts.saveImportedArtwork("bob", scriptId, partialRef, copied, 5)).toBe(
        false,
      );
      expect(yield* scripts.saveImportedArtwork("alice", scriptId, partialRef, copied, 5)).toBe(
        true,
      );

      const characters = yield* scripts.listCharacters("alice", scriptId);
      const saved = characters.find(({ id }) => id === shade)?.artwork;
      expect(saved).toEqual({
        team: "minion",
        variants: partial.variants,
        sourceId: "src1",
        style: { look: "auto" },
        imported: true,
      });
      expect(find(yield* scripts.readImported("alice", scriptId), shade)).toEqual(partialRef);
      // Other references are untouched, in order.
      expect(
        (yield* scripts.readImported("alice", scriptId))?.artwork.map((art) => art.field),
      ).toEqual(["image", "image", "logo"]);
      expect(Option.getOrThrow(yield* scripts.findOwned("alice", scriptId)).updatedAt).toBe(5);

      // A second first-copy conflicts; a retry must expect the current original.
      expect(yield* scripts.saveImportedArtwork("alice", scriptId, partialRef, copied, 6)).toBe(
        false,
      );

      const full = imported([
        partial.variants[0] ?? { variant: "regular", path: "" },
        { variant: "flipped", path: "/artwork/bbbbbbbbbbbbbbbbbbbbbbbbbb.png" },
      ]);

      const fullRef = reference(shadeRef, ["copied", "copied"]);

      expect(
        yield* scripts.saveImportedArtwork(
          "alice",
          scriptId,
          fullRef,
          { kind: "character", artwork: full, expectedSourceId: "src1" },
          7,
        ),
      ).toBe(true);

      // Public reads and exports both carry the copied variants.
      const viewed = Option.getOrThrow(yield* scripts.findPublic(scriptId));
      expect(viewed.characters.find(({ id }) => id === shade)?.artwork?.variants).toEqual(
        full.variants,
      );
      const exported = Option.getOrThrow(yield* scripts.findExport(scriptId));
      expect(exported.characters.find(({ id }) => id === shade)?.artwork?.variants).toEqual(
        full.variants,
      );

      // Script artwork fills an empty slot only.
      const logo = {
        kind: "script",
        image: {
          sourceId: "logo1",
          sourceType: "image/png",
          path: "/artwork/cccccccccccccccccccccccccc.png",
        },
      } as const;

      const logoCopied = reference(logoRef, ["copied"]);
      expect(yield* scripts.saveImportedArtwork("alice", scriptId, logoCopied, logo, 8)).toBe(true);
      expect(
        Option.getOrThrow(yield* scripts.findScriptArtwork("alice", scriptId)).logo?.path,
      ).toBe(logo.image.path);
      expect(yield* scripts.saveImportedArtwork("alice", scriptId, logoCopied, logo, 9)).toBe(
        false,
      );

      // Generic icons remove imported artwork with its reference...
      expect(yield* scripts.useGenericArtwork("alice", scriptId, "image", shade, 10)).toBe(true);
      expect(
        (yield* scripts.listCharacters("alice", scriptId)).find(({ id }) => id === shade)?.artwork,
      ).toBeUndefined();
      // ...after which no copy can be recorded for it.
      expect(yield* scripts.saveImportedArtwork("alice", scriptId, fullRef, copied, 11)).toBe(
        false,
      );
      expect(
        (yield* scripts.listCharacters("alice", scriptId)).find(({ id }) => id === shade)?.artwork,
      ).toBeUndefined();

      // Removing imported icons in the editor ends the repair too.
      const seerRef = find(draft.imported, seer);
      assert(seerRef);

      const seerArt = imported(
        [{ variant: "regular", path: "/artwork/dddddddddddddddddddddddddd.png" }],
        "src2",
      );

      expect(
        yield* scripts.saveImportedArtwork(
          "alice",
          scriptId,
          reference(seerRef, ["copied"]),
          { kind: "character", artwork: { ...seerArt, team: "townsfolk" }, expectedSourceId: null },
          12,
        ),
      ).toBe(true);
      expect(yield* scripts.deleteArtwork("alice", scriptId, seer, 13)).toBe(true);
      expect(find(yield* scripts.readImported("alice", scriptId), seer)).toBeUndefined();
    }),
  ));

test("D1 uploads clear the imported flag", () =>
  run(
    Effect.gen(function* () {
      const scripts = yield* ScriptStore;

      const uploaded: StoredArtwork = {
        sourceId: "upload",
        sourceType: "image/png",
        style: { look: "solid" },
        team: "townsfolk",
        variants: [
          { variant: "regular", path: "/artwork/eeeeeeeeeeeeeeeeeeeeeeeeee.png" },
          { variant: "flipped", path: "/artwork/ffffffffffffffffffffffffff.png" },
        ],
      };

      expect(yield* scripts.replaceArtwork("alice", scriptId, seer, uploaded, null, 14)).toBe(true);

      const artwork = (yield* scripts.listCharacters("alice", scriptId)).find(
        ({ id }) => id === seer,
      )?.artwork;

      expect(artwork?.imported).toBeUndefined();
      // Generic fallback for an import never removes uploaded artwork.
      yield* scripts.useGenericArtwork("alice", scriptId, "image", seer, 15);
      expect(
        (yield* scripts.listCharacters("alice", scriptId)).find(({ id }) => id === seer)?.artwork
          ?.sourceId,
      ).toBe("upload");
    }),
  ));
