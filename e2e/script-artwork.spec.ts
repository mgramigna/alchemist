import { PublicScript, ScriptArtwork } from "@alchemist/domain";
import { expect, test, type Page } from "@playwright/test";
import { Schema } from "effect";
import { callRpc, signIn } from "./support/api.ts";
import { failRpcOnce, sampleFile, seedScript } from "./support/artwork.ts";

const Exported = Schema.Struct({ filename: Schema.String, json: Schema.String });

const readArtwork = (page: Page, id: string) =>
  callRpc(page, "Script.readArtwork", { id }, ScriptArtwork);

const exportedMeta = async (page: Page, id: string) =>
  JSON.parse((await callRpc(page, "Script.exportPublic", { id }, Exported)).json)[0];

const slot = (page: Page, name: "Logo" | "Background") =>
  page.getByRole("region", { name: "Script artwork" }).getByRole("region", { name });

// Chooses the file through the keyboard-operated button.
const chooseByKeyboard = async (
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  file: Awaited<ReturnType<typeof sampleFile>>,
) => {
  await button.focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(file);
};

test("logo and background upload, replace and remove; published images stay public and export", async ({
  page,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.goto(`/scripts/${scriptId}/edit`);
  const logo = slot(page, "Logo");
  const background = slot(page, "Background");
  await expect(logo).toContainText("No logo");
  await expect(background).toContainText("No background");

  const logoFile = await sampleFile(page, "lineart");
  const backgroundFile = await sampleFile(page, "photo");
  await chooseByKeyboard(page, logo.getByRole("button", { name: "Upload logo" }), logoFile);
  await expect(logo.getByRole("img", { name: "Current logo" })).toHaveAttribute(
    "src",
    /^\/artwork\/[0-9a-z]{26}\.png$/,
  );
  await chooseByKeyboard(
    page,
    background.getByRole("button", { name: "Upload background" }),
    backgroundFile,
  );
  await expect(background.getByRole("img", { name: "Current background" })).toHaveAttribute(
    "src",
    /^\/artwork\/[0-9a-z]{26}\.jpg$/,
  );
  await page
    .getByRole("region", { name: "Script artwork" })
    .screenshot({ path: info.outputPath("script-artwork.png") });

  const first = await readArtwork(page, scriptId);

  // Published unchanged: same bytes and format, anonymous CORS and immutable caching.
  for (const [path, file] of [
    [first.logo, logoFile],
    [first.background, backgroundFile],
  ] as const) {
    const response = await page.request.get(path ?? "missing", {
      headers: { Origin: "https://botc.app" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers()["content-type"]).toBe(file.mimeType);
    expect(Buffer.from(await response.body()).equals(file.buffer)).toBe(true);
  }

  const origin = new URL(page.url()).origin;
  const meta = await exportedMeta(page, scriptId);
  expect(meta.logo).toBe(`${origin}${first.logo}`);
  expect(meta.background).toBe(`${origin}${first.background}`);

  // Viewers see the logo; the read carries published paths only.
  const viewed = await callRpc(page, "Script.readPublic", { id: scriptId }, PublicScript);
  expect(viewed.artwork).toEqual(first);
  await page.goto(`/scripts/${scriptId}`);
  await expect(page.getByRole("img", { name: "Untitled Script logo" })).toHaveAttribute(
    "src",
    first.logo ?? "missing",
  );

  // Saved state survives a reload.
  await page.goto(`/scripts/${scriptId}/edit`);
  await expect(logo.getByRole("img", { name: "Current logo" })).toHaveAttribute(
    "src",
    first.logo ?? "missing",
  );

  // Replacement and removal leave every earlier published URL working.
  await logo.locator('input[type="file"]').setInputFiles(await sampleFile(page, "ink"));
  await expect(logo.getByRole("img", { name: "Current logo" })).toHaveAttribute(
    "src",
    /^\/artwork\/[0-9a-z]{26}\.jpg$/,
  );
  await background.getByRole("button", { name: "Remove background" }).click();
  await expect(background).toContainText("No background");

  const second = await readArtwork(page, scriptId);
  expect(second.logo).not.toBe(first.logo);
  expect(second.background).toBeNull();

  for (const path of [first.logo, first.background])
    expect((await page.request.get(path ?? "missing")).status()).toBe(200);

  const replaced = await exportedMeta(page, scriptId);
  expect(replaced.logo).toBe(`${origin}${second.logo}`);
  expect(replaced).not.toHaveProperty("background");
});

test("a failed upload keeps the previous artwork and retries; the section fits a narrow screen", async ({
  page,
}) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/scripts/${scriptId}/edit`);
  const logo = slot(page, "Logo");
  const input = logo.locator('input[type="file"]');

  await failRpcOnce(page, "Script.uploadArtwork");
  await input.setInputFiles(await sampleFile(page, "lineart"));
  await expect(logo.getByRole("alert")).toContainText("Your previous logo is unchanged");
  await expect(logo).toContainText("No logo");
  expect((await readArtwork(page, scriptId)).logo).toBeNull();
  await logo.getByRole("button", { name: "Try again" }).click();
  await expect(logo.getByRole("img", { name: "Current logo" })).toBeVisible();
  const uploaded = await readArtwork(page, scriptId);
  expect(uploaded.logo).not.toBeNull();

  // A failed removal keeps the logo too.
  await failRpcOnce(page, "Script.removeArtwork");
  await logo.getByRole("button", { name: "Remove logo" }).click();
  await expect(logo.getByRole("alert")).toContainText("It’s unchanged");
  expect(await readArtwork(page, scriptId)).toEqual(uploaded);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);

  // Non-images are refused before anything is sent.
  await input.setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(logo.getByRole("alert")).toContainText("Use a PNG, JPEG, WebP or GIF image.");
  expect(await readArtwork(page, scriptId)).toEqual(uploaded);
});
