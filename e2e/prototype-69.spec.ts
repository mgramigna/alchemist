// PROTOTYPE (#69): screenshots each Studio layout scrolled down to a lower slider. Do not merge.
import { expect, test } from "@playwright/test";
import { signIn } from "./support/api.ts";
import { NAMES, openCharacter, seedScript, upload, variantImages } from "./support/artwork.ts";

for (const [device, viewport] of [
  ["desktop", { width: 1400, height: 900 }],
  ["phone", { width: 390, height: 844 }],
] as const)
  test(`studio layouts on ${device}`, async ({ page }) => {
    await signIn(page);
    const scriptId = await seedScript(page);
    await page.setViewportSize(viewport);
    const icon = await openCharacter(page, scriptId, NAMES.outsider);
    await upload(page, "lineart");
    await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
    await icon.getByRole("button", { name: "Customize in Studio" }).click();
    const studio = page.getByRole("dialog", { name: "Studio" });

    for (const layout of ["sticky", "split", "pip", "tabs"]) {
      await page.evaluate((key) => {
        const url = new URL(location.href);
        url.searchParams.set("studio", key);
        history.replaceState(history.state, "", url);
        dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      }, layout);
      await expect(
        studio.getByRole("list", { name: "Preview variants" }).locator("img").first(),
      ).toBeVisible();

      if (layout === "tabs") await studio.getByRole("tab", { name: "Finish" }).click();
      const shadow = studio.getByRole("slider", { name: "Shadow offset" });
      await shadow.scrollIntoViewIfNeeded();
      await shadow.fill("25");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `/tmp/proto69/${device}-${layout}.png` });
    }
  });
