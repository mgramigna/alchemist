import {
  botcDocument,
  Character as DomainCharacter,
  NightOrders as DomainNightOrders,
  Jinx as DomainJinx,
} from "@alchemist/domain";
import { Schema } from "effect";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const rpc = /\/api\/rpc\/?$/;

interface Script {
  id: string;
  name: string;
  authorCredit: string;
  updatedAt: number;
}

interface Character {
  id: string;
  name: string;
  ability: string;
  team: string;
  reminders: string[];
  remindersGlobal: string[];
  setup: boolean;
  flavor: string;
  firstNightInstructions: string;
  otherNightInstructions: string;
}

interface NightOrders {
  firstNight: string[];
  otherNight: string[];
}

type Night = keyof NightOrders;

interface Jinx {
  first: string;
  second: string;
  explanation: string;
}

interface OwnerApi {
  readonly jinxes: Jinx[];
  readonly scripts: Script[];
  readonly characters: Character[];
  nightOrders: NightOrders;
  readonly nightSaves: Night[];
  readonly characterSaves: string[];
  readonly saves: string[];
  exports: number;
  failSaves: boolean;
  created: number;
}

type WireValue =
  | null
  | { filename: string; json: string }
  | Jinx
  | ReadonlyArray<Jinx>
  | { first: string; second: string }
  | Script
  | Character
  | ReadonlyArray<Character>
  | string
  | ReadonlyArray<Script>
  | NightOrders
  | { readonly id: string; readonly displayName: string }
  | (Omit<Script, "updatedAt"> & { readonly characters: Character[]; readonly jinxes: Jinx[] });

