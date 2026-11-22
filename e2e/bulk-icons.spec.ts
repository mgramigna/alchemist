import { expect, test } from "@playwright/test";
import { signIn } from "./support/api.ts";
import { NAMES, failRpcOnce, readCharacter, sampleFile, seedScript } from "./support/artwork.ts";

test("several images are matched by name, assigned, published together, and retried on failure", async ({
  page,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.goto(`/scripts/${scriptId}/edit`);
  await page
    .getByRole("navigation", { name: "Script sections" })
    .getByRole("button", { name: /Upload icons/ })
    .click();

  const region = page.getByRole("region", { name: "Upload icons" });
  const lineart = await sampleFile(page, "lineart");
  const ink = await sampleFile(page, "ink");
  const photo = await sampleFile(page, "photo");

  await region.locator('input[type="file"]').setInputFiles([
    { ...lineart, name: `${NAMES.townsfolk.toLowerCase()}.png` },
    { ...ink, name: `${NAMES.minion}.jpg` },
    { ...photo, name: "apple.jpg" },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
  ]);

  const images = region.getByRole("list", { name: "Images" }).getByRole("listitem");
  await expect(images).toHaveCount(4);

  // Named files are matched; others wait to be assigned, and non-images can't be.
  const picker = (file: string) => region.getByRole("combobox", { name: `Character for ${file}` });
  await expect(picker("lamplighter.png")).toContainText(NAMES.townsfolk);
  await expect(picker(`${NAMES.minion}.jpg`)).toContainText(NAMES.minion);
  await expect(picker("apple.jpg")).toContainText("Not assigned");
  await expect(images.nth(3)).toContainText("Use a PNG, JPEG, WebP or GIF image.");
  await expect(region.getByRole("button", { name: "Publish 2 icons" })).toBeEnabled();
  await region.screenshot({ path: info.outputPath("bulk-matched.png") });

  // A Character that already has an image can't be chosen twice.
  await picker("apple.jpg").click();
  await expect(page.getByRole("option", { name: NAMES.townsfolk })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("option", { name: NAMES.demon }).click();
  await expect(picker("apple.jpg")).toContainText(NAMES.demon);
  await region.getByRole("button", { name: "Remove notes.txt" }).click();
  await expect(images).toHaveCount(3);

  // The first upload fails in transit; the others still publish.
  await failRpcOnce(page, "Artwork.upload");
  await region.getByRole("button", { name: "Publish 3 icons" }).click();
  await expect(region.getByRole("status")).toHaveText("2 icons published.");
  await expect(images.nth(0)).toContainText("Couldn’t save this icon.");
  await expect(images.nth(1)).toContainText("Published");
  await expect(images.nth(2)).toContainText("Published");
  await region.screenshot({ path: info.outputPath("bulk-partial.png") });

  await region.getByRole("button", { name: "Publish 1 icon" }).click();
  await expect(region.getByRole("status")).toHaveText("3 icons published.");
  await expect(region).toContainText(
    `Still using generic icons: ${NAMES.outsider}, ${NAMES.traveller}.`,
  );

  for (const team of ["townsfolk", "minion", "demon"] as const) {
    const saved = await readCharacter(page, scriptId, NAMES[team]);
    expect(saved.artwork?.style).toEqual({ look: "auto" });
    expect(saved.artwork?.team).toBe(team);
  }

  expect((await readCharacter(page, scriptId, NAMES.outsider)).artwork).toBeUndefined();

  // The preview and the Character's own editor show the published icons.
  await expect(
    page.getByRole("complementary", { name: "Preview" }).locator('img[src^="/artwork/"]'),
  ).toHaveCount(3);
  await images
    .nth(2)
    .getByRole("button", { name: `Open ${NAMES.demon}` })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Icon" })
      .getByRole("list", { name: "Icon variants" })
      .locator("img")
      .first(),
  ).toHaveAttribute("src", /^\/artwork\//);
});
