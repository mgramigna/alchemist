// PROTOTYPE — pixel-diff each capture engine's B sheets against a native Chromium screenshot at 300dpi.
// Reports the share of pixels that differ strongly and the y-bands (css px) where differences cluster.
import * as pw from "playwright";
import "./server.mjs";

const variant = process.argv[2] ?? "B";
const ref = (s) => `/out/chromium-dsf3.125/full-${variant}-${s}.native.png`;
const engines = {
  "html-to-image": (s) => `/out/chromium/full-${variant}-${s}.png`,
  "modern-screenshot": (s) => `/out/chromium-modern-screenshot/full-${variant}-${s}.png`,
  snapdom: (s) => `/out/chromium-snapdom/full-${variant}-${s}.png`,
};
const b = await pw.chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:4173/");
for (const sheet of ["character", "night"]) {
  for (const [name, f] of Object.entries(engines)) {
    const r = await p.evaluate(async ([a, c]) => {
      const load = async (u) => {
        const img = new Image();
        img.src = u;
        await img.decode();
        const cv = new OffscreenCanvas(2550, 3300);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 2550, 3300);
        ctx.drawImage(img, 0, 0, 2550, 3300);
        return ctx.getImageData(0, 0, 2550, 3300).data;
      };
      const [x, y] = await Promise.all([load(a), load(c)]);
      let diff = 0;
      const rows = new Uint32Array(3300);
      for (let i = 0; i < x.length; i += 4) {
        const d = Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
        if (d > 150) {
          diff++;
          rows[(i / 4 / 2550) | 0]++;
        }
      }
      const bands = [];
      for (let yy = 0; yy < 3300; yy++) {
        if (rows[yy] > 40) {
          const css = Math.round(yy / 3.125);
          if (!bands.length || css - bands.at(-1)[1] > 4) bands.push([css, css]);
          else bands.at(-1)[1] = css;
        }
      }
      return { pct: ((diff / (2550 * 3300)) * 100).toFixed(3), bands: bands.map(([s, e]) => `${s}-${e}`).join(" ") };
    }, [ref(sheet), f(sheet)]);
    console.log(`${variant} ${sheet} ${name}: ${r.pct}% strong diff; bands(css px): ${r.bands || "none"}`);
  }
}
await b.close();
process.exit(0);
