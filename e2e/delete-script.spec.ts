import { expect, test } from "@playwright/test";
import { Schema } from "effect";
import { ScriptArtwork, ScriptId } from "@alchemist/domain";
import { callRpc, signIn } from "./support/api.ts";
import { sampleFile, seedScript, failRpcOnce } from "./support/artwork.ts";

test("owner confirms deletion by keyboard on a narrow screen; share and edit disappear while artwork loads", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const id = await seedScript(page);
  await page.goto(`/scripts/${id}/edit`);
  await page
    .getByRole("region", { name: "Logo", exact: true })
    .locator('input[type="file"]')
    .setInputFiles(await sampleFile(page, "lineart"));
  const logo = page.getByRole("img", { name: "Current logo" });
  await expect(logo).toBeVisible();
  const artwork = await callRpc(page, "Script.readArtwork", { id }, ScriptArtwork);

  const exported = await callRpc(
    page,
    "Script.exportPublic",
    { id },
    Schema.Struct({ filename: Schema.String, json: Schema.String }),
  );

  const exportedLogo = JSON.parse(exported.json)[0].logo;
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, { name: "Bob" });
  await expect(callRpc(other, "Script.delete", { id }, ScriptId)).rejects.toThrow("ScriptNotFound");
  await otherContext.close();
  await page.goto(`/scripts/${id}`);
  await expect(page.getByRole("heading", { name: "Untitled Script", exact: true })).toBeVisible();
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Delete Script", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("This cannot be undone");
  await expect(dialog).toContainText("Previously exported artwork URLs will keep working");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: /Untitled Script/ })).toBeVisible();
  await trigger.click();
  await failRpcOnce(page, "Script.delete");
  await page.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Retry");
  await page.getByRole("button", { name: "Permanently delete", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name: /Untitled Script/ })).toHaveCount(0);
  await callRpc(page, "Script.delete", { id }, ScriptId);
  await page.goto(`/scripts/${id}`);
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
  await page.goto(`/scripts/${id}/edit`);
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
  expect(exportedLogo).toBe(`${new URL(page.url()).origin}${artwork.logo}`);
  const anonymous = await browser.newContext();
  const image = await anonymous.request.get(exportedLogo);
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toContain("immutable");
  await anonymous.close();
});

test("owner deletes a Script from the Workbench and returns to their Scripts", async ({ page }) => {
  await signIn(page);
  const id = await seedScript(page);
  await page.goto(`/scripts/${id}/edit`);
  await page.getByRole("button", { name: "Delete Script", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("This cannot be undone");
  await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Deleted Untitled Script")).toBeVisible();
  await expect(page.getByRole("link", { name: /Untitled Script/ })).toHaveCount(0);
  await page.goto(`/scripts/${id}/edit`);
  await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
});
