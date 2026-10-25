// PROTOTYPE — renders every variant × script to PNG through the page's own
// html-to-image capture (the in-browser DOM capture path from #5).
//   node render.mjs [--browser chromium|firefox|webkit] [--icons same|cross] [--native]
// --native also saves a Playwright element screenshot for fidelity comparison.
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as pw from "playwright";
import "./server.mjs";

const { values: args } = parseArgs({
  options: {
    browser: { type: "string", default: "chromium" },
    icons: { type: "string", default: "same" },
    page: { type: "string", default: "letter" },
    native: { type: "boolean", default: false },
    geo: { type: "string", default: "0" },
    dsf: { type: "string", default: "1" },
    variants: { type: "string", default: "A,B,C" },
    scripts: { type: "string", default: "full,teensy" },
  },
});

const suffix = `${args.icons === "cross" ? "-cross" : ""}${args.geo === "1" ? "-geo" : ""}${args.dsf !== "1" ? `-dsf${args.dsf}` : ""}`;
const outDir = new URL(`./out/${args.browser}${suffix}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await pw[args.browser].launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: Number(args.dsf) });
page.on("pageerror", (e) => console.error("pageerror:", e.message));

for (const script of args.scripts.split(",")) {
  for (const variant of args.variants.split(",")) {
    const qs = new URLSearchParams({ variant, script, page: args.page, icons: args.icons, geo: args.geo });
    await page.goto(`http://localhost:4173/?${qs}`);
    const overflow = await page.evaluate(() => window.__ready);
    const state = await page.locator("#state").innerText();
    const failed = state.match(/FAILED.*/)?.[0];
    for (const sheet of ["character", "night"]) {
      const { dataUrl, ms } = await page.evaluate((s) => window.__capture(s), sheet);
      const name = `${script}-${variant}-${sheet}`;
      const png = Buffer.from(dataUrl.split(",")[1], "base64");
      await writeFile(new URL(`${name}.png`, outDir), png);
      if (args.native) {
        await page.locator(`[data-sheet="${sheet}"]`).screenshot({ path: new URL(`${name}.native.png`, outDir).pathname });
      }
      console.log(
        `${args.browser} ${name}: ${ms}ms, ${(png.length / 1024).toFixed(0)} KiB, overflow ${overflow[sheet]}px${failed ? ` ${failed}` : ""}`,
      );
    }
  }
}

await browser.close();
process.exit(0);
