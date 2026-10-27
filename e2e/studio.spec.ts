import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./support/api.ts";
import {
  NAMES,
  failRpcOnce,
  openCharacter,
  readCharacter,
  sampleFile,
  seedScript,
  selectCharacter,
  upload,
  variantImages,
} from "./support/artwork.ts";

/** What a published variant looks like: where its art sits and its average color. */
const measure = (page: Page, path: string) =>
  page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");

    if (context === null) throw new Error("No canvas");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width;
    let x1 = -1;
    let sumX = 0;
    let count = 0;
    const rgb = [0, 0, 0];

    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        // Opaque art only: the soft shadow and outline edges are partly transparent.
        if ((data[i + 3] ?? 0) < 250) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        sumX += x;
        count++;

        for (let k = 0; k < 3; k++) rgb[k] = (rgb[k] ?? 0) + (data[i + k] ?? 0);
      }

    const [r = 0, g = 0, b = 0] = rgb.map((channel) => channel / count);

    return { width: x1 - x0 + 1, centerX: sumX / count, r, g, b };
  }, path);

const studio = (page: Page) => page.getByRole("dialog", { name: "Studio" });

// The large, draggable preview of the first variant.
const stage = (page: Page) => studio(page).getByRole("img", { name: /preview: position/ });

// Radios are visually hidden inside their labels; click the label as a pointer user would.
const choose = (radio: Locator) => radio.locator("xpath=ancestor::label[1]").click();

// The modal Studio hides the page from assistive technology, so read the current icons from the DOM.
const currentIcon = (page: Page) => page.locator('[aria-label="Icon variants"] img').first();

const regularPath = async (page: Page, scriptId: string, name: string) =>
  (await readCharacter(page, scriptId, name)).artwork?.variants[0]?.path ?? "missing";

test("the Studio adjusts by keyboard and pointer, publishes on save, replays on Team changes and resets to auto", async ({
  page,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  const icon = await openCharacter(page, scriptId, NAMES.outsider);
  await upload(page, "lineart");
  await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
  const automatic = await readCharacter(page, scriptId, NAMES.outsider);
  const autoPath = automatic.artwork?.variants[0]?.path ?? "missing";
  const before = await measure(page, autoPath);
  await expect(icon).not.toContainText("Customized");

  // Everything below is reachable by keyboard.
  await icon.getByRole("button", { name: "Customize in Studio" }).focus();
  await page.keyboard.press("Enter");
  await expect(studio(page)).toBeVisible();
  await expect(studio(page).getByRole("img", { name: "Artwork after cutout" })).toBeVisible();
  await expect(studio(page)).toContainText("Auto-detect kept the image’s own transparency.");
  await expect(studio(page)).toContainText("Automatic styling.");

  const size = studio(page).getByRole("slider", { name: "Size" });
  await size.focus();

  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowLeft");
  await expect(size).toHaveValue("0.6");

  await studio(page).getByRole("slider", { name: "Pale outline" }).focus();
  await page.keyboard.press("Home");
  await studio(page).getByRole("switch", { name: "Team shades" }).focus();
  await page.keyboard.press("Space");

  const stage = studio(page).getByRole("img", { name: /preview: position/ });
  await stage.focus();

  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(stage).toHaveAccessibleName("Regular preview: position 40, 0; size 60%");

  // Direct manipulation: drag moves the art, scrolling resizes it.
  const box = await stage.boundingBox();

  if (box === null) throw new Error("No preview");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y + box.height / 10, { steps: 4 });
  await page.mouse.up();
  await expect(stage).toHaveAccessibleName(/position 40, (3\d|4\d); size 60%/);
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAccessibleName(/size 58%/);
  await page.mouse.wheel(0, -100);
  await expect(stage).toHaveAccessibleName(/size 60%/);

  // Draft changes are previewed but not published until saved.
  await expect(studio(page)).toContainText("Customized: Team shades, outline, size, position");
  await studio(page).screenshot({ path: info.outputPath("studio-draft.png") });
  expect(await regularPath(page, scriptId, NAMES.outsider)).toBe(autoPath);
  await expect(currentIcon(page)).toHaveAttribute("src", autoPath);

  await studio(page).getByRole("button", { name: "Save" }).click();
  await expect(studio(page)).toBeHidden();
  await expect(variantImages(icon).first()).not.toHaveAttribute("src", autoPath);
  await expect(icon).toContainText("Customized: Team shades, outline, size, position");
  await icon.screenshot({ path: info.outputPath("icon-customized.png") });

  const saved = await readCharacter(page, scriptId, NAMES.outsider);
  expect(saved.artwork?.sourceId).toBe(automatic.artwork?.sourceId);
  expect(saved.artwork?.style).toMatchObject({
    look: "auto",
    size: 0.6,
    outline: 0,
    teamShades: true,
    offsetX: 40,
  });
  expect(saved.artwork?.style.offsetY).toBeGreaterThan(30);

  // The published icon is smaller, shifted right, and Outsider cyan rather than Good blue.
  const customized = await measure(page, saved.artwork?.variants[0]?.path ?? "missing");
  expect(customized.width).toBeLessThan(before.width * 0.85);
  expect(customized.centerX).toBeGreaterThan(before.centerX + 30);
  expect(customized.g / customized.b).toBeGreaterThan(before.g / before.b + 0.15);

  // Reopening after a reload shows the saved settings.
  await page.reload();
  await selectCharacter(page, NAMES.outsider);
  await expect(icon).toContainText("Customized: Team shades, outline, size, position");
  await icon.getByRole("button", { name: "Customize in Studio" }).click();
  await expect(studio(page).getByRole("slider", { name: "Size" })).toHaveValue("0.6");
  await expect(studio(page).getByRole("switch", { name: "Team shades" })).toBeChecked();
  await expect(studio(page).getByRole("button", { name: "Save" })).toBeDisabled();
  await studio(page).getByRole("button", { name: "Cancel" }).click();
  await expect(studio(page)).toBeHidden();

  // A Team change replays the saved settings from the original: Minion orange, not Evil red.
  await page.getByRole("combobox", { name: "Team" }).click();
  await page.getByRole("option", { name: "Minion" }).click();

  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.outsider)).artwork?.team)
    .toBe("minion");
  const moved = await readCharacter(page, scriptId, NAMES.outsider);
  expect(moved.artwork?.style).toEqual(saved.artwork?.style);
  const minion = await measure(page, moved.artwork?.variants[0]?.path ?? "missing");
  expect(minion.g / minion.r).toBeGreaterThan(0.45);
  expect(minion.width).toBeLessThan(before.width * 0.85);

  // Reset to auto restores the automatic style in one step.
  await icon.getByRole("button", { name: "Reset to auto" }).click();
  await expect(icon).not.toContainText("Customized");
  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.outsider)).artwork?.style)
    .toEqual({ look: "auto" });
  const reset = await measure(page, await regularPath(page, scriptId, NAMES.outsider));
  expect(Math.abs(reset.width - before.width)).toBeLessThanOrEqual(2);

  // Every icon published along the way is still served at its original URL.
  for (const character of [automatic, saved, moved])
    for (const { path } of character.artwork?.variants ?? [])
      expect((await page.request.get(path)).status()).toBe(200);
});

