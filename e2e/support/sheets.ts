// Sheet Scripts served anonymously through the public read, shared by the sheet specs.
import { OwnedScript } from "@alchemist/domain";
import { callRpc, signIn } from "./api.ts";
import { expect, type Page } from "@playwright/test";

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
    id: `sheetcharacter${next}`,
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
  name: "Brimstone & Brine",
  authorCredit: "Sample Author",
  characters,
  nightOrders,
  jinxes,
});

// Import through persistence, then exercise the public read without an owner session.
export const serve = async (page: Page, script: ReturnType<typeof sheetScript>) => {
  await signIn(page, { sub: `sheets-${crypto.randomUUID()}`, name: "Sheet Owner" });

  const json = JSON.stringify([
    {
      id: "_meta",
      name: script.name,
      author: script.authorCredit,
      ...script.nightOrders,
    },
    ...script.characters.map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      ability: c.ability,
      firstNightReminder: c.firstNightInstructions,
      otherNightReminder: c.otherNightInstructions,
      jinxes: script.jinxes
        .filter((jinx) => jinx.first === c.id)
        .map((jinx) => ({ id: jinx.second, reason: jinx.explanation })),
    })),
  ]);

  // Import remaps external Character IDs and metadata night-order references together.
  const saved = await callRpc(
    page,
    "Script.import",
    { json, acknowledgeDiscard: false },
    OwnedScript,
  );

  // The real sign-out endpoint enforces same-origin POSTs and redirects on success.
  const response = await page.request.post("/auth/sign-out", {
    headers: { Origin: new URL(page.url()).origin },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
  // A deliberately stalled font must not stall navigation before capture can
  // exercise its own resource timeout (Firefox includes fonts in the load event).
  await page.goto(`/scripts/${saved.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Brimstone & Brine" })).toBeVisible();
};

export const sheet = (page: Page, name: "Character sheet" | "Night sheet") =>
  page.getByRole("region", { name });

export const box = async (page: Page, name: "Character sheet" | "Night sheet") =>
  sheet(page, name).evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));

export const short = () => {
  const chef = character("townsfolk", "Chef", "You start knowing a number.", "Show the number.");
  const imp = character("demon", "Imp", "Each night*, choose a player: they die.", "", "");

  // Public sheets require an exportable Script (at least four Characters).
  // Keep the extra Characters out of the explicit orders and retain one Demon
  // so the blank-instruction rows and icon-fallback counts stay under test.
  const washerwoman = character("townsfolk", "Washerwoman", "You start knowing a Townsfolk.");
  const librarian = character("townsfolk", "Librarian", "You start knowing an Outsider.");

  return sheetScript([chef, washerwoman, librarian, imp], {
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
  // Overflow with many valid Characters, not abilities blocked by public-read validation.
  const wordy = "x ".repeat(125).trim();

  const characters = Array.from({ length: 60 }, (_, i) =>
    character(i < 40 ? "townsfolk" : "minion", `Long ${i + 1}`, wordy),
  );

  return sheetScript(characters, {
    firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
    otherNight: ["dusk", "dawn"],
  });
};
