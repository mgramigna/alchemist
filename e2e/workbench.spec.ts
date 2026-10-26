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
}

interface OwnerApi {
  readonly scripts: Script[];
  readonly characters: Character[];
  readonly characterSaves: string[];
  readonly saves: string[];
  failSaves: boolean;
  created: number;
}

type WireValue =
  | Script
  | Character
  | ReadonlyArray<Character>
  | string
  | ReadonlyArray<Script>
  | { readonly id: string; readonly displayName: string }
  | (Omit<Script, "updatedAt"> & { readonly characters: [] });

// Controlled owner API for browser states. Ownership, persistence and isolation
// are covered against real D1 and the application service.
const ownerApi = async (page: Page) => {
  const state: OwnerApi = {
    scripts: [],
    characters: [],
    characterSaves: [],
    saves: [],
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

      case "Character.list":
        return reply(state.characters);
      case "Character.create": {
        const character = {
          id: `01k8af0000000000000000000${state.characters.length + 1}`,
          name: "",
          ability: "",
          team: body.payload.team,
        };

        state.characters.push(character);

        return reply(character);
      }

      case "Character.update": {
        const character = state.characters.find(({ id }) => id === body.payload.id);

        if (state.failSaves || !character) return route.abort();

        character.name = body.payload.name;
        character.ability = body.payload.ability;
        character.team = body.payload.team;
        state.characterSaves.push(character.name);

        return reply(character);
      }

      case "Character.delete": {
        state.characters.splice(
          state.characters.findIndex(({ id }) => id === body.payload.id),
          1,
        );

        return reply(body.payload.id);
      }

      case "Script.readPublic": {
        const script = find();

        return script
          ? reply({
              id: script.id,
              name: script.name,
              authorCredit: script.authorCredit,
              characters: [],
            })
          : route.abort();
      }

      default:
        return route.abort();
    }
  });

  return state;
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
  await expect(nav).toContainText("Ready to export");

  // A new blank draft is saved, selected, and named from the keyboard.
  await nav.getByRole("button", { name: "Add Townsfolk" }).click();
  await expect(page.getByRole("heading", { name: "Unnamed Townsfolk" })).toBeVisible();
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  expect(api.characters).toEqual([
    { id: expect.any(String), name: "", ability: "", team: "townsfolk" },
  ]);
  await expect(nav.getByRole("list", { name: "Townsfolk" })).toContainText("2 problems");

  // Script-wide problem navigation leads back to the Character.
  await nav.getByRole("button", { name: "2 problems block export" }).click();
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
  await expect(nav).toContainText("Ready to export");

  // Names must be unique, ignoring case and surrounding spaces.
  await nav.getByRole("button", { name: "Add Demon" }).click();
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
  await nav.getByRole("button", { name: "Add Outsider" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Drunk");
  await page.getByRole("textbox", { name: "Ability" }).fill("You think you are a Townsfolk.");

  await page.getByRole("combobox", { name: "Team" }).selectOption("traveller");
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
  await expect(page.getByRole("combobox", { name: "Team" })).toHaveValue("traveller");
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
  await page.getByRole("button", { name: "Add Minion" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Poisoner");
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText("Poisoner");
  expect(await noHorizontalScroll(page)).toBe(true);
});