test("cutout tuning previews before saving; failures keep the icons; a transparent upload replaces a poor cutout", async ({
  page,
}) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  const icon = await openCharacter(page, scriptId, NAMES.townsfolk);
  await upload(page, "photo");
  await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
  const uploaded = await readCharacter(page, scriptId, NAMES.townsfolk);
  const uploadedPath = uploaded.artwork?.variants[0]?.path ?? "missing";

  await icon.getByRole("button", { name: "Customize in Studio" }).click();
  await expect(studio(page)).toContainText(
    "Auto-detect removed the backdrop by flooding in from the edges.",
  );

  // Removing light paper from a photo goes wrong, and the preview shows it before anything is saved.
  await choose(studio(page).getByRole("radio", { name: "Remove light paper" }));
  await expect(studio(page)).toContainText(
    "This cutout removed the light paper behind the drawing.",
  );
  await choose(studio(page).getByRole("radio", { name: "Remove backdrop from the edges" }));
  const tolerance = studio(page).getByRole("slider", { name: "Tolerance" });
  await tolerance.focus();

  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(tolerance).toHaveValue("0.12");
  await expect(studio(page)).toContainText("Customized: cutout");

  // Cancel discards the draft.
  await studio(page).getByRole("button", { name: "Cancel" }).click();
  expect((await readCharacter(page, scriptId, NAMES.townsfolk)).artwork?.style).toEqual({
    look: "auto",
  });

  // A failed save stays in the Studio with the previous icons current, then retries.
  await icon.getByRole("button", { name: "Customize in Studio" }).click();
  await choose(studio(page).getByRole("radio", { name: "Remove backdrop from the edges" }));
  await choose(studio(page).getByRole("radio", { name: "Solid fill" }));
  await failRpcOnce(page, "Artwork.restyle");
  await studio(page).getByRole("button", { name: "Save" }).click();
  await expect(studio(page).getByRole("alert")).toContainText("Your previous icons are kept");
  await expect(currentIcon(page)).toHaveAttribute("src", uploadedPath);
  await studio(page).getByRole("button", { name: "Try again" }).click();
  await expect(studio(page)).toBeHidden();
  await expect(icon.getByRole("radio", { name: "Custom (Studio)" })).toBeChecked();
  await expect(icon).toContainText("Studio cutout: removed the backdrop");

  const restyled = await readCharacter(page, scriptId, NAMES.townsfolk);
  expect(restyled.artwork?.style).toEqual({ look: "auto", cutout: "edge", color: "solid" });

  // Choosing a Look replaces the Studio color but keeps the other settings.
  await choose(icon.getByRole("radio", { name: "Solid" }));
  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.townsfolk)).artwork?.style)
    .toEqual({ look: "solid", cutout: "edge" });

  // The transparent replacement refuses an image without transparency, then accepts one.
  await icon.getByRole("button", { name: "Customize in Studio" }).click();
  const size = studio(page).getByRole("slider", { name: "Size" });
  await size.focus();
  await page.keyboard.press("End");
  const replacement = studio(page).locator('input[type="file"]');
  await replacement.setInputFiles(await sampleFile(page, "ink"));
  await expect(icon.getByRole("alert")).toContainText("That image has no transparent background");
  expect((await readCharacter(page, scriptId, NAMES.townsfolk)).artwork?.sourceId).toBe(
    uploaded.artwork?.sourceId,
  );

  await icon.getByRole("button", { name: "Try again" }).click();
  await studio(page).getByRole("slider", { name: "Size" }).focus();
  await page.keyboard.press("End");
  await studio(page)
    .locator('input[type="file"]')
    .setInputFiles(await sampleFile(page, "lineart"));
  await expect(icon).toContainText("Automatic cutout: kept the image’s own transparency.");

  const replaced = await readCharacter(page, scriptId, NAMES.townsfolk);
  expect(replaced.artwork?.sourceId).not.toBe(uploaded.artwork?.sourceId);
  expect(replaced.artwork?.style).toEqual({ look: "solid", size: 1 });

  for (const character of [uploaded, restyled])
    for (const { path } of character.artwork?.variants ?? [])
      expect((await page.request.get(path)).status()).toBe(200);
});

