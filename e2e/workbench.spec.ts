import {
  Character as DomainCharacter,
  NightOrders as DomainNightOrders,
  Jinx as DomainJinx,
  OwnedScript,
} from "@alchemist/domain";
import { Schema } from "effect";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { callRpc, signIn } from "./support/api.ts";

const rpc = /\/api\/rpc\/?$/;

const scriptId = (page: Page) => {
  const id = new URL(page.url()).pathname.split("/")[2];

  if (!id) throw new Error("Expected a Script URL");

  return id;
};

const readCharacters = (page: Page) =>
  callRpc(page, "Character.list", { scriptId: scriptId(page) }, Schema.Array(DomainCharacter));

const readNights = (page: Page) =>
  callRpc(page, "NightOrder.read", { scriptId: scriptId(page) }, DomainNightOrders);

const readJinxes = (page: Page) =>
  callRpc(page, "Jinx.list", { scriptId: scriptId(page) }, Schema.Array(DomainJinx));

const readScript = (page: Page) =>
  callRpc(page, "Script.readOwned", { id: scriptId(page) }, OwnedScript);

// Only transport failures are intercepted. Every successful request reaches the server.
const failRpc = async (page: Page, tags: readonly string[]) => {
  const handler = async (route: import("@playwright/test").Route) => {
    if (tags.includes(route.request().postDataJSON().tag)) await route.abort();
    else await route.continue();
  };

  await page.route(rpc, handler);

  return () => page.unroute(rpc, handler);
};

const seedScript = async (page: Page, count: number) => {
  const script = await callRpc(page, "Script.create", {}, OwnedScript);
  await callRpc(
    page,
    "Script.updateDetails",
    {
      id: script.id,
      name: "Saved Script",
      authorCredit: "Ada",
      logoCredit: "",
      backgroundCredit: "",
    },
    OwnedScript,
  );

  for (let i = 1; i <= count; i++) {
    const character = await callRpc(
      page,
      "Character.create",
      {
        scriptId: script.id,
        team: i === 4 ? "traveller" : "townsfolk",
        nights: [],
      },
      DomainCharacter,
    );

    await callRpc(
      page,
      "Character.update",
      {
        ...character,
        scriptId: script.id,
        name: count === 1 ? "Chef" : `Character ${i}`,
        ability: `Ability ${i}`,
        reminders: ["Same", "Same"],
        remindersGlobal: ["Global"],
        setup: true,
        flavor: "Flavor",
        artworkCredit: "",
        firstNightInstructions: "First",
        otherNightInstructions: "Other",
      },
      DomainCharacter,
    );
  }

  return script.id;
};

type NightChoice =
  | "First Night and Other Nights"
  | "First Night only"
  | "Other Nights only"
  | "No night action";

