// PROTOTYPE static server for the script sheet layout prototype.
// Port 4173 serves the page; port 4174 serves the same icons cross-origin
// (with CORS) so `?icons=cross` exercises the R2-like case.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const colors = {
  good: ["#1d5fae", "#0c3566"],
  evil: ["#a3171d", "#5c0a0d"],
};

// Generic token art: a deterministic sigil per Character id, coloured by
// alignment. Stands in for the generic tokens decided in #8.
const tokenSvg = (id, alignment) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const points = 3 + (h % 6);
  const inner = 0.38 + ((h >> 4) % 20) / 100;
  const rot = (h >> 9) % 360;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 40 : 40 * inner;
    const a = (Math.PI * i) / points + (rot * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  const fill =
    alignment === "none"
      ? "url(#split)"
      : alignment === "evil"
        ? colors.evil[0]
        : colors.good[0];
  const stroke = alignment === "evil" ? colors.evil[1] : colors.good[1];
  const ring = (h >> 13) % 2 === 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <defs><linearGradient id="split" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0.5" stop-color="${colors.good[0]}"/><stop offset="0.5" stop-color="${colors.evil[0]}"/>
  </linearGradient></defs>
  ${ring ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="6 4"/>` : ""}
  <polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="${(9 + (h % 5)).toFixed(0)}" fill="#f4ead2" stroke="${stroke}" stroke-width="2"/>
</svg>`;
};

const handler = (cors) => async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (cors) res.setHeader("Access-Control-Allow-Origin", "*");
  const icon = url.pathname.match(/^\/icons\/([a-z0-9]+)\.svg$/);
  if (icon) {
    res.writeHead(200, { "Content-Type": types[".svg"], "Cache-Control": "no-store" });
    res.end(tokenSvg(icon[1], url.searchParams.get("alignment") ?? "good"));
    return;
  }
  if (cors) {
    res.writeHead(404).end();
    return;
  }
  const path =
    url.pathname === "/vendor/html-to-image.js"
      ? join(root, "node_modules/html-to-image/dist/html-to-image.js")
      : join(root, normalize(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!path.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
};

// Reuse an already-running server (render.mjs imports this file).
const listen = (server, p) =>
  server.on("error", (e) => e.code !== "EADDRINUSE" && console.error(e)).listen(p);
listen(createServer(handler(false)), port);
listen(createServer(handler(true)), port + 1);
console.log(`Script sheet prototype: http://localhost:${port}/?variant=A`);