test("the Studio fits a narrow screen and saves by keyboard", async ({ page }, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const icon = await openCharacter(page, scriptId, NAMES.traveller);
  await upload(page, "lineart");
  await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
  await icon.getByRole("button", { name: "Customize in Studio" }).click();

  await expect(studio(page).getByRole("list", { name: "Preview variants" })).toBeVisible();
  await expect(
    studio(page).getByRole("list", { name: "Preview variants" }).locator("img"),
  ).toHaveCount(3);

  // Measure once the drawer has finished sliding in.
  await page.waitForFunction(() => document.getAnimations().length === 0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);
  const dialog = await studio(page).boundingBox();
  expect(dialog?.width).toBeLessThanOrEqual(375);
  await page.screenshot({ path: info.outputPath("studio-narrow.png") });

  // The preview stays pinned above the controls while the last of them scroll into view (#69).
  await studio(page).getByRole("slider", { name: "Vertical position" }).scrollIntoViewIfNeeded();
  await expect(stage(page)).toBeInViewport({ ratio: 1 });

  await studio(page).getByRole("slider", { name: "Texture" }).focus();
  await page.keyboard.press("Home");
  const save = studio(page).getByRole("button", { name: "Save" });
  await save.focus();
  await expect(save).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(studio(page)).toBeHidden();
  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.traveller)).artwork?.style)
    .toEqual({ look: "auto", texture: 0 });
  await expect(icon).toContainText("Customized: texture");
});

test("the Studio keeps the preview beside the controls on a wide screen", async ({ page }) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const icon = await openCharacter(page, scriptId, NAMES.traveller);
  await upload(page, "lineart");
  await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
  await icon.getByRole("button", { name: "Customize in Studio" }).click();
  await expect(stage(page)).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().length === 0);

  // Adjusting the last slider still shows its effect on the preview (#69).
  const before = await stage(page).locator("img").getAttribute("src");
  const slider = studio(page).getByRole("slider", { name: "Vertical position" });
  await slider.scrollIntoViewIfNeeded();
  await slider.fill("40");
  await expect(stage(page)).toBeInViewport({ ratio: 1 });
  await expect(stage(page).locator("img")).not.toHaveAttribute("src", before ?? "");

  const [preview, control] = await Promise.all([stage(page).boundingBox(), slider.boundingBox()]);
  expect(preview!.x + preview!.width).toBeLessThan(control!.x);
});