// Controlled owner API for browser states. Ownership, persistence and isolation
// are covered against real D1 and the application service.
const ownerApi = async (page: Page) => {
  const state: OwnerApi = {
    jinxes: [],
    scripts: [],
    characters: [],
    nightOrders: {
      firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
      otherNight: ["dusk", "dawn"],
    },
    nightSaves: [],
    characterSaves: [],
    saves: [],
    exports: 0,
    failSaves: false,
    created: 0,
  };

  const success = (requestId: string, value: WireValue) =>
    `{"_tag":"Exit","requestId":${JSON.stringify(requestId)},"exit":{"_tag":"Success","value":${JSON.stringify(value)}}}\n`;

  await page.route(rpc, async (route) => {
    const body = route.request().postDataJSON();

    const reply = (value: WireValue) =>
      route.fulfill({ contentType: "application/x-ndjson", body: success(body.id, value) });

    const find = () => state.scripts.find((candidate) => candidate.id === body.payload.id);

    switch (body.tag) {
      case "Account.current":
        return reply({ id: "user", displayName: "Ada Lovelace" });
      case "Script.listOwned":
        return reply([...state.scripts].sort((a, b) => b.updatedAt - a.updatedAt));
      case "Script.create": {
        state.created += 1;

        const script = {
          id: `01k8ae0000000000000000000${state.created}`,
          name: "Untitled Script",
          authorCredit: "Ada Lovelace",
          updatedAt: Date.now(),
        };

        state.scripts.push(script);

        return reply(script);
      }

      case "Script.export": {
        state.exports += 1;
        const script = find();

        if (!script || state.failSaves) return route.abort();

        return reply({
          filename: "saved-script.json",
          json: JSON.stringify(
            botcDocument(
              {
                script,
                characters: state.characters.map((character) =>
                  Schema.decodeUnknownSync(DomainCharacter)(character),
                ),
                nightOrders: Schema.decodeSync(DomainNightOrders)(state.nightOrders),
                jinxes: state.jinxes.map((jinx) => Schema.decodeSync(DomainJinx)(jinx)),
              },
              "https://alchemist.example",
            ),
          ),
        });
      }

      case "Script.readImported":
        return reply(null);
      case "Script.readOwned": {
        const script = find();

        return script ? reply(script) : route.abort();
      }

      case "Script.updateDetails": {
        const script = find();

        if (state.failSaves || !script) return route.abort();

        script.name = body.payload.name;
        script.authorCredit = body.payload.authorCredit;
        script.updatedAt = Date.now();
        state.saves.push(script.name);

        return reply(script);
      }

      case "Jinx.list":
        return reply(state.jinxes);
      case "Jinx.create": {
        if (state.failSaves) return route.abort();

        const [first, second] = [body.payload.first, body.payload.second].sort((a, b) =>
          a.localeCompare(b),
        );

        const jinx = { first, second, explanation: "" };
        state.jinxes.push(jinx);

        return reply(jinx);
      }

      case "Jinx.update": {
        if (state.failSaves) return route.abort();

        const jinx = state.jinxes.find(
          (j) => j.first === body.payload.first && j.second === body.payload.second,
        );

        if (!jinx) return route.abort();
        jinx.explanation = body.payload.explanation;

        return reply(jinx);
      }

      case "Jinx.delete": {
        if (state.failSaves) return route.abort();

        const index = state.jinxes.findIndex(
          (j) => j.first === body.payload.first && j.second === body.payload.second,
        );

        if (index < 0) return route.abort();
        state.jinxes.splice(index, 1);

        return reply({ first: body.payload.first, second: body.payload.second });
      }

      case "Character.list":
        return reply(state.characters);
      case "Character.create": {
        const character = {
          id: `01k8af0000000000000000000${state.characters.length + 1}`,
          name: "",
          ability: "",
          team: body.payload.team,
          reminders: [],
          remindersGlobal: [],
          setup: false,
          flavor: "",
          firstNightInstructions: "",
          otherNightInstructions: "",
        };

        state.characters.push(character);

        const nights: Night[] = body.payload.nights;

        for (const night of nights) {
          const order = state.nightOrders[night];
          order.splice(order.indexOf("dawn"), 0, character.id);
        }

        return reply(character);
      }

      case "Character.update": {
        const character = state.characters.find(({ id }) => id === body.payload.id);

        if (state.failSaves || !character) return route.abort();

        character.reminders = body.payload.reminders;
        character.remindersGlobal = body.payload.remindersGlobal;
        character.setup = body.payload.setup;
        character.flavor = body.payload.flavor;
        character.name = body.payload.name;
        character.ability = body.payload.ability;
        character.team = body.payload.team;
        character.firstNightInstructions = body.payload.firstNightInstructions;
        character.otherNightInstructions = body.payload.otherNightInstructions;
        state.characterSaves.push(character.name);

        return reply(character);
      }

      case "Character.delete": {
        state.characters.splice(
          state.characters.findIndex(({ id }) => id === body.payload.id),
          1,
        );

        for (let i = state.jinxes.length - 1; i >= 0; i--) {
          const jinx = state.jinxes[i];

          if (jinx?.first === body.payload.id || jinx?.second === body.payload.id)
            state.jinxes.splice(i, 1);
        }

        state.nightOrders = {
          firstNight: state.nightOrders.firstNight.filter((entry) => entry !== body.payload.id),
          otherNight: state.nightOrders.otherNight.filter((entry) => entry !== body.payload.id),
        };

        return reply(body.payload.id);
      }

      case "NightOrder.read":
        return reply(state.nightOrders);
      case "NightOrder.replace": {
        if (state.failSaves) return route.abort();

        state.nightOrders = { ...state.nightOrders, [body.payload.night]: body.payload.order };
        state.nightSaves.push(body.payload.night);

        return reply(state.nightOrders);
      }

      case "Script.readPublic": {
        const script = find();

        return script
          ? reply({
              id: script.id,
              name: script.name,
              authorCredit: script.authorCredit,
              characters: state.characters,
              jinxes: state.jinxes,
            })
          : route.abort();
      }

      default:
        return route.abort();
    }
  });

  return state;
};

type NightChoice =
  | "First Night and Other Nights"
  | "First Night only"
  | "Other Nights only"
  | "No night action";

// Creation asks which nights the new Character acts on.
const addCharacter = async (page: Page, team: string, nights: NightChoice = "No night action") => {
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: `Add ${team}` })
    .click();
  await page.getByRole("menuitem", { name: nights }).click();
};

