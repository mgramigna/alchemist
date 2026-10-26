import { expect, test, type Page } from "@playwright/test";

const accountRpc = /\/api\/rpc\/?$/;

// Controlled wire response for browser states; persistence/authorization are covered by real D1 tests.
const fulfillUser = (displayName: string, requestId: string) =>
  `{"_tag":"Exit","requestId":${JSON.stringify(requestId)},"exit":{"_tag":"Success","value":${JSON.stringify({ id: "user", displayName })}}}\n`;

const signInLink = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: "Sign in with Google" });

test("anonymous home offers keyboard-accessible Google sign-in and fits a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const signIn = signInLink(page);
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/auth/google");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in with Google" }),
  ).toBeVisible();
  await signIn.focus();
  await expect(signIn).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("anonymous account page asks the visitor to sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByText("You’re signed out")).toBeVisible();
  await expect(signInLink(page)).toHaveAttribute("href", "/auth/google");
});

test("signed-in header menu opens account settings with the keyboard", async ({ page }) => {
  await page.route(accountRpc, async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: fulfillUser("Ada Lovelace", body.id),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back, Ada Lovelace" })).toBeVisible();
  const menu = page.getByRole("button", { name: "Account menu for Ada Lovelace" });
  await expect(menu).toContainText("AL");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Ada Lovelace");
});

test("profile edit validates, retains failed input, retries with the keyboard, and signs out", async ({
  page,
}) => {
  let name = "Google name";
  let fail = true;
  await page.route(accountRpc, async (route) => {
    const body = route.request().postDataJSON();

    if (body.tag === "Account.rename") {
      if (fail) {
        await route.abort();

        return;
      }

      name = body.payload.displayName;
    }

    await route.fulfill({ contentType: "application/x-ndjson", body: fulfillUser(name, body.id) });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/account");
  const input = page.getByRole("textbox", { name: "Display name" });
  const save = page.getByRole("button", { name: "Save display name" });
  await expect(input).toHaveValue("Google name");
  await expect(save).toBeDisabled();
  await input.fill("  ");
  await expect(save).toBeDisabled();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("Chosen name");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t save your name");
  await expect(input).toHaveValue("Chosen name");
  fail = false;
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Display name saved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu for Chosen name" })).toBeVisible();
  await expect(save).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.unroute(accountRpc);
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(signInLink(page)).toBeVisible();
});

test("account loading and failure states announce progress and allow retry", async ({ page }) => {
  let release = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(accountRpc, async (route) => {
    await gate;
    await route.abort();
  });
  await page.goto("/account");
  await expect(page.getByRole("status")).toContainText("Checking your session");
  release();
  await expect(page.getByRole("alert")).toContainText("Couldn’t load your account");
  await expect(page.getByRole("button", { name: "Retry sign-in check" })).toBeVisible();
  await page.unroute(accountRpc);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(signInLink(page)).toBeVisible();
});
