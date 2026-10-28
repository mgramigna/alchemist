import { OwnedScript } from "@alchemist/domain";
import { expect, test } from "@playwright/test";
import { callRpc, signIn } from "./support/api.ts";
import {
  NAMES,
  openCharacter,
  readCharacter,
  sampleFile,
  seedScript,
  upload,
} from "./support/artwork.ts";

const ICON_CREDIT = "Icon by Lorc, game-icons.net, CC BY 3.0";
const LOGO_CREDIT = "Logo by Ada";

test("image credits save with their images, list on the shared page and are linked from the sheets", async ({
  page,
  context,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  const icon = await openCharacter(page, scriptId, NAMES.townsfolk);

  // Nothing to credit until there is an image.
  await expect(icon.getByLabel("Image credit")).toHaveCount(0);
  await upload(page, "lineart");
  await expect(icon.locator("img").first()).toHaveAttribute("src", /^\/artwork\//);
  await icon.getByLabel("Image credit").fill(ICON_CREDIT);
  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.townsfolk)).artworkCredit)
    .toBe(ICON_CREDIT);

  const footer = page.getByRole("complementary", { name: "Preview" }).locator("footer").first();
  await expect(footer).toContainText("Made with localhost:1338");
  await expect(footer).toContainText(`Image credits: localhost:1338/scripts/${scriptId}`);

  await page.getByRole("button", { name: "Script details" }).click();

  const logo = page.getByRole("region", { name: "Script artwork" }).getByRole("region", {
    name: "Logo",
  });

  await expect(logo.getByLabel("Image credit")).toHaveCount(0);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await sampleFile(page, "lineart"));
  await expect(logo.getByRole("img", { name: "Current logo" })).toBeVisible();
  await logo.getByLabel("Image credit").fill(LOGO_CREDIT);
  await expect
    .poll(
      async () =>
        (await callRpc(page, "Script.readOwned", { id: scriptId }, OwnedScript)).logoCredit,
    )
    .toBe(LOGO_CREDIT);
  await page.screenshot({ path: info.outputPath("workbench-credits.png"), fullPage: true });

  await context.clearCookies();
  await page.goto(`/scripts/${scriptId}`);
  const credits = page.getByRole("region", { name: "Image credits" });
  await expect(credits.getByRole("term")).toHaveText([NAMES.townsfolk, "Logo"]);
  await expect(credits.getByRole("definition")).toHaveText([ICON_CREDIT, LOGO_CREDIT]);
  await page.screenshot({ path: info.outputPath("shared-credits.png"), fullPage: true });
  await page.getByRole("button", { name: "100%" }).click();
  const printed = page.locator('[data-slot="sheet-footer"]').first();
  await expect(printed).toContainText(`Image credits: localhost:1338/scripts/${scriptId}`);
  await printed.scrollIntoViewIfNeeded();
  await printed.screenshot({ path: info.outputPath("sheet-footer.png") });
});
