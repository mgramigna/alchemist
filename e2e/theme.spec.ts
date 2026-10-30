import { expect, test, type Page } from "@playwright/test";

const html = (page: Page) => page.locator("html");

const saved = (page: Page) => page.evaluate(() => localStorage.getItem("alchemist-theme"));

test("follows the system scheme until the visitor overrides it, then remembers the override", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html(page)).toHaveClass(/\bdark\b/);

  // With no override, a system change is followed immediately.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  // The toggle only offers the opposite scheme.
  await expect(page.getByRole("button", { name: "Use light theme" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  expect(await saved(page)).toBe("dark");

  // The override outlasts system changes and reloads.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
});

test("choosing the system's scheme clears the override so later system changes apply", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  expect(await saved(page)).toBeNull();

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveClass(/\bdark\b/);
});

test("a saved override is applied before the app renders", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("alchemist-theme", "dark");
    // Record the scheme the moment the app's root element is parsed, before any module runs.
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive")
        document.documentElement.dataset.firstPaint = document.documentElement.className;
    });
  });
  await page.goto("/");
  await expect(html(page)).toHaveAttribute("data-first-paint", /\bdark\b/);
});
