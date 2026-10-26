import { describe, expect, it } from "vitest";
import { botcSchemaProblems, scriptFileStem } from "../src/export.ts";

const character = {
  id: "custom1",
  name: "Custom",
  team: "townsfolk",
  ability: "Ability",
  image: ["https://alchemist.example/icon.svg"],
};

const metadata = { id: "_meta", name: "Script", author: "Author" };

const valid = [
  metadata,
  character,
  { ...character, id: "custom2" },
  { ...character, id: "custom3" },
  { ...character, id: "custom4" },
];

describe("pinned official whole-document validation", () => {
  it("accepts valid data and rejects official limits and invalid field shapes", () => {
    const documents = [
      valid,
      [],
      valid.slice(0, 4),
      [...valid, ...Array.from({ length: 197 }, () => character)],
      [{ ...metadata, name: "x".repeat(51) }, ...valid.slice(1)],
      [{ ...metadata, author: "x".repeat(51) }, ...valid.slice(1)],
      [{ ...metadata, firstNight: Array.from({ length: 201 }, () => "dusk") }, ...valid.slice(1)],
      ...[
        { id: "Bad ID" },
        { id: "x".repeat(51) },
        { name: "x".repeat(31) },
        { ability: "x".repeat(251) },
        { team: "unknown" },
        { flavor: "x".repeat(501) },
        { firstNightReminder: "x".repeat(501) },
        { otherNightReminder: "x".repeat(501) },
        { reminders: Array.from({ length: 21 }, () => "A") },
        { reminders: ["x".repeat(31)] },
        { remindersGlobal: Array.from({ length: 21 }, () => "A") },
        { remindersGlobal: ["x".repeat(26)] },
        { jinxes: [{ id: "other", reason: "x".repeat(501) }] },
        { setup: "yes" },
        { firstNight: "1" },
        { image: ["relative.svg"] },
        { image: ["https://a.test/a", "https://a.test/b", "https://a.test/c", "https://a.test/d"] },
        { unexpected: true },
      ].map((change) => [metadata, { ...character, ...change }, ...valid.slice(2)]),
    ];

    expect(botcSchemaProblems(valid)).toEqual([]);

    for (const document of documents.slice(1))
      expect(botcSchemaProblems(document).length).toBeGreaterThan(0);
  });
});

describe("URI syntax in every schema-supported position", () => {
  const documentsWithUri = (uri: string) => [
    [metadata, { ...character, image: uri }, ...valid.slice(2)],
    [metadata, { ...character, image: [uri] }, ...valid.slice(2)],
    ...["logo", "background", "almanac"].map((field) => [
      { ...metadata, [field]: uri },
      ...valid.slice(1),
    ]),
  ];

  it.each([
    "https://example.test/icon.svg",
    "https://[::1]:443/a?x=1#icon",
    "urn:example:animal:ferret:nose",
    "mailto:storyteller@example.test",
    "https://example.test/%20",
    "HTTPS://EXAMPLE.TEST/A",
    "custom+scheme:data",
  ])("accepts an absolute URI: %s", (uri) => {
    for (const document of documentsWithUri(uri)) expect(botcSchemaProblems(document)).toEqual([]);
  });

  it.each([
    "relative.svg",
    "not a uri",
    "https://exa mple.test/a",
    "https://example.test/%ZZ",
    "https://example.test/é",
    "#fragment",
    "//example.test/a",
    "https://example.test/\n",
    "https://example.test/\r",
    "https://example.test/\t",
    "1invalid:data",
    "",
  ])("rejects invalid URI syntax: %s", (uri) => {
    for (const document of documentsWithUri(uri))
      expect(botcSchemaProblems(document).length).toBeGreaterThan(0);
  });

  it("keeps allowed metadata extensions while rejecting closed Character extras", () => {
    expect(botcSchemaProblems([{ ...metadata, extension: true }, ...valid.slice(1)])).toEqual([]);
    expect(
      botcSchemaProblems([metadata, { ...character, extension: true }, ...valid.slice(2)]).length,
    ).toBeGreaterThan(0);
  });
});

describe("scriptFileStem", () => {
  it("keeps letters and digits, joining the rest with single hyphens", () => {
    expect(scriptFileStem("Brimstone & Brine")).toBe("Brimstone-Brine");
    expect(scriptFileStem("  Trouble Brewing 2!  ")).toBe("Trouble-Brewing-2");
  });

  it("falls back when nothing usable is left", () => {
    expect(scriptFileStem("")).toBe("script");
    expect(scriptFileStem("✨✨")).toBe("script");
  });
});
