import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { long, serve, sheet, short } from "./support/sheets.ts";

const fonts = "**/*.woff*";
const demonIcons = "**/icons/generic/v1/demon-*.svg";

// WebKit takes several seconds per sheet.
const CAPTURED = { timeout: 30_000 };

// Longer than capture's resource timeout, so only giving up can finish the download.
const HANG_MS = 60_000;

const choose = async (page: Page, label: "Character sheet" | "Night sheet" | "Both sheets") => {
  await page.getByRole("button", { name: "Download PNG" }).click();
  await page.getByRole("menuitem", { name: label }).click();
};

/** Collects every download the page starts. */
const downloads = (page: Page) => {
  const files: Array<Download> = [];
  page.on("download", (file) => files.push(file));

  return files;
};

const png = async (file: Download | undefined) => {
  if (file === undefined) throw new Error("Expected a download");

  const path = await file.path();
  const bytes = await readFile(path);

  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");

  return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const delay = (page: Page, pattern: string, ms: number) =>
  page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => undefined);
  });

/**
 * Mean per-channel difference between a capture, scaled to the page's CSS
 * size, and a screenshot of the visible preview at 100%.
 */
const differenceFromPreview = async (page: Page, capture: Buffer, name: "Character sheet") => {
  await page.getByRole("button", { name: "100%" }).click();
  await page.setViewportSize({ width: 1400, height: 1600 });
  const preview = await sheet(page, name).screenshot();

  return page.evaluate(
    async ({ capture: a, preview: b }) => {
      const pixels = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = new OffscreenCanvas(816, 1056);
        const context = canvas.getContext("2d");

        if (context === null) throw new Error("No 2D context");

        context.drawImage(image, 0, 0, 816, 1056);

        return context.getImageData(0, 0, 816, 1056).data;
      };

      const [x, y] = await Promise.all([pixels(a), pixels(b)]);
      let total = 0;

      for (let i = 0; i < x.length; i++) total += Math.abs((x[i] ?? 0) - (y[i] ?? 0));

      return total / x.length;
    },
    { capture: capture.toString("base64"), preview: preview.toString("base64") },
  );
};

test("both sheets download as named 300 DPI PNGs at Letter by default, then at A4", async ({
  page,
}) => {
  const files = downloads(page);
  await serve(page, short());
  // The menu is keyboard operable and names the paper and resolution.
  await page.getByRole("button", { name: "Download PNG" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toContainText("US Letter · 300 DPI");
  await page.getByRole("menuitem", { name: "Both sheets" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "Downloaded Brimstone-Brine-character.png.Downloaded Brimstone-Brine-night.png.",
    CAPTURED,
  );
  expect(files.map((file) => file.suggestedFilename())).toEqual([
    "Brimstone-Brine-character.png",
    "Brimstone-Brine-night.png",
  ]);

  for (const file of files) expect(await png(file)).toMatchObject({ width: 2550, height: 3300 });

  await page.getByRole("button", { name: "A4" }).click();
  await choose(page, "Night sheet");
  await expect.poll(() => files.length, CAPTURED).toBe(3);
  expect(files[2]?.suggestedFilename()).toBe("Brimstone-Brine-night.png");
  expect(await png(files[2])).toMatchObject({ width: 2481, height: 3509 });
  // Offscreen copies are removed once capture finishes.
  await expect(page.locator('[data-slot="sheet"]')).toHaveCount(1);
});

test("capture waits for delayed fonts and icons and matches the preview", async ({ page }) => {
  await delay(page, fonts, 1500);
  await delay(page, "**/icons/generic/v1/*.svg", 1500);
  const files = downloads(page);
  await serve(page, short());
  // Start before the delayed resources arrive.
  await choose(page, "Character sheet");
  await expect(page.getByRole("status").filter({ hasText: "sheet" }).first()).toContainText(
    /(Loading sheet fonts|Preparing|Capturing|Finishing) /,
  );
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "Downloaded Brimstone-Brine-character.png.",
    CAPTURED,
  );
  await expect(page.getByText("didn’t load")).toHaveCount(0);
  const { bytes } = await png(files[0]);

  const difference = await differenceFromPreview(page, bytes, "Character sheet");
  expect(difference).toBeLessThan(6);
});

test("an icon that fails to load shows its fallback token and warns without blocking", async ({
  page,
}) => {
  await page.route(demonIcons, (route) => route.abort());
  const files = downloads(page);
  await serve(page, short());
  // The preview shows the same fallback the PNG gets.
  await expect(sheet(page, "Character sheet").locator("img[data-fallback-shown]")).toHaveCount(1);
  await choose(page, "Both sheets");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "Downloaded Brimstone-Brine-character.png. 1 icon didn’t load, so it shows a plain Team token instead.",
    CAPTURED,
  );
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "Downloaded Brimstone-Brine-night.png. 2 icons didn’t load, so they show",
    CAPTURED,
  );
  expect(files).toHaveLength(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an icon that never answers falls back after the timeout instead of hanging", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await delay(page, demonIcons, HANG_MS);
  const files = downloads(page);
  await serve(page, short());
  await choose(page, "Character sheet");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "1 icon didn’t load",
    { timeout: 45_000 },
  );
  expect(files.map((file) => file.suggestedFilename())).toEqual(["Brimstone-Brine-character.png"]);
});

test("failed sheet fonts block every PNG until a retry succeeds", async ({ page }) => {
  await page.route(fonts, (route) => route.abort());
  const files = downloads(page);
  await serve(page, short());
  await choose(page, "Both sheets");
  await expect(page.getByRole("alert")).toContainText(
    "Sheet fonts didn’t load, so the PNGs wouldn’t match the preview.",
  );
  expect(files).toHaveLength(0);
  await page.unroute(fonts);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toContainText(
    "Downloaded Brimstone-Brine-character.png.Downloaded Brimstone-Brine-night.png.",
    CAPTURED,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(files).toHaveLength(2);
});

test("fonts that never load block with a retry instead of hanging", async ({ page }) => {
  test.setTimeout(90_000);
  await delay(page, fonts, HANG_MS);
  const files = downloads(page);
  await serve(page, short());
  await choose(page, "Night sheet");
  await expect(page.getByRole("alert")).toContainText("Sheet fonts didn’t load", {
    timeout: 45_000,
  });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(files).toHaveLength(0);
});

test("an overflowing sheet is blocked on its own while the other downloads", async ({ page }) => {
  const files = downloads(page);
  await serve(page, long());
  await choose(page, "Both sheets");
  await expect(
    page.getByRole("alert").filter({ hasText: "The Character sheet is too much for one page" }),
  ).toContainText("Shorten text or remove entries, then download it again.");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toHaveText(
    "Downloaded Brimstone-Brine-night.png.",
    CAPTURED,
  );
  expect(files.map((file) => file.suggestedFilename())).toEqual(["Brimstone-Brine-night.png"]);
  // Nothing to retry: only the content can fix it.
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("downloading works on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const files = downloads(page);
  await serve(page, short());
  await choose(page, "Character sheet");
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible(CAPTURED);
  expect(files).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath("narrow-download.png"), fullPage: true });
});
