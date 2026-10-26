// Sheet Scripts served anonymously through the public read, shared by the sheet specs.
import {
  Character,
  NightOrders,
  ScriptExportInvalid,
  botcDocument,
  scriptExportProblems,
} from "@alchemist/domain";
import { Schema } from "effect";
import { expect, type Page } from "@playwright/test";

const rpc = /\/api\/rpc\/?$/;
const id = "01k8ag00000000000000000001";

interface Sample {
  readonly id: string;
  readonly name: string;
  readonly ability: string;
  readonly team: string;
  readonly firstNightInstructions: string;
  readonly otherNightInstructions: string;
}

let next = 0;

export const character = (
  team: string,
  name: string,
  ability = "Each night, choose a player: you learn something useful about them.",
  first = "",
  other = "",
): Sample => {
  next += 1;

  return {
    id: `01k8ah${String(next).padStart(20, "0")}`,
    name,
    ability,
    team,
    firstNightInstructions: first,
    otherNightInstructions: other,
  };
};

export const sheetScript = (
  characters: ReadonlyArray<Sample>,
  nightOrders: { firstNight: string[]; otherNight: string[] },
  jinxes: ReadonlyArray<{ first: string; second: string; explanation: string }> = [],
) => ({
  id,
  name: "Brimstone & Brine",
  authorCredit: "Sample Author",
  characters,
  nightOrders,
  jinxes,
});

// Anonymous public read, served with the given Script.
export const serve = async (page: Page, script: ReturnType<typeof sheetScript>) => {
  await page.route(rpc, async (route) => {
    const body = route.request().postDataJSON();

    if (body.tag === "Script.exportPublic") {
      const source = {
        script,
        characters: script.characters.map((c) =>
          Schema.decodeUnknownSync(Character)({
            ...c,
            reminders: [],
            remindersGlobal: [],
            setup: false,
            flavor: "",
          }),
        ),
        nightOrders: Schema.decodeSync(NightOrders)(script.nightOrders),
        jinxes: [],
      };

      const problems = scriptExportProblems(source);

      // Deliberate NDJSON wire fixtures, matching the RPC transport.
      const exit = problems.length
        ? `{"_tag":"Failure","cause":[{"_tag":"Fail","error":${JSON.stringify(new ScriptExportInvalid({ problems }))}}]}`
        : `{"_tag":"Success","value":${JSON.stringify({ filename: "fixture.json", json: JSON.stringify(botcDocument(source, "https://alchemist.example")) })}}`;

      return route.fulfill({
        contentType: "application/x-ndjson",
        body: `{"_tag":"Exit","requestId":${JSON.stringify(body.id)},"exit":${exit}}\n`,
      });
    }

    return body.tag === "Script.readPublic"
      ? route.fulfill({
          contentType: "application/x-ndjson",
          body: `{"_tag":"Exit","requestId":${JSON.stringify(body.id)},"exit":{"_tag":"Success","value":${JSON.stringify(script)}}}\n`,
        })
      : route.abort();
  });
  await page.goto(`/scripts/${id}`);
  await expect(page.getByRole("heading", { name: "Brimstone & Brine" })).toBeVisible();
};

export const sheet = (page: Page, name: "Character sheet" | "Night sheet") =>
  page.getByRole("region", { name });

export const box = async (page: Page, name: "Character sheet" | "Night sheet") =>
  sheet(page, name).evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));

export const short = () => {
  const chef = character("townsfolk", "Chef", "You start knowing a number.", "Show the number.");
  const imp = character("demon", "Imp", "Each night*, choose a player: they die.", "", "");

  return sheetScript([chef, imp], {
    firstNight: ["dusk", "minioninfo", "demoninfo", chef.id, "dawn", imp.id],
    otherNight: ["dusk", imp.id, "dawn"],
  });
};

export const dense = () => {
  const teams = [
    ...Array.from({ length: 13 }, (_, i) => character("townsfolk", `Townsfolk ${i + 1}`)),
    ...Array.from({ length: 4 }, (_, i) => character("outsider", `Outsider ${i + 1}`)),
    ...Array.from({ length: 4 }, (_, i) => character("minion", `Minion ${i + 1}`)),
    ...Array.from({ length: 4 }, (_, i) => character("demon", `Demon ${i + 1}`)),
    ...Array.from({ length: 3 }, (_, i) => character("traveller", `Traveller ${i + 1}`)),
  ];

  const instructed = teams.map((c) => ({
    ...c,
    firstNightInstructions: `Wake the ${c.name}. They point to a player; nod or shake your head.`,
    otherNightInstructions: `Wake the ${c.name}. They point to a player.`,
  }));

  const ids = instructed.map((c) => c.id);

  return sheetScript(
    instructed,
    {
      firstNight: ["dusk", "minioninfo", "demoninfo", ...ids.slice(0, 20), "dawn"],
      otherNight: ["dusk", ...ids.slice(0, 24), "dawn"],
    },
    [
      { first: ids[0] ?? "", second: ids[21] ?? "", explanation: "Only one may act each night." },
      { first: ids[1] ?? "", second: ids[22] ?? "", explanation: "The Demon learns this player." },
    ],
  );
};

export const long = () => {
  const wordy = "x ".repeat(240).trim();

  const characters = Array.from({ length: 30 }, (_, i) =>
    character(i < 20 ? "townsfolk" : "minion", `Long ${i + 1}`, wordy),
  );

  return sheetScript(characters, { firstNight: ["dusk", "dawn"], otherNight: ["dusk", "dawn"] });
};
