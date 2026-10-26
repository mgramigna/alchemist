import { expect, test, type Page } from "@playwright/test";
import {
  botcDocument,
  reviewImport,
  OwnedScript,
  ScriptId,
  type ImportDraft,
} from "@alchemist/domain";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../packages/domain/test/fixtures/import-script.json", import.meta.url),
  "utf8",
);

const id = ScriptId.make("01k8aj00000000000000000009");

interface ImportSession {
  draft: ImportDraft | null;
  saved: OwnedScript | null;
  failReview: boolean;
  failCommit: boolean;
  commits: number;
  externalRequests: Array<string>;
}

const setupImport = async (page: Page) => {
  const state: ImportSession = {
    draft: null,
    saved: null,
    failReview: false,
    failCommit: false,
    commits: 0,
    externalRequests: [],
  };

  page.on("request", (request) => {
    if (request.url().includes("example.org")) state.externalRequests.push(request.url());
  });
  await page.route(/\/api\/rpc\/?$/, async (route) => {
    const body = route.request().postDataJSON();

    const reply = <A>(value: A) =>
      route.fulfill({
        contentType: "application/x-ndjson",
        body: `{"_tag":"Exit","requestId":${JSON.stringify(body.id)},"exit":{"_tag":"Success","value":${JSON.stringify(value)}}}\n`,
      });

    switch (body.tag) {
      case "Account.current":
        return reply({ id: "alice", displayName: "Alice" });
      case "Script.listOwned":
        return reply(state.saved === null ? [] : [state.saved]);
      case "Script.reviewImport":
        if (state.failReview) return route.abort();

        return reply(reviewImport(body.payload.json, "Alice"));
      case "Script.import": {
        if (state.failCommit) return route.abort();
        const reviewed = reviewImport(body.payload.json, "Alice");

        if (
          reviewed.draft === null ||
          (reviewed.discarded.length && !body.payload.acknowledgeDiscard)
        )
          throw new Error("Rejected preflight was committed");
        state.commits++;
        state.draft = reviewed.draft;
        state.saved = OwnedScript.make({ id, ...reviewed.draft.script, updatedAt: 1 });

        return reply(state.saved);
      }

      case "Script.readOwned":
        return reply(state.saved);
      case "Script.readImported":
        return reply(state.draft?.imported ?? null);
      case "Character.list":
        return reply(state.draft?.characters ?? []);
      case "Jinx.list":
        return reply(state.draft?.jinxes ?? []);
      case "NightOrder.read":
        return reply(state.draft?.nightOrders);
      case "Script.useGenericArtwork": {
        const draft = state.draft;

        if (draft === null) throw new Error("No import");
        state.draft = {
          ...draft,
          imported: {
            ...draft.imported,
            artwork: draft.imported.artwork.filter(
              (art) =>
                art.field !== body.payload.field ||
                (art.characterId ?? null) !== body.payload.characterId,
            ),
          },
        };

        return reply(id);
      }

      case "Script.export": {
        if (state.draft === null) throw new Error("No import");

        return reply({
          filename: "borrowed-moon.json",
          json: JSON.stringify(botcDocument(state.draft, "http://localhost:5173")),
        });
      }

      default:
        throw new Error(`Unexpected RPC ${body.tag}`);
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Import JSON" }).click();

  return state;
};

test("keyboard review, commit, reload and artwork fallback preserve an editable imported Script", async ({
  page,
}) => {
  const state = await setupImport(page);
  await page.getByLabel("Or paste JSON").fill(fixture);
  const review = page.getByRole("button", { name: "Review import" });
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeFocused();
  await expect(page.getByText("Author Credit: Original Designer")).toBeVisible();
  await expect(page.getByText("4 Characters", { exact: true })).toBeVisible();
  await page.getByText("Original JSON", { exact: true }).click();
  await expect(page.getByLabel("Original JSON")).toHaveValue(fixture);
  await page.screenshot({ path: test.info().outputPath("import-review-desktop.png") });
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/scripts/${id}/edit$`));
  await expect(
    page.getByRole("heading", { name: "Imported artwork needs attention" }),
  ).toBeVisible();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toBeVisible();
  expect(state.commits).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "A Borrowed Moon", exact: true })).toBeVisible();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toBeVisible();

  const seerRow = page
    .getByRole("region", { name: "Imported artwork" })
    .getByRole("listitem")
    .filter({ hasText: "Seer · Character icons" });

  await seerRow.getByRole("button", { name: "Use generic icons for Seer" }).click();
  await expect(page.getByText("Seer · Character icons · Pending copy")).toHaveCount(0);
  await expect(page.getByText("Shade · Character icons · Failed reference")).toBeVisible();
  expect(state.externalRequests).toEqual([]);
});

test("preflight rejects malformed JSON and ambiguous references without creating a Script", async ({
  page,
}) => {
  const state = await setupImport(page);
  await page.getByLabel("Or paste JSON").fill("{");
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("heading", { name: "Cannot import yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Script", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back to JSON" }).click();
  await expect(page.getByLabel("Or paste JSON")).toBeFocused();

  const duplicate =
    '[{"id":"a","name":"A","team":"townsfolk","ability":"A"},{"id":"a","name":"B","team":"minion","ability":"B"}]';

  await page.getByLabel("Or paste JSON").fill(duplicate);
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByText(/Duplicate Character ID/).first()).toBeVisible();
  expect(state.commits).toBe(0);
});

test("file review fits mobile, requires keyboard acknowledgement of extras, and permits blocked drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await setupImport(page);
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog?.width).toBeCloseTo(375, 1);
  const json = '[{"id":"custom","name":"","team":"townsfolk","ability":"","bloodstar":true}]';
  await page
    .getByLabel("Choose a JSON file")
    .setInputFiles({ name: "draft.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByLabel("Or paste JSON")).toHaveValue(json);
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("heading", { name: /problems block export/ })).toBeVisible();
  const commit = page.getByRole("button", { name: "Import Script", exact: true });
  await expect(commit).toBeDisabled();
  const acknowledge = page.getByRole("checkbox");
  await acknowledge.focus();
  await page.keyboard.press("Space");
  await expect(commit).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("import-review-mobile.png"),
    fullPage: true,
  });
  await commit.click();
  await expect(page).toHaveURL(new RegExp(`/scripts/${id}/edit$`));
  expect(state.commits).toBe(1);
  expect(state.draft?.characters[0]?.ability).toBe("");
});

test("review and commit failures keep the original input and allow retry", async ({ page }) => {
  const state = await setupImport(page);
  state.failReview = true;
  await page.getByLabel("Or paste JSON").fill(fixture);
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not review");
  await expect(page.getByLabel("Or paste JSON")).toHaveValue(fixture);
  state.failReview = false;
  await page.getByRole("button", { name: "Review import" }).click();
  state.failCommit = true;
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not import");
  state.failCommit = false;
  await page.getByRole("button", { name: "Import Script", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/scripts/${id}/edit$`));
  expect(state.commits).toBe(1);
});

test("Escape cancels and returns keyboard focus to the dashboard trigger", async ({ page }) => {
  const state = await setupImport(page);
  await page.getByLabel("Or paste JSON").fill(fixture);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Import JSON" })).toBeFocused();
  expect(state.commits).toBe(0);
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
