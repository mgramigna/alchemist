import { expect, test } from "@playwright/test";
import { Schema } from "effect";
import { Character } from "@alchemist/domain";
import { OwnedScript } from "@alchemist/domain";
import { callRpc, signIn } from "./support/api.ts";
import { readFile } from "node:fs/promises";

// All setup uses authenticated RPCs against the development server. Recipients
// use a separate browser context with no session.
const sharing = test.extend<{
  app: {
    id: string;
    invalidate: () => Promise<void>;
    overflow: () => Promise<void>;
  };
}>({
  app: async ({ page }, use) => {
    await signIn(page);
    const script = await callRpc(page, "Script.create", {}, OwnedScript);

    const addCharacter = async (index: number, ability: string) => {
      const character = await callRpc(
        page,
        "Character.create",
        {
          scriptId: script.id,
          team: "townsfolk",
          nights: [],
        },
        Character,
      );

      return callRpc(
        page,
        "Character.update",
        {
          ...character,
          scriptId: script.id,
          name: `Character ${index}`,
          ability,
        },
        Character,
      );
    };

    const characters: Character[] = [];

    for (let i = 0; i < 4; i++) characters.push(await addCharacter(i, "You learn a number."));
    await use({
      id: script.id,
      // Empty abilities are valid draft writes but block JSON export.
      invalidate: async () => {
        for (const character of characters) {
          await callRpc(
            page,
            "Character.update",
            {
              ...character,
              scriptId: script.id,
              ability: "",
            },
            Character,
          );
        }
      },
      overflow: async () => {
        for (let i = 4; i < 65; i++) await addCharacter(i, "Long text ".repeat(24));
      },
    });
  },
});

