import { expect, test, type Page } from "@playwright/test";
import { OwnedScript, ScriptId } from "@alchemist/domain";
import { callRpc, signIn } from "./support/api.ts";
import { sampleFile, seedScript } from "./support/artwork.ts";
import { character, dense, long, serve, sheetScript, short } from "./support/sheets.ts";

const entry = (page: Page) => page.getByRole("button", { name: "Theater Mode" });
const theater = (page: Page) => page.getByRole("dialog", { name: /^Theater Mode/ });
const poster = (page: Page) => page.locator('[data-slot="poster"]');
const teams = (page: Page) => page.locator('[data-slot="poster-teams"]');
const ribbon = (page: Page) => page.locator('[data-slot="poster-ribbon"]');
const exit = (page: Page) => page.getByRole("button", { name: "Exit" });

const fit = (page: Page) =>
  poster(page).evaluate((node) => Number(node.style.getPropertyValue("--fit")));

const isFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

const nothingClipped = (page: Page) =>
  teams(page).evaluate(
    (node) =>
      node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
  );

test("entering shows only the Script fullscreen, and Exit restores the page and focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await serve(page, dense());
  const path = new URL(page.url()).pathname;
  await entry(page).click();
  await expect(theater(page)).toBeVisible();
  await expect(poster(page)).toContainText("Brimstone & Brine");
  await expect(poster(page)).toContainText("Townsfolk 13");
  await expect(poster(page)).toContainText("Only one may act each night.");
  await expect(page).toHaveURL(`${path}?theater=true`);
  await expect.poll(() => isFullscreen(page)).toBe(true);

  const box = await theater(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box).toEqual({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
  // The dialog is modal: the page behind it leaves the accessibility tree.
  await expect(page.getByRole("link", { name: "Alchemist home" })).toHaveCount(0);

  await exit(page).click();
  await expect(theater(page)).toHaveCount(0);
  await expect(page).toHaveURL(path);
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(entry(page)).toBeFocused();
});

test("Back closes Theater Mode without leaving the Script, and leaves fullscreen", async ({
  page,
}) => {
  await serve(page, short());
  const path = new URL(page.url()).pathname;
  await entry(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.goBack();
  await expect(theater(page)).toHaveCount(0);
  await expect(page).toHaveURL(path);
  await expect.poll(() => isFullscreen(page)).toBe(false);
  await expect(page.getByRole("heading", { name: "Brimstone & Brine" })).toBeVisible();
  // Forward reopens it, and Exit still works after that round trip.
  await page.goForward();
  await expect(theater(page)).toBeVisible();
  await exit(page).click();
  await expect(theater(page)).toHaveCount(0);
  await expect(page).toHaveURL(path);
});

test("leaving fullscreen through the browser also leaves Theater Mode", async ({ page }) => {
  await serve(page, short());
  await entry(page).click();
  await expect.poll(() => isFullscreen(page)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(theater(page)).toHaveCount(0);
});

test("a shared link opens straight into Theater Mode, and Exit stays on the Script", async ({
  page,
}) => {
  await serve(page, short());
  const path = new URL(page.url()).pathname;
  // A fresh tab: no history to go back through, and no gesture to go fullscreen with.
  const tab = await page.context().newPage();
  await tab.goto(`${path}?theater=true&night=true`);
  await expect(theater(tab)).toBeVisible();
  await expect(ribbon(tab)).toBeVisible();
  expect(await isFullscreen(tab)).toBe(false);
  await tab.getByRole("button", { name: "Fullscreen" }).click();
  await expect.poll(() => isFullscreen(tab)).toBe(true);
  await expect(tab.getByRole("button", { name: "Fullscreen" })).toHaveCount(0);
  await exit(tab).click();
  await expect(theater(tab)).toHaveCount(0);
  await expect(tab).toHaveURL(path);
  await expect(tab.getByRole("heading", { name: "Brimstone & Brine" })).toBeVisible();
});

test("Esc closes Theater Mode when not fullscreen, and unknown params are ignored", async ({
  page,
}) => {
  await serve(page, short());
  const path = new URL(page.url()).pathname;
  await page.goto(`${path}?theater=maybe`);
  await expect(entry(page)).toBeVisible();
  await expect(theater(page)).toHaveCount(0);
  await page.goto(`${path}?theater=true`);
  await expect(theater(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(theater(page)).toHaveCount(0);
  await expect(page).toHaveURL(path);
});

test("the night ribbon is off by default and lists who wakes, without instructions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await serve(page, dense());
  await entry(page).click();
  await expect(ribbon(page)).toHaveCount(0);
  const without = await fit(page);

  await page.getByRole("button", { name: "Night order" }).click();
  await expect(page.getByRole("button", { name: "Night order" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).toHaveURL(/night=true/);
  const first = page.getByRole("list", { name: "First Night order" });
  await expect(first).toContainText("Dusk");
  await expect(first).toContainText("Townsfolk 1");
  await expect(page.getByRole("list", { name: "Other Nights order" })).toContainText("Minion 1");
  await expect(ribbon(page)).not.toContainText("Wake the");
  // The ribbon takes room, so the Characters shrink to keep every one on screen.
  await expect.poll(() => fit(page)).toBeLessThan(without);
  expect(await nothingClipped(page)).toBe(true);
  // Toggling replaces history, so one Back still leaves Theater Mode.
  await page.goBack();
  await expect(theater(page)).toHaveCount(0);
});

for (const [name, viewport] of [
  ["TV", { width: 1920, height: 1080 }],
  ["4K TV", { width: 3840, height: 2160 }],
  ["laptop", { width: 1366, height: 768 }],
  ["phone in landscape", { width: 844, height: 390 }],
  ["phone in portrait", { width: 390, height: 844 }],
] as const)
  test(`a full Script fills a ${name} with nothing clipped`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serve(page, dense());
    await entry(page).click();
    await expect(theater(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => nothingClipped(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Night order" }).click();
    await expect(ribbon(page)).toBeVisible();
    await expect.poll(() => nothingClipped(page)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`theater-${viewport.width}.png`) });
  });

test("resizing refits, so turning a phone keeps every Character on screen", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await serve(page, dense());
  // Opened by link, not click: a browser window cannot be resized while fullscreen.
  await page.goto(`${new URL(page.url()).pathname}?theater=true`);
  await expect.poll(() => nothingClipped(page)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => nothingClipped(page)).toBe(true);
  expect(await teams(page).evaluate((node) => getComputedStyle(node).columnCount)).toBe("2");
});

test("a short Script grows its text to the largest size", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await serve(page, short());
  await entry(page).click();
  await expect.poll(() => fit(page)).toBe(2);
});

test("a Script too long for the floor scrolls rather than losing Characters", async ({ page }) => {
  // Very little height, so the wordiest sample cannot fit even at the floor.
  await page.setViewportSize({ width: 1920, height: 300 });
  await serve(page, long());
  await entry(page).click();
  await expect(teams(page)).toHaveAttribute("data-overflowing", "");
  expect(await fit(page)).toBeCloseTo(0.6);
  const last = poster(page).getByText("Long 60", { exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test("a blank ability and an unnamed Character stay readable", async ({ page }) => {
  const blank = character("townsfolk", "", "");
  const others = ["A", "B", "C"].map((name) => character("demon", name));
  await serve(
    page,
    sheetScript([blank, ...others], {
      firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
      otherNight: ["dusk", "dawn"],
    }),
  );
  await entry(page).click();
  await expect(poster(page)).toContainText("Unnamed Townsfolk");
  await expect(poster(page)).toContainText("No ability written");
});

test("the controls fade when idle and return on input, with the cursor hidden", async ({
  page,
}) => {
  await serve(page, short());
  await entry(page).click();
  await expect(exit(page)).toBeVisible();
  const stage = page.locator('[data-slot="theater-stage"]');
  await expect(stage).toHaveAttribute("data-idle", "", { timeout: 5000 });
  await expect(page.locator('[data-slot="theater-controls"]')).toHaveCSS("opacity", "0");
  await expect(stage).toHaveCSS("cursor", "none");
  await page.mouse.move(50, 50);
  await expect(stage).not.toHaveAttribute("data-idle", "");
  await expect(page.locator('[data-slot="theater-controls"]')).toHaveCSS("opacity", "1");
});

test("the screen stays awake while open, recovers after hiding, and releases on exit", async ({
  page,
}) => {
  // The fake counts on the document, and a test event stands in for the browser's drop.
  await page.addInitScript(() => {
    const counts = document.createElement("meta");

    counts.id = "wake-counts";
    counts.dataset.requested = "0";
    counts.dataset.released = "0";

    const bump = (key: "requested" | "released") => {
      counts.dataset[key] = String(Number(counts.dataset[key]) + 1);
      document.documentElement.append(counts);
    };

    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          bump("requested");

          const sentinel = {
            released: false,
            release: async () => {
              sentinel.released = true;
              bump("released");
            },
          };

          document.addEventListener("drop-wake-lock", () => {
            sentinel.released = true;
          });

          return sentinel;
        },
      },
    });
  });

  const wake = () =>
    page.evaluate(() => {
      const { requested, released } = document.getElementById("wake-counts")?.dataset ?? {};

      return { requested, released };
    });

  await serve(page, short());
  await entry(page).click();
  await expect.poll(wake).toEqual({ requested: "1", released: "0" });
  // Still holding the lock: returning to the page does not take a second one.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(wake).toEqual({ requested: "1", released: "0" });
  // The browser dropped it while hidden: returning takes a new one.
  await page.evaluate(() => {
    document.dispatchEvent(new Event("drop-wake-lock"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(wake).toEqual({ requested: "2", released: "0" });
  await exit(page).click();
  await expect.poll(wake).toEqual({ requested: "2", released: "1" });
});

test("the logo replaces the name, falls back if it fails, and its credit link shows", async ({
  page,
  context,
}) => {
  await signIn(page);
  const id = await seedScript(page);
  await page.goto(`/scripts/${id}/edit`);

  const logo = page.getByRole("region", { name: "Script artwork" }).getByRole("region", {
    name: "Logo",
  });

  const chooser = page.waitForEvent("filechooser");
  await logo.getByRole("button", { name: "Upload logo" }).click();
  await (await chooser).setFiles(await sampleFile(page, "lineart"));
  await expect(logo.getByRole("img", { name: "Current logo" })).toBeVisible();
  await callRpc(
    page,
    "Script.updateDetails",
    {
      id: ScriptId.make(id),
      name: "Moonlit",
      authorCredit: "Ada",
      logoCredit: "Logo by Ada",
      backgroundCredit: "",
    },
    OwnedScript,
  );
  await context.clearCookies();

  await page.goto(`/scripts/${id}?theater=true`);

  const title = page.locator('[data-slot="poster-title"]');
  await expect(title.getByRole("img", { name: "Moonlit" })).toBeVisible();
  await expect(title.locator('[data-slot="poster-name"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="poster-footer"]')).toContainText(
    `Image credits: localhost:1338/scripts/${id}`,
  );

  await page.route("**/artwork/**", (route) => route.abort());
  await page.reload();
  await expect(title.locator('[data-slot="poster-name"]')).toHaveText("Moonlit");
});

test("a Script with no Characters offers no Theater Mode, even from a link", async ({
  page,
  context,
}) => {
  await signIn(page);
  const script = await callRpc(page, "Script.create", {}, OwnedScript);
  await context.clearCookies();
  await page.goto(`/scripts/${script.id}?theater=true`);
  await expect(page.getByText("This Script has no Characters yet.")).toBeVisible();
  await expect(entry(page)).toHaveCount(0);
  await expect(theater(page)).toHaveCount(0);
});
