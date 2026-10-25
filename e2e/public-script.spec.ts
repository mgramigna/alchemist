import { expect, test } from "@playwright/test";

const path = "/scripts/01k8ac00000000000000000001";

test("public persisted Script opens directly, refreshes, and fits a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
  await expect(page.getByText("By The Clocktower Collective")).toBeVisible();
  await expect(page.getByText("This Script has no Characters yet.")).toBeVisible();
  await expect(page.getByText("Fixture Owner")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
});

test("unknown and malformed Script links explain that the Script was not found", async ({
  page,
}) => {
  for (const id of ["00000000000000000000000000", "invalid"]) {
    await page.goto(`/scripts/${id}`);
    await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
    await expect(page.getByText(/Ask the Script Owner/)).toBeVisible();
  }
});

test("loading is announced while the public read is pending", async ({ page }) => {
  let release = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(/\/api\/public\/rpc\/?$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(path);
  await expect(page.getByRole("status")).toContainText("Loading Script");
  release();
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
});

test("a transport failure offers a keyboard-accessible retry that recovers", async ({ page }) => {
  await page.route(/\/api\/public\/rpc\/?$/, (route) => route.abort());
  await page.goto(path);
  await expect(page.getByRole("alert")).toContainText("We couldn’t load this Script");
  await page.unroute(/\/api\/public\/rpc\/?$/);
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
});

test("typed home navigation and browser Back restore the public Script without a document reload", async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.navigationMarker = "same-document";
  });
  await page.getByRole("link", { name: "Alchemist home" }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Every story starts with a little alchemy." }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.navigationMarker)).toBe(
    "same-document",
  );
  await page.goBack();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole("heading", { name: "The Midnight Alchemist" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.navigationMarker)).toBe(
    "same-document",
  );
});

test("the Script not-found boundary can navigate home and return through history", async ({
  page,
}) => {
  await page.goto("/scripts/00000000000000000000000000");
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(
    page.getByRole("heading", { name: "Every story starts with a little alchemy." }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
});
