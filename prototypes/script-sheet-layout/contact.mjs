// PROTOTYPE — contact sheet of every rendered PNG in out/<dir>/ (default chromium).
import { readdir } from "node:fs/promises";
import * as pw from "playwright";
import "./server.mjs";

const dir = process.argv[2] ?? "chromium";
const files = (await readdir(new URL(`./out/${dir}/`, import.meta.url))).filter((f) => /^(full|teensy)-[ABC]-(character|night)\.png$/.test(f));
const order = ["full", "teensy"].flatMap((s) => ["A", "B", "C"].flatMap((v) => ["character", "night"].map((k) => `${s}-${v}-${k}.png`)));
const cells = order.filter((f) => files.includes(f));
const html = `<body style="margin:0;background:#5d6168;font:600 18px system-ui;color:#fff">
<div style="display:grid;grid-template-columns:repeat(6,400px);gap:16px;padding:16px">
${cells.map((f) => `<figure style="margin:0"><figcaption>${f.replace(".png", "")}</figcaption><img src="/out/${dir}/${f}" style="width:400px;display:block"></figure>`).join("")}
</div></body>`;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 2512, height: 800 } });
await page.route("http://localhost:4173/contact", (r) => r.fulfill({ contentType: "text/html", body: html }));
await page.goto("http://localhost:4173/contact");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: new URL(`./out/${dir}/contact.jpg`, import.meta.url).pathname, fullPage: true, type: "jpeg", quality: 85 });
await browser.close();
process.exit(0);