// Creation asks which nights the new Character acts on.
const addCharacter = async (page: Page, team: string, nights: NightChoice = "No night action") => {
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: `Add ${team}` })
    .click();
  // Scope to this menu: the previous one may still be closing.
  await page
    .getByRole("menu", { name: `Add ${team}` })
    .getByRole("menuitem", { name: nights })
    .click();
  await expect(page.getByRole("heading", { name: `Unnamed ${team}`, exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
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
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await expect(page.getByText("No Scripts yet")).toBeVisible();
  await page.getByRole("button", { name: "New Script" }).click();

  await expect(page).toHaveURL(/\/scripts\/[^/]+\/edit$/);
  const id = scriptId(page);
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
  await expect(preview).toContainText("The Clocktower Collective");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(await readScript(page)).toMatchObject({
    name: "Night of Mirrors",
    authorCredit: "The Clocktower Collective",
  });

  await page.reload();
  await expect(name).toHaveValue("Night of Mirrors");
  await expect(credit).toHaveValue("The Clocktower Collective");

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Share link copied")).toBeVisible();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(shareUrl).pathname).toBe(`/scripts/${id}`);
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
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const name = page.getByRole("textbox", { name: "Script name" });
  await expect(name).toHaveValue("Untitled Script");

  const restoreNetwork = await failRpc(page, ["Script.updateDetails"]);
  await name.fill("Unsaved draft");
  await expect(page.getByRole("status")).toContainText("Couldn’t save your changes");
  await expect(name).toHaveValue("Unsaved draft");
  expect(await readScript(page)).toMatchObject({ name: "Untitled Script" });

  await page.getByRole("link", { name: "Your Scripts" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave with unsaved changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(name).toHaveValue("Unsaved draft");

  await restoreNetwork();
  const retry = page.getByRole("button", { name: "Retry save" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(await readScript(page)).toMatchObject({ name: "Unsaved draft" });

  await page.getByRole("link", { name: "Your Scripts" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("list", { name: "Your Scripts" })).toContainText("Unsaved draft");
});

test("the Workbench stacks its panes on a narrow screen and is operable with the keyboard", async ({
  page,
}) => {
  await signIn(page, { name: "Ada Lovelace" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const name = page.getByRole("textbox", { name: "Script name" });
  await expect(name).toHaveValue("Untitled Script");
  await expect(page.getByRole("textbox", { name: "Author Credit" })).toHaveValue("Ada Lovelace");
  await expect(page.getByRole("navigation", { name: "Script sections" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);

  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await name.focus();
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Author Credit" })).toBeFocused();
  // Tabbing into a field selects its text; append rather than replace.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("textbox", { name: "Author Credit" })).toBeFocused();
  await page.keyboard.type(" & friends");
  await expect(page.getByRole("textbox", { name: "Author Credit" })).toHaveValue(
    "Ada Lovelace & friends",
  );
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText(
    "Ada Lovelace & friends",
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

  await signIn(page);
  await page.goto("/scripts/invalid/edit");
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
});

test("opening a Script announces loading and offers a retry after a transport failure", async ({
  page,
}) => {
  await signIn(page);
  const id = await seedScript(page, 0);
  let release = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().postDataJSON().tag === "Script.readOwned") {
      await gate;
      await route.abort();
    } else await route.continue();
  };

  await page.route(rpc, handler);
  await page.goto(`/scripts/${id}/edit`);
  await expect(page.getByRole("status")).toContainText("Opening Script");
  release();
  await expect(page.getByRole("alert")).toContainText("We couldn’t open this Script");
  await page.unroute(rpc, handler);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Script name" })).toHaveValue("Saved Script");
});

test("an owner adds Characters by Team and finds and fixes what blocks export", async ({
  page,
}) => {
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const nav = page.getByRole("navigation", { name: "Script sections" });
  await expect(nav.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();

  // A new blank draft is saved, selected, and named from the keyboard.
  await addCharacter(page, "Townsfolk");
  await expect(page.getByRole("heading", { name: "Unnamed Townsfolk" })).toBeVisible();
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  expect(await readCharacters(page)).toEqual([
    {
      id: expect.any(String),
      name: "",
      ability: "",
      team: "townsfolk",
      reminders: [],
      remindersGlobal: [],
      setup: false,
      flavor: "",
      artworkCredit: "",
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
  expect((await readCharacters(page))[0]?.name).toBe("N".repeat(31));

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
  await expect(preview.getByRole("button", { name: /Washerwoman/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Keyboard selection from the sheet moves the highlight too.
  await preview.getByRole("button", { name: /Imp/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Imp" })).toBeVisible();
  await expect(preview.getByRole("button", { name: /Imp/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(preview.getByRole("button", { name: /Washerwoman/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect((await readCharacters(page)).map(({ name: saved }) => saved)).toEqual([
    "Washerwoman",
    "Imp",
  ]);
});

test("a Team change keeps the Character's content and survives reload; deleting returns to the Script", async ({
  page,
}) => {
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  const nav = page.getByRole("navigation", { name: "Script sections" });
  await addCharacter(page, "Outsider");
  await page.getByRole("textbox", { name: "Name" }).fill("Drunk");
  await page.getByRole("textbox", { name: "Ability" }).fill("You think you are a Townsfolk.");

  await expect(page.getByRole("status")).toContainText("All changes saved");
  await expect.poll(async () => (await readCharacters(page))[0]?.name).toBe("Drunk");
  await page.getByRole("combobox", { name: "Team" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.getByRole("option", { name: "Traveller", exact: true })).toBeFocused();
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
  const [saved] = await readCharacters(page);

  await page.reload();
  await nav.getByRole("button", { name: "Drunk" }).click();
  await expect(page.getByRole("combobox", { name: "Team" })).toContainText("Traveller");
  await expect(page.getByRole("textbox", { name: "Ability" })).toHaveValue(
    "You think you are a Townsfolk.",
  );
  expect(await readCharacters(page)).toEqual([saved]);

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
  expect(await readCharacters(page)).toEqual([]);
});

test("Character editing is usable on a narrow screen", async ({ page }) => {
  await signIn(page, { name: "Ada Lovelace" });
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
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk", "First Night and Other Nights");
  await page.getByRole("textbox", { name: "Name" }).fill("Chef");
  const [chef] = await readCharacters(page);
  expect(await readNights(page)).toEqual({
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

  await expect(page.getByRole("status")).toContainText("All changes saved");
  await expect.poll(async () => (await readCharacters(page))[0]?.name).toBe("Chef");

  // Leaving a night keeps its instructions.
  await nights.getByRole("checkbox", { name: "Acts on Other Nights" }).click();
  await expect(nights).not.toContainText("#2 of 3");
  await expect(nights.getByRole("textbox", { name: "Other Nights instructions" })).toHaveValue(
    "Kept for later.",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect((await readNights(page)).otherNight).toEqual(["dusk", "dawn"]);
  expect((await readCharacters(page))[0]?.otherNightInstructions).toBe("Kept for later.");

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
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk", "First Night only");
  await page.getByRole("textbox", { name: "Name" }).fill("Chef");
  await addCharacter(page, "Demon");
  await page.getByRole("textbox", { name: "Name" }).fill("Imp");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const [chef, imp] = await readCharacters(page);

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
    "Chef No instructions written",
  );
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect((await readNights(page)).firstNight).toEqual(expected);
  expect((await readNights(page)).otherNight).toEqual(["dusk", "dawn"]);

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
  expect((await readNights(page)).firstNight).toEqual([
    "minioninfo",
    "dusk",
    "demoninfo",
    chef?.id,
    "dawn",
  ]);
});

test("night reordering is usable on a narrow screen", async ({ page }) => {
  await signIn(page, { name: "Ada Lovelace" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Minion", "Other Nights only");
  await page.getByRole("textbox", { name: "Name" }).fill("Poisoner");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await expect.poll(async () => (await readCharacters(page))[0]?.name).toBe("Poisoner");
  await page.getByRole("button", { name: "Reorder Other Nights" }).click();
  const order = page.getByRole("list", { name: "Other Nights order" });
  await page.getByRole("button", { name: "Move Poisoner up" }).click();
  await expect(order.getByRole("listitem").first()).toContainText("Poisoner");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("Jinxes share invalid drafts and corrections between endpoints, survive reload, and can be deleted from either end", async ({
  page,
}) => {
  await signIn(page, { name: "Ada Lovelace" });
  await page.goto("/");
  await page.getByRole("button", { name: "New Script" }).click();
  await addCharacter(page, "Townsfolk");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Chef");
  await page.getByRole("textbox", { name: "Ability", exact: true }).fill("Learn a number.");
  await addCharacter(page, "Demon");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Imp");
  await page.getByRole("textbox", { name: "Ability", exact: true }).fill("Choose a player.");
  const jinxes = page.getByRole("region", { name: "Jinxes", exact: true }).first();
  const restoreNetwork = await failRpc(page, ["Jinx.create", "Jinx.update", "Jinx.delete"]);
  await jinxes.getByRole("button", { name: "Add Jinx" }).click();
  await page.getByRole("menuitem", { name: "Chef" }).click();
  await expect(jinxes.getByRole("alert")).toContainText("Couldn’t add the Jinx.");
  expect(await readJinxes(page)).toEqual([]);
  await restoreNetwork();
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
  expect(await readJinxes(page)).toHaveLength(1);
  expect((await readJinxes(page))[0]?.explanation).toBe("x".repeat(501));
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

  const restoreNetwork2 = await failRpc(page, ["Jinx.create", "Jinx.update", "Jinx.delete"]);
  await explanation.fill("Unsaved Jinx draft");
  await expect(page.getByRole("status")).toContainText("Couldn’t save your changes");
  await page.getByRole("link", { name: "Your Scripts" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stay" }).click();
  await nav.getByRole("button", { name: "Chef", exact: true }).click();
  await expect(explanation).toHaveValue("Unsaved Jinx draft");
  expect(await readJinxes(page)).toEqual([
    expect.objectContaining({ explanation: "The Chef learns about the Imp." }),
  ]);
  await restoreNetwork2();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const restoreNetwork3 = await failRpc(page, ["Jinx.create", "Jinx.update", "Jinx.delete"]);
  await jinxes.getByRole("button", { name: /Delete Jinx between/ }).click();
  await expect(jinxes).toContainText("Couldn’t delete the Jinx. Try again.");
  await expect(explanation).toHaveValue("Unsaved Jinx draft");
  expect(await readJinxes(page)).toEqual([
    expect.objectContaining({ explanation: "Unsaved Jinx draft" }),
  ]);
  await restoreNetwork3();
  await jinxes.getByRole("button", { name: /Delete Jinx between/ }).focus();
  await page.keyboard.press("Enter");
  await expect(explanation).toHaveCount(0);
  expect(await readJinxes(page)).toEqual([]);
  await page.reload();
  await expect(preview.getByRole("region", { name: "Jinxes" })).toHaveCount(0);
});

test("Jinx creation, editing, and preview fit a narrow screen", async ({ page }) => {
  await signIn(page, { name: "Ada Lovelace" });
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
  await signIn(page, { name: "Ada Lovelace" });
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
  expect((await readCharacters(page))[0]).toMatchObject({
    reminders: ["x".repeat(31), "Dead"],
    remindersGlobal: ["x".repeat(26)],
    setup: true,
    flavor: "x".repeat(501),
    artworkCredit: "",
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
  const restoreNetwork = await failRpc(page, ["Character.update"]);
  await ordinary
    .getByRole("textbox", { name: "Token 1", exact: true })
    .fill("Retained after failure");
  await expect(page.getByRole("status")).toContainText("Couldn’t save");
  await expect(ordinary.getByRole("textbox", { name: "Token 1", exact: true })).toHaveValue(
    "Retained after failure",
  );
  await restoreNetwork();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect((await readCharacters(page))[0]?.reminders).toEqual(["Retained after failure", "Dead"]);
});

test("Reminder Token count errors remain editable on a narrow screen", async ({ page }) => {
  await signIn(page, { name: "Ada Lovelace" });
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

test("JSON export requires saved edits and copies, downloads or links the saved Script on a narrow screen", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let exportRequests = 0;
  page.on("request", (request) => {
    if (rpc.test(request.url()) && request.postDataJSON()?.tag === "Script.export")
      exportRequests++;
  });
  await signIn(page, { name: "Ada Lovelace" });
  const id = await seedScript(page, 4);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/scripts/${id}/edit`);
  await expect(page.getByText("Ready to export")).toBeVisible();
  const name = page.getByRole("textbox", { name: "Script name" });
  await name.fill("Just edited");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("menuitem", { name: "Copy JSON", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Wait for all changes to save");
  expect(exportRequests).toBe(0);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const restoreNetwork = await failRpc(page, ["Script.updateDetails"]);
  await name.fill("Retained after failure");
  await expect(page.getByRole("status")).toContainText("Couldn’t save");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("menuitem", { name: "Download JSON" }).click();
  expect(exportRequests).toBe(0);
  await restoreNetwork();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.getByRole("button", { name: "Export JSON" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem")).toHaveText([
    "Copy JSON link",
    "Copy JSON",
    "Download JSON",
  ]);
  await expect(page.getByRole("menuitem", { name: "Copy JSON link" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Copy JSON", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("JSON copied to clipboard", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(exportRequests).toBe(1);

  // Clipboard failures leave downloading available as an alternative.
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new DOMException("Clipboard denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("menuitem", { name: "Copy JSON", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t copy the JSON");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("menuitem", { name: "Download JSON" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const path = await file.path();

  if (path === null) throw new Error("Download did not produce a file");
  const json = await readFile(path, "utf8");
  expect(json).toBe(copied);

  // The JSON link needs no request of its own and serves the same saved JSON anonymously.
  // Removing the failing override restores the browser's clipboard.
  await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, "writeText"));
  const requestsBeforeLink = exportRequests;
  await page.getByRole("button", { name: "Export JSON" }).click();
  await page.getByRole("menuitem", { name: "Copy JSON link" }).click();
  await expect(page.getByText("JSON link copied")).toBeVisible();
  const jsonLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(jsonLink).pathname).toBe(`/scripts/${id}/json`);
  expect(exportRequests).toBe(requestsBeforeLink);
  const served = await request.get(jsonLink);
  expect(served.headers()["content-type"]).toBe("application/json; charset=utf-8");
  expect(await served.text()).toBe(json);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const document = JSON.parse(json);
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
  expect(exportRequests).toBe(3);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("an owner downloads sheet PNGs of the live draft from the preview", async ({ page }) => {
  let exportRequests = 0;
  page.on("request", (request) => {
    if (rpc.test(request.url()) && request.postDataJSON()?.tag === "Script.export")
      exportRequests++;
  });
  await signIn(page, { name: "Ada Lovelace" });
  const id = await seedScript(page, 1);
  await page.goto(`/scripts/${id}/edit`);
  await page.getByRole("textbox", { name: "Script name" }).fill("Draft Name");
  await expect(page.getByRole("region", { name: "Character sheet" })).toContainText("Draft Name");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  await page.getByRole("menuitem", { name: "Character sheet" }).click();
  expect((await downloaded).suggestedFilename()).toBe("Draft-Name-character.png");
  await expect(page.getByText("Downloaded Draft-Name-character.png.")).toBeVisible();
  // PNGs come from the browser alone: no export or render request.
  expect(exportRequests).toBe(0);
});

test("export blockers and counters use Unicode code points", async ({ page }) => {
  await signIn(page, { name: "Ada Lovelace" });
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
  expect((await readCharacters(page))[0]?.name).toBe("😀".repeat(30));
  expect((await readCharacters(page))[0]?.ability).toBe("😀".repeat(250));
  await expect(page.getByRole("button", { name: "1 problem blocks export" })).toBeVisible();
  await reminders.getByRole("textbox", { name: "Token 1", exact: true }).fill("😀".repeat(31));
  await expect(reminders.getByText("31/30 characters", { exact: true })).toBeVisible();
  await expect(reminders.getByText("Use 30 characters or fewer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "2 problems block export" })).toBeVisible();
});
