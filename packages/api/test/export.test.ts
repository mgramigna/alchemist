import { botcSchemaProblems, ScriptNotFound, type User } from "@alchemist/domain";
import { readFile } from "node:fs/promises";
import { CurrentUser } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Predicate } from "effect";
import { Scripts } from "../src/scripts.ts";
import { scriptsFixture } from "./support/scripts.ts";

const alice: User = { id: "alice", displayName: "Alice" };
const bob: User = { id: "bob", displayName: "Bob" };

it.effect(
  "exports saved fields, complete orders, derived priorities and each Jinx exactly once; rejects drafts and non-owners",
  () =>
    Effect.gen(function* () {
      const fixture = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;
        const script = yield* scripts.create();
        assert.strictEqual(
          (yield* Effect.flip(scripts.exportJson(script.id, "https://alchemist.example")))._tag,
          "ScriptExportInvalid",
        );
        const characters = [];

        for (const [index, team] of (
          ["townsfolk", "outsider", "demon", "traveller"] as const
        ).entries()) {
          const character = yield* scripts.createCharacter(script.id, team, []);
          characters.push(
            yield* scripts.updateCharacter(script.id, character.id, {
              ...character,
              name: `Character ${index}`,
              ability: `Ability ${index}`,
              reminders: ["Same", "Same"],
              remindersGlobal: ["Global"],
              setup: true,
              flavor: "Flavor",
              artworkCredit: "",
              firstNightInstructions: "First",
              otherNightInstructions: "Other",
            }),
          );
        }

        const [a, b, c, d] = characters;
        assert(a && b && c && d);
        const firstNight = ["dawn", a.id, "dusk", "demoninfo", "minioninfo"] as const;
        yield* scripts.replaceNightOrder(script.id, "firstNight", firstNight);
        yield* scripts.createJinx(script.id, { first: b.id, second: a.id });
        const pair = { first: b.id, second: a.id, explanation: "They interact." };
        yield* scripts.updateJinx(script.id, pair);
        const result = yield* scripts.exportJson(script.id, "https://alchemist.example");

        assert.deepStrictEqual(
          yield* scripts.exportPublicJson(script.id, "https://alchemist.example"),
          result,
        );

        const expected = [
          {
            id: "_meta",
            name: "Untitled Script",
            author: "Alice",
            firstNight,
            otherNight: ["dusk", "dawn"],
          },
          // Characters export in Character Order: here, the order they were added.
          ...characters.map((character) => ({
            id: character.id,
            name: character.name,
            team: character.team,
            ability: character.ability,
            image:
              character.team === "traveller"
                ? ["unaligned", "good", "evil"].map(
                    (alignment) =>
                      `https://alchemist.example/icons/generic/v1/traveller-${alignment}.svg`,
                  )
                : (character.team === "demon" ? ["evil", "good"] : ["good", "evil"]).map(
                    (alignment) =>
                      `https://alchemist.example/icons/generic/v1/${character.team}-${alignment}.svg`,
                  ),
            reminders: ["Same", "Same"],
            remindersGlobal: ["Global"],
            setup: true,
            flavor: "Flavor",
            firstNightReminder: "First",
            otherNightReminder: "Other",
            firstNight: character.id === a.id ? 2 : 0,
            otherNight: 0,
            jinxes:
              character.id === (a.id < b.id ? a.id : b.id)
                ? [{ id: a.id < b.id ? b.id : a.id, reason: "They interact." }]
                : [],
          })),
        ];

        assert.deepStrictEqual(JSON.parse(result.json), expected);
        assert.deepStrictEqual(botcSchemaProblems(JSON.parse(result.json)), []);
        assert.strictEqual(result.filename, "Untitled-Script.json");
        assert.instanceOf(
          yield* Effect.flip(
            scripts
              .exportJson(script.id, "https://alchemist.example")
              .pipe(Effect.provideService(CurrentUser, bob)),
          ),
          ScriptNotFound,
        );
        yield* scripts.updateCharacter(script.id, b.id, {
          ...b,
          name: ` ${a.name.toUpperCase()} `,
          reminders: [" "],
        });

        const invalid = yield* Effect.flip(
          scripts.exportJson(script.id, "https://alchemist.example"),
        );

        assert.strictEqual(invalid._tag, "ScriptExportInvalid");

        if (Predicate.isTagged(invalid, "ScriptExportInvalid"))
          assert(invalid.problems.some((problem) => problem.field === "reminders"));
        yield* scripts.updateCharacter(script.id, b.id, b);
        yield* scripts.updateCharacter(script.id, a.id, {
          ...a,
          name: "😀".repeat(30),
          ability: "😀".repeat(250),
          reminders: ["😀".repeat(30)],
          remindersGlobal: ["😀".repeat(25)],
          flavor: "😀".repeat(500),
          artworkCredit: "",
          firstNightInstructions: "😀".repeat(500),
          otherNightInstructions: "😀".repeat(500),
        });
        yield* scripts.updateJinx(script.id, { ...pair, explanation: "😀".repeat(500) });
        yield* scripts.updateDetails(script.id, {
          name: "😀".repeat(50),
          authorCredit: "😀".repeat(50),
          logoCredit: "",
          backgroundCredit: "",
        });
        const unicode = yield* scripts.exportJson(script.id, "https://alchemist.example");
        assert.deepStrictEqual(botcSchemaProblems(JSON.parse(unicode.json)), []);

        yield* scripts.updateDetails(script.id, {
          name: "x".repeat(51),
          authorCredit: "x".repeat(51),
          logoCredit: "",
          backgroundCredit: "",
        });

        const metaInvalid = yield* Effect.flip(
          scripts.exportJson(script.id, "https://alchemist.example"),
        );

        assert.strictEqual(metaInvalid._tag, "ScriptExportInvalid");
      }).pipe(Effect.provide(fixture.layer), Effect.provideService(CurrentUser, alice));
    }),
);

it.effect(
  "anonymous exports preserve supported import data and omit private artwork repair URLs",
  () =>
    Effect.gen(function* () {
      const fixture = yield* scriptsFixture;

      const json = yield* Effect.promise(() =>
        readFile(new URL("../../domain/test/fixtures/import-script.json", import.meta.url), "utf8"),
      );

      yield* Effect.gen(function* () {
        const scripts = yield* Scripts;

        const script = yield* scripts
          .importJson(json, true, "https://alchemist.example")
          .pipe(Effect.provideService(CurrentUser, alice));

        const exported = yield* scripts.exportPublicJson(script.id, "https://alchemist.example");
        const document = JSON.parse(exported.json);
        assert.deepStrictEqual(botcSchemaProblems(document), []);
        assert.strictEqual(
          document.find((c: { id: string }) => c.id === "seer").edition,
          "borrowedmoon",
        );
        assert.notInclude(exported.json, "https://example.org/seer.png");
        assert.notInclude(exported.json, "https://example.org/logo.png");
        assert.notInclude(exported.json, '"source"');
        assert.notInclude(exported.json, '"artwork"');
        fixture.rows.delete(script.id);
        assert.instanceOf(
          yield* scripts.exportPublicJson(script.id, "https://alchemist.example").pipe(Effect.flip),
          ScriptNotFound,
        );
      }).pipe(Effect.provide(fixture.layer));
    }),
);