const chooseTeam = async (page: Page, team: string) => {
  await page.getByRole("combobox", { name: "Team" }).click();
  await page.getByRole("option", { name: team }).click();
};

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("an owner creates a Script, edits it with autosave, reopens it from the workspace and copies its link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await ownerApi(page);
  await page.goto("/");
  await expect(page.getByText("No Scripts yet")).toBeVisible();
  await page.getByRole("button", { name: "New Script" }).click();

  await expect(page).toHaveURL(/\/scripts\/01k8ae00000000000000000001\/edit$/);
  const name = page.getByRole("textbox", { name: "Script name" });
  const credit = page.getByRole("textbox", { name: "Author Credit" });
  await expect(name).toHaveValue("Untitled Script");
  await expect(credit).toHaveValue("Ada Lovelace");
  await expect(page.getByRole("status")).toContainText("All changes saved");

  await name.fill("Night of Mirrors");
  await expect(page.getByRole("status")).toContainText("Saving…");
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview).toContainText("Night of Mirrors");
  await credit.fill("The Clocktower Collective");
  await expect(preview).toContainText("by The Clocktower Collective");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  // Debounced: one save for the burst of edits.
  expect(api.saves).toEqual(["Night of Mirrors"]);

  await page.reload();
  await expect(name).toHaveValue("Night of Mirrors");
  await expect(credit).toHaveValue("The Clocktower Collective");

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Share link copied")).toBeVisible();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(shareUrl).pathname).toBe("/scripts/01k8ae00000000000000000001");
  await expect(page.getByRole("textbox", { name: "Share link" })).toHaveValue(shareUrl);

  await page.getByRole("link", { name: "Your Scripts" }).click();
  const list = page.getByRole("list", { name: "Your Scripts" });
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list).toContainText("Night of Mirrors");
  await expect(list).toContainText("by The Clocktower Collective");
  await list.getByRole("link").focus();
  await page.keyboard.press("Enter");
  await expect(name).toHaveValue("Night of Mirrors");

  await page.goto(new URL(shareUrl).pathname);
  await expect(page.getByRole("heading", { name: "Night of Mirrors" })).toBeVisible();
  await expect(page.getByText("Shared Script · Read only")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("a failed save keeps the edit, warns before leaving, and recovers with a keyboard retry", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const name = page.getByRole("textbox", { name: "Script name" });
  await expect(name).toHaveValue("Untitled Script");

  api.failSaves = true;
  await name.fill("Unsaved draft");
  await expect(page.getByRole("status")).toContainText("Couldn’t save your changes");
  await expect(name).toHaveValue("Unsaved draft");

  await page.getByRole("link", { name: "Your Scripts" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave with unsaved changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(name).toHaveValue("Unsaved draft");

  api.failSaves = false;
  const retry = page.getByRole("button", { name: "Retry save" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.saves).toEqual(["Unsaved draft"]);

  await page.getByRole("link", { name: "Your Scripts" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("list", { name: "Your Scripts" })).toContainText("Unsaved draft");
});

test("the Workbench stacks its panes on a narrow screen and is operable with the keyboard", async ({
  page,
}) => {
  await ownerApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const name = page.getByRole("textbox", { name: "Script name" });
  await expect(name).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Script sections" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);

  await name.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Author Credit" })).toBeFocused();
  // Tabbing into a field selects its text; append rather than replace.
  await page.keyboard.press("End");
  await page.keyboard.type(" & friends");
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText(
    "by Ada Lovelace & friends",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
});

test("anonymous and malformed Workbench links explain what to do", async ({ page }) => {
  await page.goto("/scripts/01k8ac00000000000000000001/edit");
  await expect(page.getByText("Sign in to edit this Script")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Sign in with Google" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  await page.goto("/scripts/invalid/edit");
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
});

test("opening a Script announces loading and offers a retry after a transport failure", async ({
  page,
}) => {
  let release = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(rpc, async (route) => {
    await gate;
    await route.abort();
  });
  await page.goto("/scripts/01k8ac00000000000000000001/edit");
  await expect(page.getByRole("status")).toContainText("Opening Script");
  release();
  await expect(page.getByRole("alert")).toContainText("We couldn’t open this Script");
  await page.unroute(rpc);
  const api = await ownerApi(page);
  api.scripts.push({
    id: "01k8ac00000000000000000001",
    name: "Recovered Script",
    authorCredit: "Ada Lovelace",
    updatedAt: 0,
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Script name" })).toHaveValue("Recovered Script");
});

test("an owner adds Characters by Team and finds and fixes what blocks export", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const nav = page.getByRole("navigation", { name: "Script sections" });
  await expect(nav.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();

  // A new blank draft is saved, selected, and named from the keyboard.
  await addCharacter(page, "Townsfolk");
  await expect(page.getByRole("heading", { name: "Unnamed Townsfolk" })).toBeVisible();
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  expect(api.characters).toEqual([
    {
      id: expect.any(String),
      name: "",
      ability: "",
      team: "townsfolk",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      flavor: "",
      firstNightInstructions: "",
      otherNightInstructions: "",
    },
  ]);
  await expect(nav.getByRole("list", { name: "Townsfolk" })).toContainText("2 problems");

  // Script-wide problem navigation leads back to the Character.
  await nav.getByRole("button", { name: "3 problems block export" }).click();
  const blockers = page.getByRole("region", { name: "Before you can export" });
  await expect(blockers.getByRole("button")).toHaveCount(2);
  await blockers.getByRole("button", { name: /Enter an ability/ }).click();
  await expect(page.getByRole("heading", { name: "Unnamed Townsfolk" })).toBeVisible();

  // Over-limit drafts are kept, not truncated, and explain the limit.
  await name.fill("N".repeat(31));
  await expect(page.getByText("Use 30 characters or fewer.")).toBeVisible();
  await expect(page.getByText("31/30 characters")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.characters[0]?.name).toBe("N".repeat(31));

  await name.fill("Washerwoman");
  await page.getByRole("textbox", { name: "Ability" }).fill("You start knowing a Townsfolk.");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await expect(nav.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();

  // Names must be unique, ignoring case and surrounding spaces.
  await addCharacter(page, "Demon");
  await name.fill(" washerwoman ");
  await expect(
    page.getByText("Another Character has this name. Names must be unique."),
  ).toBeVisible();
  await name.fill("Imp");
  await page
    .getByRole("textbox", { name: "Ability" })
    .fill("Each night*, choose a player: they die.");

  // The preview follows edits with each Team's generic icon; clicking selects.
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.getByRole("button", { name: /Washerwoman/ }).locator("img")).toHaveAttribute(
    "src",
    "/icons/generic/v1/townsfolk-good.svg",
  );
  await expect(preview.getByRole("button", { name: /Imp/ }).locator("img")).toHaveAttribute(
    "src",
    "/icons/generic/v1/demon-evil.svg",
  );
  await preview.getByRole("button", { name: /Washerwoman/ }).click();
  await expect(page.getByRole("heading", { name: "Washerwoman" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.characters.map(({ name: saved }) => saved)).toEqual(["Washerwoman", "Imp"]);
});

test("a Team change keeps the Character's content and survives reload; deleting returns to the Script", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const nav = page.getByRole("navigation", { name: "Script sections" });
  await addCharacter(page, "Outsider");
  await page.getByRole("textbox", { name: "Name" }).fill("Drunk");
  await page.getByRole("textbox", { name: "Ability" }).fill("You think you are a Townsfolk.");

  await page.getByRole("combobox", { name: "Team" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Team" })).toContainText("Traveller");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Drunk");
  await expect(page.getByRole("textbox", { name: "Ability" })).toHaveValue(
    "You think you are a Townsfolk.",
  );
  await expect(nav.getByRole("list", { name: "Travellers" })).toContainText("Drunk");
  await expect(nav.getByRole("list", { name: "Outsiders" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Icon" }).getByRole("listitem")).toHaveText([
    "Unaligned",
    "Good",
    "Evil",
  ]);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const [saved] = api.characters;

  await page.reload();
  await nav.getByRole("button", { name: "Drunk" }).click();
  await expect(page.getByRole("combobox", { name: "Team" })).toContainText("Traveller");
  await expect(page.getByRole("textbox", { name: "Ability" })).toHaveValue(
    "You think you are a Townsfolk.",
  );
  expect(api.characters).toEqual([saved]);

  await page.getByRole("button", { name: "Delete Character" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Delete this Character?" });
  await dialog.getByRole("button", { name: "Keep" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Drunk" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Character" }).click();
  await dialog.getByRole("button", { name: "Delete Character" }).click();
  await expect(page.getByRole("heading", { name: "Script details" })).toBeVisible();
  await expect(nav.getByRole("list", { name: "Travellers" })).toHaveCount(0);
  expect(api.characters).toEqual([]);
});

test("Character editing is usable on a narrow screen", async ({ page }) => {
  await ownerApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Minion");
  await page.getByRole("textbox", { name: "Name" }).fill("Poisoner");
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText("Poisoner");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("creation chooses nights; the Character shows its position, keeps instructions when leaving a night, and links to reordering", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk", "First Night and Other Nights");
  await page.getByRole("textbox", { name: "Name" }).fill("Chef");
  const [chef] = api.characters;
  expect(api.nightOrders).toEqual({
    firstNight: ["dusk", "minioninfo", "demoninfo", chef?.id, "dawn"],
    otherNight: ["dusk", chef?.id, "dawn"],
  });

  const nights = page.getByRole("region", { name: "Night actions" });
  await expect(nights.getByRole("checkbox", { name: "Acts on the First Night" })).toBeChecked();
  await expect(nights).toContainText("#4 of 5 · after Demon Info, before Dawn");
  await expect(nights).toContainText("#2 of 3 · after Dusk, before Dawn");

  // Blank instructions are encouraged but allowed.
  await expect(nights.getByText("Tell the Storyteller what to do.").first()).toBeVisible();
  await nights
    .getByRole("textbox", { name: "First Night instructions" })
    .fill("Show the Chef a number.");
  await nights.getByRole("textbox", { name: "Other Nights instructions" }).fill("Kept for later.");

  // Leaving a night keeps its instructions.
  await nights.getByRole("checkbox", { name: "Acts on Other Nights" }).click();
  await expect(nights).not.toContainText("#2 of 3");
  await expect(nights.getByRole("textbox", { name: "Other Nights instructions" })).toHaveValue(
    "Kept for later.",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.nightOrders.otherNight).toEqual(["dusk", "dawn"]);
  expect(api.characters[0]?.otherNightInstructions).toBe("Kept for later.");

  await page.reload();
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: "Chef" })
    .click();
  await expect(nights.getByRole("checkbox", { name: "Acts on Other Nights" })).not.toBeChecked();
  await expect(nights.getByRole("textbox", { name: "Other Nights instructions" })).toHaveValue(
    "Kept for later.",
  );

  // The reorder link opens the night and its sheet in the preview.
  await nights.getByRole("button", { name: "Reorder First Night" }).click();
  await expect(page.getByRole("heading", { name: "First Night", exact: true })).toBeVisible();
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.getByRole("tab", { name: "First Night" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(preview.getByRole("list", { name: "First Night sheet" })).toContainText(
    "Show the Chef a number.",
  );
});

test("an owner reorders a night with the keyboard and by dragging, including steps and after Dawn", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk", "First Night only");
  await page.getByRole("textbox", { name: "Name" }).fill("Chef");
  await addCharacter(page, "Demon");
  await page.getByRole("textbox", { name: "Name" }).fill("Imp");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const [chef, imp] = api.characters;

  const nav = page.getByRole("navigation", { name: "Script sections" });
  await nav.getByRole("button", { name: /^Other Nights/ }).click();
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.getByRole("tab", { name: "Other Nights" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await nav.getByRole("button", { name: /^First Night/ }).click();
  const order = page.getByRole("list", { name: "First Night order" });
  await expect(order.getByRole("listitem")).toHaveCount(5);

  // Keyboard: Chef moves past Dawn; focus follows to the button still usable.
  await page.getByRole("button", { name: "Move Chef down" }).focus();
  await page.keyboard.press("Enter");
  await expect(order.getByRole("listitem").last()).toContainText("Chef");
  await expect(page.getByRole("button", { name: "Move Chef up" })).toBeFocused();
  // Standard steps move too.
  await page.getByRole("button", { name: "Move Dusk down" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Move Dusk down" })).toBeFocused();

  // The tray adds before Dawn; removal returns a Character to the tray.
  const tray = page.getByRole("region", { name: "Not in this night" });
  await tray.getByRole("button", { name: "Add Imp to First Night" }).click();
  await expect(tray).toContainText("Every Character acts on the First Night.");
  await page.getByRole("button", { name: "Remove Chef from First Night" }).click();
  await expect(tray.getByRole("button", { name: "Add Chef to First Night" })).toBeVisible();
  await tray.getByRole("button", { name: "Add Chef to First Night" }).click();

  // Dragging Imp onto Minion Info takes its place at the top.
  await order
    .getByRole("listitem")
    .filter({ hasText: "Imp" })
    .dragTo(order.getByRole("listitem").filter({ hasText: "Minion Info" }));

  const expected = [imp?.id, "minioninfo", "dusk", "demoninfo", chef?.id, "dawn"];
  await expect(order.getByRole("listitem")).toHaveText([
    /Imp/,
    /Minion Info/,
    /Dusk/,
    /Demon Info/,
    /Chef/,
    /Dawn/,
  ]);
  // Blank instructions keep the entry and prompt for text on the sheet.
  await expect(preview.getByRole("list", { name: "First Night sheet" })).toContainText(
    "Add instructions for the Storyteller.",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.nightOrders.firstNight).toEqual(expected);
  expect(api.nightOrders.otherNight).toEqual(["dusk", "dawn"]);

  await page.reload();
  await nav.getByRole("button", { name: /^First Night/ }).click();
  await expect(order.getByRole("listitem")).toHaveText([
    /Imp/,
    /Minion Info/,
    /Dusk/,
    /Demon Info/,
    /Chef/,
    /Dawn/,
  ]);

  // Deleting a Character removes it from the night.
  await order.getByRole("button", { name: "Imp", exact: true }).click();
  await page.getByRole("button", { name: "Delete Character" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete this Character?" })
    .getByRole("button", { name: "Delete Character" })
    .click();
  await expect(page.getByRole("heading", { name: "Script details" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.nightOrders.firstNight).toEqual(["minioninfo", "dusk", "demoninfo", chef?.id, "dawn"]);
});

test("night reordering is usable on a narrow screen", async ({ page }) => {
  await ownerApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Minion", "Other Nights only");
  await page.getByRole("textbox", { name: "Name" }).fill("Poisoner");
  await page.getByRole("button", { name: "Reorder Other Nights" }).click();
  const order = page.getByRole("list", { name: "Other Nights order" });
  await page.getByRole("button", { name: "Move Poisoner up" }).click();
  await expect(order.getByRole("listitem").first()).toContainText("Poisoner");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("Jinxes share invalid drafts and corrections between endpoints, survive reload, and can be deleted from either end", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Chef");
  await page.getByRole("textbox", { name: "Ability", exact: true }).fill("Learn a number.");
  await addCharacter(page, "Demon");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Imp");
  await page.getByRole("textbox", { name: "Ability", exact: true }).fill("Choose a player.");
  const jinxes = page.getByRole("region", { name: "Jinxes", exact: true }).first();
  api.failSaves = true;
  await jinxes.getByRole("button", { name: "Add Jinx" }).click();
  await page.getByRole("menuitem", { name: "Chef" }).click();
  await expect(jinxes.getByRole("alert")).toContainText("Couldn’t add the Jinx.");
  expect(api.jinxes).toEqual([]);
  api.failSaves = false;
  await jinxes.getByRole("button", { name: "Add Jinx" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Chef" }).focus();
  await page.keyboard.press("Enter");
  await expect(jinxes).toContainText("Explain how these Characters interact.");
  await expect(jinxes.locator("img")).toHaveCount(2);
  const explanation = page.getByRole("textbox", { name: "Jinx explanation" });
  await expect(explanation).toBeFocused();
  await explanation.fill("x".repeat(501));
  await expect(jinxes).toContainText("Use 500 characters or fewer.");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.jinxes).toHaveLength(1);
  expect(api.jinxes[0]?.explanation).toBe("x".repeat(501));
  const nav = page.getByRole("navigation", { name: "Script sections" });
  await nav.getByRole("button", { name: /Chef/ }).click();
  await expect(explanation).toHaveValue("x".repeat(501));
  await explanation.fill("The Chef learns about the Imp.");
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(preview.getByRole("region", { name: "Jinxes" })).toContainText(
    "The Chef learns about the Imp.",
  );
  await expect(nav.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.screenshot({ path: test.info().outputPath("jinxes-desktop.png"), fullPage: true });
  const editUrl = page.url();
  await page.goto(editUrl.replace(/\/edit$/, ""));
  const publicJinxes = page.getByRole("region", { name: "Jinxes" });
  await expect(publicJinxes).toContainText("The Chef learns about the Imp.");
  await expect(publicJinxes.locator("img")).toHaveCount(2);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.goto(editUrl);
  await page.reload();
  await nav.getByRole("button", { name: "Imp", exact: true }).click();
  await expect(explanation).toHaveValue("The Chef learns about the Imp.");
  await expect(jinxes.getByRole("button", { name: "Add Jinx" })).toBeDisabled();

  api.failSaves = true;
  await explanation.fill("Unsaved Jinx draft");
  await expect(page.getByRole("status")).toContainText("Couldn’t save your changes");
  await page.getByRole("link", { name: "Your Scripts" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stay" }).click();
  await nav.getByRole("button", { name: "Chef", exact: true }).click();
  await expect(explanation).toHaveValue("Unsaved Jinx draft");
  api.failSaves = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  api.failSaves = true;
  await jinxes.getByRole("button", { name: /Delete Jinx between/ }).click();
  await expect(jinxes).toContainText("Couldn’t delete the Jinx. Try again.");
  await expect(explanation).toHaveValue("Unsaved Jinx draft");
  api.failSaves = false;
  await jinxes.getByRole("button", { name: /Delete Jinx between/ }).focus();
  await page.keyboard.press("Enter");
  await expect(explanation).toHaveCount(0);
  expect(api.jinxes).toEqual([]);
  await page.reload();
  await expect(preview.getByRole("region", { name: "Jinxes" })).toHaveCount(0);
});

test("Jinx creation, editing, and preview fit a narrow screen", async ({ page }) => {
  await ownerApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("A long Character name to wrap");
  await addCharacter(page, "Demon");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Another long Character name");
  const editor = page.getByRole("region", { name: "Jinxes" }).first();
  await editor.getByRole("button", { name: "Add Jinx" }).click();
  await page.getByRole("menuitem", { name: "A long Character name to wrap" }).click();
  await page.getByRole("textbox", { name: "Jinx explanation" }).fill("x".repeat(501));
  await expect(editor).toContainText("Use 500 characters or fewer.");
  await editor.screenshot({ path: test.info().outputPath("jinxes-mobile.png") });
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect(page.getByRole("status")).toContainText("All changes saved");
});

test("Reminder Tokens, setup and flavor support keyboard edits, duplicate ordering and saved invalid drafts", async ({
  page,
}) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Chef");
  await page
    .getByRole("textbox", { name: "Ability", exact: true })
    .fill("You start knowing a number.");
  const ordinary = page.getByRole("region", { name: "Reminder Tokens", exact: true });
  const global = page.getByRole("region", { name: "Global Reminder Tokens", exact: true });
  const add = ordinary.getByRole("button", { name: "Add Reminder Token", exact: true });
  await expect(page.getByRole("checkbox", { name: "Affects setup" })).not.toBeChecked();
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(ordinary.getByRole("textbox", { name: "Token 1", exact: true })).toBeFocused();
  await expect(ordinary.getByText("Enter a token label.")).toBeVisible();
  await ordinary.getByRole("textbox", { name: "Token 1", exact: true }).fill("Dead");
  await add.click();
  await ordinary.getByRole("textbox", { name: "Token 2", exact: true }).fill("Dead");
  await add.click();
  await ordinary.getByRole("textbox", { name: "Token 3", exact: true }).fill("Chosen");
  await ordinary.getByRole("button", { name: "Move token 3 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(ordinary.getByRole("button", { name: "Move token 2 up" })).toBeFocused();
  expect(
    await ordinary
      .getByRole("textbox")
      .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("value"))),
  ).toEqual(["Dead", "Chosen", "Dead"]);
  await ordinary.getByRole("button", { name: "Remove token 1", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(ordinary.getByRole("textbox", { name: "Token 1", exact: true })).toBeFocused();
  await ordinary.getByRole("textbox", { name: "Token 1", exact: true }).fill("x".repeat(31));
  await expect(ordinary.getByText("Use 30 characters or fewer.")).toBeVisible();
  await global.getByRole("button", { name: "Add Global Reminder Token" }).click();
  await global.getByRole("textbox", { name: "Token 1", exact: true }).fill("x".repeat(26));
  await expect(global.getByText("Use 25 characters or fewer.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Affects setup" }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("textbox", { name: "Flavor text" }).fill("x".repeat(501));
  await expect(page.getByRole("textbox", { name: "Flavor text" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await chooseTeam(page, "Traveller");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.characters[0]).toMatchObject({
    reminders: ["x".repeat(31), "Dead"],
    remindersGlobal: ["x".repeat(26)],
    setup: true,
    flavor: "x".repeat(501),
    team: "traveller",
  });
  await page.screenshot({ path: test.info().outputPath("reminders-desktop.png"), fullPage: true });
  await page.reload();
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: /^Chef/ })
    .click();
  await expect(ordinary.getByRole("textbox").first()).toHaveValue("x".repeat(31));
  await expect(ordinary.getByRole("textbox").last()).toHaveValue("Dead");
  await expect(ordinary.getByText("Use 30 characters or fewer.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Affects setup" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Flavor text" })).toHaveValue("x".repeat(501));
  // The shared summary identifies the separate list and position.
  await page.getByRole("button", { name: "4 problems block export" }).click();
  await expect(
    page.getByText("Reminder Tokens, token 1: Use 30 characters or fewer.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Before you can export" })
    .getByRole("button")
    .first()
    .click();
  await ordinary.getByRole("textbox", { name: "Token 1", exact: true }).fill("Chosen");
  await global.getByRole("textbox", { name: "Token 1", exact: true }).fill("Drunk");
  await page.getByRole("textbox", { name: "Flavor text" }).fill("");
  await expect(page.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();
  api.failSaves = true;
  await ordinary
    .getByRole("textbox", { name: "Token 1", exact: true })
    .fill("Retained after failure");
  await expect(page.getByRole("status")).toContainText("Couldn’t save");
  await expect(ordinary.getByRole("textbox", { name: "Token 1", exact: true })).toHaveValue(
    "Retained after failure",
  );
  api.failSaves = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.characters[0]?.reminders).toEqual(["Retained after failure", "Dead"]);
});

test("Reminder Token count errors remain editable on a narrow screen", async ({ page }) => {
  await ownerApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Minion");
  const ordinary = page.getByRole("region", { name: "Reminder Tokens", exact: true });

  for (let i = 1; i <= 21; i++) {
    await ordinary.getByRole("button", { name: "Add Reminder Token" }).click();
    await ordinary.getByRole("textbox", { name: `Token ${i}`, exact: true }).fill("Poisoned");
  }

  await expect(ordinary.getByText("Use 20 tokens or fewer.")).toBeVisible();
  await page.getByRole("button", { name: "4 problems block export" }).click();
  await expect(
    page.getByText("Reminder Tokens: Use 20 tokens or fewer.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: /Unnamed Minion/ })
    .click();
  await expect(ordinary.getByRole("textbox")).toHaveCount(21);
  await ordinary.getByRole("button", { name: "Remove token 21", exact: true }).click();
  await expect(ordinary.getByText("Use 20 tokens or fewer.")).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
  await ordinary.screenshot({ path: test.info().outputPath("reminders-mobile.png") });
});

test("JSON download requires saved edits and downloads the saved Script on a narrow screen", async ({
  page,
}) => {
  const api = await ownerApi(page);
  const id = "01k8ae00000000000000000001";
  api.scripts.push({ id, name: "Saved Script", authorCredit: "Ada", updatedAt: 0 });

  for (let i = 1; i <= 4; i++)
    api.characters.push({
      id: `01k8af0000000000000000000${i}`,
      name: `Character ${i}`,
      team: i === 4 ? "traveller" : "townsfolk",
      ability: `Ability ${i}`,
      reminders: ["Same", "Same"],
      remindersGlobal: ["Global"],
      setup: true,
      flavor: "Flavor",
      firstNightInstructions: "First",
      otherNightInstructions: "Other",
    });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/scripts/${id}/edit`);
  await expect(page.getByText("Ready to export")).toBeVisible();
  const name = page.getByRole("textbox", { name: "Script name" });
  await name.fill("Just edited");
  await page.getByRole("button", { name: "Download JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("Wait for all changes to save");
  expect(api.exports).toBe(0);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  api.failSaves = true;
  await name.fill("Retained after failure");
  await expect(page.getByRole("status")).toContainText("Couldn’t save");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect(api.exports).toBe(0);
  api.failSaves = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).focus();
  await page.keyboard.press("Enter");
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("saved-script.json");
  const path = await file.path();

  if (path === null) throw new Error("Download did not produce a file");
  const document = JSON.parse(await readFile(path, "utf8"));
  expect(document[0]).toEqual({
    id: "_meta",
    name: "Retained after failure",
    author: "Ada",
    firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
    otherNight: ["dusk", "dawn"],
  });
  expect(document.slice(1).map((character: { name: string }) => character.name)).toEqual([
    "Character 1",
    "Character 2",
    "Character 3",
    "Character 4",
  ]);
  expect(api.exports).toBe(1);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("export blockers and counters use Unicode code points", async ({ page }) => {
  const api = await ownerApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("😀".repeat(30));
  await page.getByRole("textbox", { name: "Ability", exact: true }).fill("😀".repeat(250));
  await expect(page.getByText("30/30 characters", { exact: true })).toBeVisible();
  await expect(page.getByText("250/250 characters", { exact: true })).toBeVisible();
  const reminders = page.getByRole("region", { name: "Reminder Tokens", exact: true });
  await reminders.getByRole("button", { name: "Add Reminder Token" }).click();
  await reminders.getByRole("textbox", { name: "Token 1", exact: true }).fill("😀".repeat(30));
  await expect(reminders.getByText("30/30 characters", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(api.characters[0]?.name).toBe("😀".repeat(30));
  expect(api.characters[0]?.ability).toBe("😀".repeat(250));
  await expect(page.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();
  await reminders.getByRole("textbox", { name: "Token 1", exact: true }).fill("😀".repeat(31));
  await expect(reminders.getByText("31/30 characters", { exact: true })).toBeVisible();
  await expect(reminders.getByText("Use 30 characters or fewer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "2 problems block export" })).toBeVisible();
});
