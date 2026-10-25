// PROTOTYPE — side-by-side crop of B night sheet per capture engine.
import * as pw from "playwright";
const root = "/home/mg/.t3/worktrees/alchemist/t3-c98456b8/prototypes/script-sheet-layout/";
const sheet = process.argv[3] ?? "night";
const shots = [
  ["native Chromium (~ Browser Rendering)", `out/chromium-dsf3.125/full-B-${sheet}.native.png`],
  ["html-to-image", `out/chromium/full-B-${sheet}.png`],
  ["modern-screenshot", `out/chromium-modern-screenshot/full-B-${sheet}.png`],
  ["SnapDOM", `out/chromium-snapdom/full-B-${sheet}.png`],
];
// crop: First Night column, Tincturer..Dawn rows (css px 0..400 x 190..520) at 300dpi
const [x, y, w, h] = (process.argv[2] ?? "0,190,400,330").split(",").map(Number);
const outName = process.argv[4] ?? "engine-compare";
const html = `<body style="margin:0;background:#333;font:600 20px system-ui;color:#fff;display:flex;gap:12px;padding:12px">
${shots.map(([t, f]) => `<div><div>${t}</div><div style="width:${w * 1.5}px;height:${h * 1.5}px;background:url('/${f}') -${x * 1.5}px -${y * 1.5}px / ${816 * 1.5}px auto no-repeat #fff"></div></div>`).join("")}
</body>`;
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 4 * w * 1.5 + 70, height: h * 1.5 + 60 } });
await p.route("http://localhost:4173/compare", (r) => r.fulfill({ contentType: "text/html", body: html }));
await p.goto("http://localhost:4173/compare");
await p.waitForTimeout(500);
await p.screenshot({ path: root + `out/chromium/${outName}.jpg`, type: "jpeg", quality: 85 });
await b.close();