sharing(
  "an anonymous recipient opens the copied link, downloads all formats and sees saved owner edits",
  async ({ page, context, browser, baseURL, app }) => {
    sharing.setTimeout(60_000);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/scripts/${app.id}/edit`);
    await page.getByRole("textbox", { name: "Script name" }).fill("Shared Alchemy");
    await page.getByRole("textbox", { name: "Author Credit" }).fill("The Collective");
    await expect(page.getByRole("status")).toContainText("All changes saved");
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Share link copied")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());

    const anonymous = await browser.newContext({
      baseURL: baseURL ?? "http://localhost:1338",
      viewport: { width: 375, height: 812 },
    });

    const recipient = await anonymous.newPage();

    try {
      await recipient.goto(link);
      await expect(recipient.getByRole("heading", { name: "Shared Alchemy" })).toBeVisible();
      await expect(recipient.getByText("By The Collective")).toBeVisible();
      await expect(recipient.getByText("Shared Script · Read only")).toBeVisible();
      await expect(
        recipient.getByText("Alchemist is not affiliated with The Pandemonium Institute."),
      ).toBeVisible();
      await expect(recipient.getByRole("textbox")).toHaveCount(0);
      await expect(recipient.getByRole("button", { name: "Copy link" })).toHaveCount(0);
      await expect(recipient.getByRole("button", { name: "Export JSON" })).toBeEnabled();
      await anonymous.grantPermissions(["clipboard-read", "clipboard-write"]);
      const viewer = recipient.getByRole("region", { name: "Sheets", exact: true });
      const jsonSection = recipient.getByRole("region", { name: "BOTC JSON", exact: true });
      expect(
        await viewer.evaluate(
          (node, jsonId) =>
            Boolean(
              node.compareDocumentPosition(document.getElementById(jsonId)?.parentElement ?? node) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          "json-title",
        ),
      ).toBe(true);
      await jsonSection.getByRole("button", { name: "Export JSON" }).click();
      await expect(recipient.getByRole("menuitem")).toHaveCount(2);
      await recipient.getByRole("menuitem", { name: "Copy JSON" }).click();
      await expect(recipient.getByText("JSON copied", { exact: true })).toBeVisible();
      const copied = await recipient.evaluate(() => navigator.clipboard.readText());

      const file = recipient.waitForEvent("download");
      await recipient.getByRole("button", { name: "Export JSON" }).focus();
      await recipient.keyboard.press("Enter");
      await recipient.getByRole("menuitem", { name: "Download JSON" }).focus();
      await recipient.keyboard.press("Enter");
      const jsonFile = await file;
      expect(jsonFile.suggestedFilename()).toBe("Shared-Alchemy.json");
      const document = JSON.parse(await readFile(await jsonFile.path(), "utf8"));
      expect(document[0]).toMatchObject({ name: "Shared Alchemy", author: "The Collective" });
      expect(document).toHaveLength(5);
      expect(JSON.parse(copied)).toEqual(document);

      const denied = await recipient.evaluate(async (id) => {
        const response = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/x-ndjson" },
          body: `{"_tag":"Request","id":"denied","tag":"Script.updateDetails","payload":${JSON.stringify({ id, name: "Tampered", authorCredit: "" })},"headers":[]}\n`,
        });

        return response.json();
      }, app.id);

      expect(denied.exit.cause[0].error._tag).toBe("AuthRejected");

      const other = await browser.newContext({
        baseURL: baseURL ?? "http://localhost:1338",
      });

      try {
        const otherPage = await other.newPage();
        await signIn(otherPage);
        await expect(
          callRpc(
            otherPage,
            "Script.updateDetails",
            {
              id: app.id,
              name: "Tampered",
              authorCredit: "",
            },
            OwnedScript,
          ),
        ).rejects.toThrow();
        expect(await callRpc(otherPage, "Script.listOwned", {}, Schema.Array(OwnedScript))).toEqual(
          [],
        );
      } finally {
        await other.close();
      }

      for (const label of ["Character sheet", "Night sheet"]) {
        const png = recipient.waitForEvent("download");
        await recipient.getByRole("button", { name: "Download PNG" }).click();
        await recipient.getByRole("menuitem", { name: label, exact: true }).click();
        const bytes = await readFile(await (await png).path());
        expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
        expect(bytes.readUInt32BE(16)).toBe(2550);
        expect(bytes.readUInt32BE(20)).toBe(3300);
      }

      expect(
        await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.getByRole("textbox", { name: "Script name" }).fill("Saved Alchemy");
      await expect(page.getByRole("status")).toContainText("All changes saved");
      await expect
        .poll(
          async () =>
            (
              await callRpc(
                page,
                "Script.readOwned",
                {
                  id: app.id,
                },
                OwnedScript,
              )
            ).name,
        )
        .toBe("Saved Alchemy");
      await recipient.reload();
      await expect(recipient.getByRole("heading", { name: "Saved Alchemy" })).toBeVisible();
      const updated = recipient.waitForEvent("download");
      await recipient.getByRole("button", { name: "Export JSON" }).click();
      await recipient.getByRole("menuitem", { name: "Download JSON" }).click();
      expect(JSON.parse(await readFile(await (await updated).path(), "utf8"))[0].name).toBe(
        "Saved Alchemy",
      );
      // No Script deletion API exists: do not simulate deletion by mutating D1.
      // Unknown public links are exercised separately below.
    } finally {
      await anonymous.close();
    }
  },
);

sharing("JSON blockers leave PNG downloads available", async ({ page, context, app }) => {
  await app.invalidate();
  await context.clearCookies();
  await page.goto(`/scripts/${app.id}`);
  await expect(page.getByRole("list", { name: "JSON validation problems" })).toContainText(
    "Ability",
  );
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  await page.getByRole("menuitem", { name: "Character sheet", exact: true }).click();
  expect((await file).suggestedFilename()).toBe("Untitled-Script-character.png");
});

sharing(
  "an overflowing Character sheet leaves valid JSON and the night sheet available",
  async ({ page, context, app }) => {
    await app.overflow();
    await context.clearCookies();
    await page.goto(`/scripts/${app.id}`);
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    const file = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG" }).click();
    await page.getByRole("menuitem", { name: "Both sheets", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "The Character sheet is too much" }),
    ).toBeVisible();
    expect((await file).suggestedFilename()).toBe("Untitled-Script-night.png");
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    const json = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    await page.getByRole("menuitem", { name: "Download JSON" }).click();
    expect(JSON.parse(await readFile(await (await json).path(), "utf8"))).toHaveLength(66);
  },
);

sharing(
  "failed sheet fonts leave JSON available and offer a PNG retry",
  async ({ page, context, app }) => {
    await context.clearCookies();
    await page.route("**/*.woff*", (route) => route.abort());
    await page.goto(`/scripts/${app.id}`);
    await page.getByRole("button", { name: "Download PNG" }).click();
    await page.getByRole("menuitem", { name: "Night sheet", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Sheet fonts didn’t load");
    const json = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    await page.getByRole("menuitem", { name: "Download JSON" }).click();
    expect((await json).suggestedFilename()).toBe("Untitled-Script.json");
    await page.unroute("**/*.woff*");
    const png = page.waitForEvent("download");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    expect((await png).suggestedFilename()).toBe("Untitled-Script-night.png");
  },
);

sharing(
  "a failed JSON request retries without hiding the public Script or PNG controls",
  async ({ page, context, app }) => {
    await context.clearCookies();
    await page.route(/\/api\/rpc\/?$/, (route) =>
      route.request().postDataJSON().tag === "Script.exportPublic"
        ? route.abort()
        : route.fallback(),
    );
    await page.goto(`/scripts/${app.id}`);
    await expect(page.getByRole("heading", { name: "Untitled Script" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PNG" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Retry JSON" })).toBeVisible();
    await page.unroute(/\/api\/rpc\/?$/);
    await page.getByRole("button", { name: "Retry JSON" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
  },
);

sharing(
  "public loading, transport retry and unknown links remain usable anonymously",
  async ({ page, context, app }) => {
    await context.clearCookies();
    let release = () => {};

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(/\/api\/rpc\/?$/, async (route) => {
      await gate;
      await route.fallback();
    });
    await page.goto(`/scripts/${app.id}`);
    await expect(page.getByRole("status").filter({ hasText: "Loading Script" })).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "Untitled Script" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    await page.unrouteAll({ behavior: "wait" });
    await page.route(/\/api\/rpc\/?$/, (route) => route.abort());
    await page.reload();
    await expect(
      page.getByRole("alert").filter({ hasText: "We couldn’t load this Script" }),
    ).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "Try again", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Untitled Script" })).toBeVisible();

    for (const id of ["missing", "00000000000000000000000000"]) {
      await page.goto(`/scripts/${id}`);
      await expect(page.getByRole("heading", { name: "Script not found" })).toBeVisible();
    }
  },
);
