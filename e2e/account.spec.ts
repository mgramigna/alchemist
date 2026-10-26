import { expect, test } from "@playwright/test";

test("anonymous home offers keyboard-accessible Google sign-in and fits a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const signIn = page.getByRole("link", { name: "Sign in with Google" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/auth/google");
  await signIn.focus();
  await expect(signIn).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("profile edit validates, retains failed input, retries with the keyboard, and signs out", async ({
  page,
}) => {
  let name = "Google name";
  let fail = true;
  await page.route(/\/api\/account\/rpc\/?$/, async (route) => {
    const body = route.request().postDataJSON();

    if (body.tag === "Account.rename") {
      if (fail) {
        await route.abort();

        return;
      }

      name = body.payload.displayName;
    }

    // Controlled wire response for browser states; persistence/authorization are covered by real D1 tests.
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: `{"_tag":"Exit","requestId":${JSON.stringify(body.id)},"exit":{"_tag":"Success","value":${JSON.stringify({ id: "user", displayName: name })}}}\n`,
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Display name" });
  const save = page.getByRole("button", { name: "Save display name" });
  await expect(input).toHaveValue("Google name");
  await input.fill("  ");
  await expect(save).toBeDisabled();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("Chosen name");
  await save.click();
  await expect(page.getByRole("status")).toContainText("Could not save your name");
  await expect(input).toHaveValue("Chosen name");
  fail = false;
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Display name saved");
  await expect(page.getByText("Signed in as Chosen name")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.unroute(/\/api\/account\/rpc\/?$/);
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
});

test("account loading and failure states announce progress and allow retry", async ({ page }) => {
  let release = () => {};

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(/\/api\/account\/rpc\/?$/, async (route) => {
    await gate;
    await route.abort();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Checking your session");
  release();
  await expect(page.getByRole("alert")).toContainText("Could not load your account");
  await page.unroute(/\/api\/account\/rpc\/?$/);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
});
