import { describe, expect, test } from "vitest";
import { INVALID_REFERENCE, botcDocument, botcSchemaProblems, reviewImport } from "../src/index.ts";
import fixture from "./fixtures/import-script.json" with { type: "json" };

const review = (entries: ReadonlyArray<unknown>) =>
  reviewImport(JSON.stringify(entries), "Current Owner");

// Fixtures exercise the external JSON parser boundary.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const character = <A extends Readonly<Record<string, unknown>>>(overrides: A) => ({
  id: "custom",
  name: "Custom",
  team: "townsfolk",
  ability: "An ability.",
  ...overrides,
});

const characterFixtures = () => ["a", "b", "c", "d"].map((id) => character({ id, name: id }));

describe("JSON import preflight", () => {
  test("normalizes Bloodstar IDs and preserves references through export and reimport", () => {
    const result = review([
      {
        id: "_meta",
        name: "Animalia",
        author: "Dyln",
        otherNight: ["dusk", "falcon_animalia", "ant_animalia", "dawn"],
      },
      character({
        id: "falcon_animalia",
        name: "Falcon",
        firstNight: 16,
        image: "https://example.org/falcon_animalia.png",
        jinxes: [{ id: "ant_animalia", reason: "Rule" }],
        edition: "animalia",
      }),
      character({ id: "ant_animalia", name: "Ant", firstNight: 17 }),
      character({ id: "bear_animalia", name: "Bear", firstNight: 13 }),
      character({ id: "bull_animalia", name: "Bull", firstNight: 18 }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.blockers).toEqual([]);
    const draft = result.draft;
    expect(draft).not.toBeNull();

    if (draft === null) return;
    expect(draft.characters.map((entry) => entry.id)).toEqual([
      "falconanimalia",
      "antanimalia",
      "bearanimalia",
      "bullanimalia",
    ]);
    expect(draft.nightOrders.firstNight).toEqual([
      "dusk",
      "minioninfo",
      "demoninfo",
      "bearanimalia",
      "falconanimalia",
      "antanimalia",
      "bullanimalia",
      "dawn",
    ]);
    expect(draft.nightOrders.otherNight).toEqual(["dusk", "falconanimalia", "antanimalia", "dawn"]);
    expect(draft.jinxes).toEqual([
      { first: "antanimalia", second: "falconanimalia", explanation: "Rule" },
    ]);
    expect(draft.imported.characters[0]).toEqual({ id: "falconanimalia", edition: "animalia" });
    expect(draft.imported.artwork[0]).toMatchObject({
      characterId: "falconanimalia",
      slots: [{ source: "https://example.org/falcon_animalia.png", state: "pending" }],
    });
    expect(result.warnings.join(" ")).toContain("falcon_animalia");
    const exported = botcDocument(draft, "https://alchemist.example");
    expect(botcSchemaProblems(exported)).toEqual([]);
    expect(review(exported).draft?.nightOrders).toEqual(draft.nightOrders);
    expect(review(exported).draft?.jinxes).toEqual(draft.jinxes);
  });

  test.each([
    [character({ id: "a_b" }), character({ id: "ab" })],
    [character({ id: "a_b" }), character({ id: "a__b" })],
    [character({ id: "___" })],
    [character({ id: "du_sk" })],
    [character({ id: "a_b", jinxes: [{ id: "ab", reason: "Unknown reference" }] })],
    [{ id: "_meta", name: "Test", otherNight: ["dusk", "ab", "dawn"] }, character({ id: "a_b" })],
  ])("rejects ambiguous or unusable normalized IDs and unknown references (%#)", (...entries) => {
    const result = review(entries);
    expect(result.draft).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("preserves fields, independent explicit orders, stable priority ties, one-sided Jinxes and artwork slots", () => {
    const result = review(fixture);
    expect(result.errors).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.discarded).toEqual([]);
    const draft = result.draft;
    expect(draft).not.toBeNull();

    if (draft === null) return;
    expect(draft.script).toEqual({ name: "A Borrowed Moon", authorCredit: "Original Designer" });
    expect(draft.nightOrders.firstNight).toEqual([
      "dusk",
      "minioninfo",
      "demoninfo",
      "seer",
      "dawn",
      "shade",
    ]);
    expect(draft.nightOrders.otherNight).toEqual(["dusk", "moon", "seer", "shade", "dawn"]);
    expect(draft.jinxes).toEqual([
      { first: "seer", second: "shade", explanation: "They know one another." },
    ]);
    expect(draft.characters[0]).toMatchObject({
      id: "seer",
      reminders: ["Known", "Known"],
      remindersGlobal: ["Moon"],
      setup: true,
      firstNightInstructions: "Show a player.",
      flavor: "The moon remembers.",
    });
    expect(draft.imported.artwork).toEqual([
      {
        characterId: "seer",
        field: "image",
        format: "single",
        slots: [{ source: "https://example.org/seer.png", state: "pending" }],
      },
      {
        characterId: "shade",
        field: "image",
        format: "array",
        slots: [
          { source: "https://example.org/shade.png", state: "pending" },
          { source: "broken image", state: "failed", problem: INVALID_REFERENCE },
        ],
      },
      {
        field: "logo",
        format: "single",
        slots: [{ source: "https://example.org/logo.png", state: "pending" }],
      },
    ]);
    const exported = botcDocument(draft, "https://alchemist.example");
    expect(botcSchemaProblems(exported)).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain("example.org/seer");
    expect(JSON.stringify(exported)).not.toContain("example.org/logo");
    expect(exported[0]).toMatchObject({
      hideTitle: false,
      bootlegger: ["Use the optional rule."],
      almanac: "https://example.org/rules",
    });
    expect(exported[1]).toMatchObject({
      edition: "borrowedmoon",
      special: [{ type: "signal", name: "card", value: "Moon", time: "night" }],
      image: "https://alchemist.example/icons/generic/v1/townsfolk-good.svg",
    });
    const again = review(exported);
    expect(again.errors).toEqual([]);
    expect(again.draft?.nightOrders).toEqual(draft.nightOrders);
    expect(again.draft?.imported.characters).toEqual(draft.imported.characters);
  });

  test("absent metadata defaults visibly; numeric fallback ignores absent, zero and negative priorities", () => {
    const result = review([
      character({ id: "a", firstNight: 2 }),
      character({ id: "b", firstNight: 2 }),
      character({ id: "c", firstNight: -1 }),
      character({ id: "d", firstNight: 0 }),
    ]);

    expect(result.draft?.script).toEqual({
      name: "Imported Script",
      authorCredit: "Current Owner",
    });
    expect(result.warnings.join(" ")).toContain("No metadata");
    expect(result.draft?.nightOrders).toEqual({
      firstNight: ["dusk", "minioninfo", "demoninfo", "a", "b", "dawn"],
      otherNight: ["dusk", "dawn"],
    });
    expect(result.blockers.filter((problem) => problem.field === "name")).toHaveLength(4);
  });

  test("other-night metadata wins while first-night numeric priorities are used", () => {
    const result = review([
      { id: "_meta", name: "Test", otherNight: ["dawn", "custom", "dusk"] },
      character({ firstNight: 1, otherNight: 0 }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.draft?.nightOrders).toEqual({
      firstNight: ["dusk", "minioninfo", "demoninfo", "custom", "dawn"],
      otherNight: ["dawn", "custom", "dusk"],
    });
  });

  test.each([
    ["duplicate IDs", [character({}), character({})]],
    ["invalid ID", [character({ id: "Upper_Case" })]],
    ["ID with trailing newline", [character({ id: "custom\n" })]],
    ["reserved ID", [character({ id: "dusk" })]],
    ["official string", ["imp"]],
    ["deprecated official reference", [{ id: "imp" }]],
    ["Fabled", [character({ team: "fabled" })]],
    ["Loric", [character({ team: "loric" })]],
    ["unknown Team", [character({ team: "outsiders" })]],
    ["wrong field", [character({ reminders: "Dead" })]],
    ["bad special", [character({ special: [{ type: "mystery", name: "card" }] })]],
    [
      "duplicate metadata",
      [
        { id: "_meta", name: "A" },
        { id: "_meta", name: "B" },
      ],
    ],
    ["dangling Jinx", [character({ jinxes: [{ id: "missing", reason: "A" }] })]],
    ["self Jinx", [character({ jinxes: [{ id: "custom", reason: "A" }] })]],
    [
      "conflicting Jinx",
      [
        character({ id: "a", jinxes: [{ id: "b", reason: "A" }] }),
        character({ id: "b", jinxes: [{ id: "a", reason: "B" }] }),
      ],
    ],
    ["missing standard step", [{ id: "_meta", name: "A", firstNight: [] }, character({})]],
    ["wrong order type", [{ id: "_meta", name: "A", firstNight: null }, character({})]],
    [
      "dangling night reference",
      [{ id: "_meta", name: "A", otherNight: ["dusk", "missing", "dawn"] }, character({})],
    ],
    [
      "duplicate step",
      [{ id: "_meta", name: "A", otherNight: ["dusk", "dusk", "dawn"] }, character({})],
    ],
    [
      "duplicate membership",
      [{ id: "_meta", name: "A", otherNight: ["dusk", "custom", "custom", "dawn"] }, character({})],
    ],
  ])("rejects %s without producing a draft", (_, entries) => {
    const result = review(entries);
    expect(result.draft).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test.each(["{", "null", "{}"])("rejects malformed/top-level JSON %s", (json) =>
    expect(reviewImport(json, "Owner").draft).toBeNull(),
  );

  test("reports unknown and Bloodstar fields, including nested ones, before discard", () => {
    const result = review([
      { id: "_meta", name: "A", bloodstar: {} },
      character({
        bloodstar: true,
        special: [{ type: "signal", name: "card", extra: 1 }],
        jinxes: [{ id: "b", reason: "Rule", hidden: true }],
      }),
      character({ id: "b" }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.discarded).toEqual([
      "Entry 1.bloodstar",
      "Entry 2.bloodstar",
      "Entry 2.special[0].extra",
      "Entry 2.jinxes[0].hidden",
    ]);
  });

  test("content-invalid representable drafts keep blockers and supplied blank credit", () => {
    const result = review([
      { id: "_meta", name: "", author: "" },
      ...characterFixtures().map((entry) => ({
        ...entry,
        name: " Duplicate ",
        ability: "",
        reminders: [""],
        flavor: "x".repeat(501),
      })),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.draft?.script).toEqual({ name: "", authorCredit: "" });
    expect(result.blockers.some((problem) => problem.field === "ability")).toBe(true);
    expect(result.blockers.some((problem) => problem.field === "reminders")).toBe(true);
    expect(result.blockers.some((problem) => problem.field === "flavor")).toBe(true);
  });

  test("identical two-sided Jinxes normalize to one relationship", () => {
    const result = review([
      character({ id: "a", jinxes: [{ id: "b", reason: "Rule" }] }),
      character({ id: "b", jinxes: [{ id: "a", reason: "Rule" }] }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.draft?.jinxes).toHaveLength(1);
  });
});
