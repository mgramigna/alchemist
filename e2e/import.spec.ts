import { expect, test, type Page } from "@playwright/test";
import { Character, OwnedScript } from "@alchemist/domain";
import { Schema } from "effect";
import { readFileSync } from "node:fs";
import { callRpc, signIn } from "./support/api.ts";

const fixture = readFileSync(
  new URL("../packages/domain/test/fixtures/import-script.json", import.meta.url),
  "utf8",
);

const owned = (page: Page) => callRpc(page, "Script.listOwned", {}, Schema.Array(OwnedScript));

const setupImport = async (page: Page) => {
  await signIn(page, { sub: `import-${crypto.randomUUID()}`, name: "Alice" });
  await page.goto("/");
  await page.getByRole("button", { name: "Import JSON" }).click();
};

const imported = async (page: Page) => {
  await expect(page).toHaveURL(/\/scripts\/[^/]+\/edit$/);
  const scripts = await owned(page);
  expect(scripts).toHaveLength(1);
  const script = scripts[0];

  if (!script) throw new Error("Expected persisted Script");
  expect(new URL(page.url()).pathname).toBe(`/scripts/${script.id}/edit`);

  return script;
};

test("keyboard review, commit, reload and artwork fallback preserve an editable imported Script", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.org")) externalRequests.push(request.url());
  });
  await setupImport(page);
  await page.getByLabel("Or paste JSON").fill(fixture);
  await page.getByRole("button", { name: "Review import" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeFocused();
  await expect(page.getByText("Author Credit: Original Designer")).toBeVisible();
  await expect(page.getByText("4 Characters", { exact: true })).toBeVisible();
  await page.getByText("Original JSON", { exact: true }).click();
  await expect(page.getByLabel("Original JSON")).toHaveValue(fixture);
  await page.screenshot({ path: test.info().outputPath("import-review-desktop.png") });
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  const saved = await imported(page);
  await expect(
    page.getByRole("heading", { name: "Imported artwork needs attention" }),
  ).toBeVisible();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeVisible();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toBeVisible();
  await page
    .getByRole("region", { name: "Imported artwork" })
    .getByRole("listitem")
    .filter({ hasText: "Seer · Character icons" })
    .getByRole("button", { name: "Use generic icons for Seer" })
    .click();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toHaveCount(0);
  await expect(page.getByText("Shade · Character icons · Failed reference")).toBeVisible();

  const exported = await callRpc(
    page,
    "Script.export",
    { id: saved.id },
    Schema.Struct({ filename: Schema.String, json: Schema.String }),
  );

  expect(JSON.parse(exported.json)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "_meta", name: "A Borrowed Moon" }),
      expect.objectContaining({ name: "Seer" }),
    ]),
  );
  expect(externalRequests).toEqual([]);
});

test("preflight rejects malformed JSON and ambiguous references without creating a Script", async ({
  page,
}) => {
  await setupImport(page);
  await page.getByLabel("Or paste JSON").fill("{");
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("heading", { name: "Cannot import yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Script", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back to JSON" }).click();
  await expect(page.getByLabel("Or paste JSON")).toBeFocused();
  await page
    .getByLabel("Or paste JSON")
    .fill(
      '[{"id":"a","name":"A","team":"townsfolk","ability":"A"},{"id":"a","name":"B","team":"minion","ability":"B"}]',
    );
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByText(/Duplicate Character ID/).first()).toBeVisible();
  expect(await owned(page)).toEqual([]);
});

test("file review fits mobile, requires keyboard acknowledgement of extras, and permits blocked drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setupImport(page);
  expect((await page.getByRole("dialog").boundingBox())?.width).toBeCloseTo(375, 1);
  const json = '[{"id":"custom","name":"","team":"townsfolk","ability":"","bloodstar":true}]';
  await page
    .getByLabel("Choose a JSON file")
    .setInputFiles({ name: "draft.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByLabel("Or paste JSON")).toHaveValue(json);
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("heading", { name: /problems block export/ })).toBeVisible();
  const commit = page.getByRole("button", { name: "Import Script", exact: true });
  await expect(commit).toBeDisabled();
  await page.getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(commit).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("import-review-mobile.png"),
    fullPage: true,
  });
  await commit.click();
  const saved = await imported(page);

  const characters = await callRpc(
    page,
    "Character.list",
    { scriptId: saved.id },
    Schema.Array(Character),
  );

  expect(characters[0]?.ability).toBe("");
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/scripts/${saved.id}/edit$`));
});

test("review and commit failures keep the original input and allow retry", async ({ page }) => {
  await setupImport(page);
  let failing: string | null = "Script.reviewImport";
  await page.route(/\/api\/rpc\/?$/, (route) =>
    route.request().postDataJSON().tag === failing ? route.abort() : route.continue(),
  );
  await page.getByLabel("Or paste JSON").fill(fixture);
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t review");
  await expect(page.getByLabel("Or paste JSON")).toHaveValue(fixture);
  failing = null;
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("button", { name: "Import Script", exact: true })).toBeVisible();
  failing = "Script.import";
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t import");
  expect(await owned(page)).toEqual([]);
  failing = null;
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  await imported(page);
});

test("Escape cancels and returns keyboard focus to the dashboard trigger", async ({ page }) => {
  await setupImport(page);
  await page.getByLabel("Or paste JSON").fill(fixture);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Import JSON" })).toBeFocused();
  expect(await owned(page)).toEqual([]);
});

for (const width of [375, 1280]) {
  test(`dark theme and long JSON remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await setupImport(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const json = page.getByLabel("Or paste JSON");
    await json.fill(JSON.stringify(JSON.parse(fixture), null, 2));
    await expect(json).toHaveCSS("font-family", /monospace/);
    await expect(page.getByText("Or paste JSON", { exact: true })).toHaveCSS(
      "font-family",
      /Libre Franklin/,
    );
    expect((await json.boundingBox())?.height).toBeLessThanOrEqual(289);
    const close = page.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`import-input-dark-${width}.png`) });
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeFocused();
    await page.getByText("Original JSON", { exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`import-review-dark-${width}.png`) });
    await page.getByRole("button", { name: "Back to JSON" }).click();
    await expect(json).toBeFocused();
    await expect(close).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
