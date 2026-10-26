import { expect, test } from "@playwright/test";
import { box, dense, long, serve, sheet, short } from "./support/sheets.ts";

test("a short Script renders Variant B at Letter and A4, top-aligned, with fonts and footer", async ({
  page,
}) => {
  await serve(page, short());
  const characters = sheet(page, "Character sheet");
  await expect(characters).toContainText("Brimstone & Brine");
  await expect(characters).toContainText("Sample Author");
  await expect(characters).toContainText(
    "Made with Alchemist · Not affiliated with The Pandemonium Institute",
  );
  // Good on the left; Evil on the right.
  const columns = characters.locator('[data-slot="sheet-column"]');
  await expect(columns.nth(0)).toContainText("Townsfolk");
  await expect(columns.nth(0)).not.toContainText("Imp");
  await expect(columns.nth(1)).toContainText("Demons");
  // Regular icons.
  await expect(characters.locator("img").first()).toHaveAttribute(
    "src",
    "/icons/generic/v1/townsfolk-good.svg",
  );
  // Small Scripts stay at the top of the page.

  const offset = await columns
    .nth(0)
    .evaluate(
      (column) =>
        (column.firstElementChild?.getBoundingClientRect().top ?? 0) -
        column.getBoundingClientRect().top,
    );

  expect(offset).toBeLessThan(2);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;

      return ["Cinzel Variable", "Libre Franklin Variable", "Sorts Mill Goudy"].map((family) =>
        document.fonts.check(`16px "${family}"`),
      );
    }),
  ).toEqual([true, true, true]);

  expect(await box(page, "Character sheet")).toEqual({ width: 816, height: 1056 });
  await page.getByRole("button", { name: "A4" }).click();
  expect(await box(page, "Character sheet")).toEqual({ width: 794, height: 1123 });
  await page.screenshot({ path: test.info().outputPath("short-character.png"), fullPage: true });
});

test("the night sheet follows both orders exactly, with Other Nights turned around", async ({
  page,
}) => {
  await serve(page, short());
  await page.getByRole("tab", { name: "First Night" }).click();
  const first = page.getByRole("list", { name: "First Night sheet" });
  // Blank instructions keep the row; entries after Dawn stay after Dawn.
  await expect(first.getByRole("listitem")).toHaveText([
    /^Dusk/,
    /^Minion Info/,
    /^Demon Info/,
    "Chef Show the number.",
    /^Dawn/,
    "Imp No instructions written",
  ]);
  await expect(
    page.getByRole("list", { name: "Other Nights sheet" }).getByRole("listitem"),
  ).toHaveText([/^Dusk/, "Imp No instructions written", /^Dawn/]);

  const turned = (name: string) =>
    page.getByRole("list", { name }).evaluate((list) => {
      const { a, d } = new DOMMatrix(getComputedStyle(list.parentElement ?? list).transform);

      return a === -1 && d === -1;
    });

  expect(await turned("First Night sheet")).toBe(false);
  expect(await turned("Other Nights sheet")).toBe(true);
  await page.screenshot({ path: test.info().outputPath("night-first.png"), fullPage: true });

  // The Other Nights tab turns the whole sheet so that night reads upright.
  await page.getByRole("tab", { name: "Other Nights" }).click();

  const rotated = await sheet(page, "Night sheet").evaluate(
    (node) => getComputedStyle(node.parentElement ?? node).rotate,
  );

  expect(rotated).toBe("180deg");
  expect(await box(page, "Night sheet")).toEqual({ width: 816, height: 1056 });
});

test("a dense Script fits one page; overflowing content is shrunk to the floor and then flagged", async ({
  page,
}) => {
  await serve(page, dense());
  await expect(
    sheet(page, "Character sheet").getByRole("region", { name: "Travellers" }),
  ).toBeVisible();
  await expect(
    sheet(page, "Character sheet").getByRole("region", { name: "Jinxes" }),
  ).toContainText("Only one may act each night.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("dense-character.png"), fullPage: true });
  await page.getByRole("tab", { name: "First Night" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("dense-night.png"), fullPage: true });

  await page.unrouteAll();
  await serve(page, long());
  await expect(page.getByRole("alert")).toContainText("Too much for one page");
  expect(
    await sheet(page, "Character sheet").evaluate((node) =>
      getComputedStyle(node).getPropertyValue("--fit"),
    ),
  ).toBe("0.8");
});

test("sheets are usable with the keyboard on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await serve(page, dense());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const tab = page.getByRole("tab", { name: "Characters" });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "First Night" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // 100% shows the natural page inside a scrolling pane, not the whole document.
  await page.getByRole("button", { name: "100%" }).click();
  expect(await box(page, "Night sheet")).toEqual({ width: 816, height: 1056 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("narrow-night.png"), fullPage: true });
});
