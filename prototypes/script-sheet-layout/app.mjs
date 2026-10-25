// PROTOTYPE — throwaway renderer for the script sheet layout question (#14).
import { scripts, standardSteps, teams } from "./data.mjs";

const params = new URLSearchParams(location.search);
const opts = {
  variant: params.get("variant") ?? "A",
  script: params.get("script") ?? "full",
  page: params.get("page") ?? "letter",
  icons: params.get("icons") ?? "same",
  geo: params.get("geo") ?? "0",
};

const pages = { letter: [816, 1056], a4: [794, 1123] };
const DPI = 300;

const script = scripts[opts.script] ?? scripts.full;
const byId = new Map(script.characters.map((ch) => [ch.id, ch]));
const teamOf = new Map(teams.map((t) => [t.id, t]));

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);

const iconBase = opts.icons === "cross" ? `${location.protocol}//${location.hostname}:${Number(location.port) + 1}` : "";
const icon = (ch, cls = "icon") =>
  `<img class="${cls}" src="${iconBase}/icons/${ch.id}.svg?alignment=${teamOf.get(ch.team).alignment}" alt="" />`;

const stepGlyph = {
  dusk: `<svg viewBox="0 0 40 40"><path d="M26 6a14 14 0 1 0 8 22A12 12 0 0 1 26 6z" fill="#3b3f63"/></svg>`,
  dawn: `<svg viewBox="0 0 40 40"><circle cx="20" cy="24" r="8" fill="#d99a1e"/><g stroke="#d99a1e" stroke-width="3" stroke-linecap="round"><path d="M20 6v5M8 12l3.5 3.5M32 12l-3.5 3.5M4 24h5M31 24h5"/></g><path d="M2 33h36" stroke="#7a5a12" stroke-width="3"/></svg>`,
  minioninfo: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#7c1d1d"/><g fill="#f4ead2"><circle cx="13" cy="21" r="3.5"/><circle cx="20" cy="15" r="3.5"/><circle cx="27" cy="21" r="3.5"/></g></svg>`,
  demoninfo: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#4a0b0b"/><path d="M11 12l5 8h8l5-8-2 12a7 7 0 0 1-14 0z" fill="#f4ead2"/></svg>`,
};

const grouped = () =>
  teams
    .map((t) => ({ team: t, characters: script.characters.filter((ch) => ch.team === t.id) }))
    .filter((g) => g.characters.length > 0);

const nightEntries = (list, key) =>
  list.map((id, i) => {
    const step = standardSteps[id];
    if (step) return { kind: "step", id, n: i + 1, ...step };
    const ch = byId.get(id);
    return { kind: "character", id, n: i + 1, ch, text: ch[key] };
  });

const firstNight = () => nightEntries(script.firstNight, "firstNightInstructions");
const otherNight = () => nightEntries(script.otherNight, "otherNightInstructions");

const instruction = (text) =>
  text ? esc(text) : `<span class="blank">No instructions written</span>`;

const setupCounts = [
  [5, 3, 0, 1, 1],
  [6, 3, 1, 1, 1],
  [7, 5, 0, 1, 1],
  [8, 5, 1, 1, 1],
  [9, 5, 2, 1, 1],
  [10, 7, 0, 2, 1],
  [11, 7, 1, 2, 1],
  [12, 7, 2, 2, 1],
  [13, 9, 0, 3, 1],
  [14, 9, 1, 3, 1],
  [15, 9, 2, 3, 1],
];

const disclaimer = `Made with Alchemist · Not affiliated with The Pandemonium Institute`;

const jinxList = (cls) =>
  script.jinxes.length === 0
    ? ""
    : script.jinxes
        .map(
          (j) => `<div class="${cls}">
            <span class="jinx-icons">${icon(byId.get(j.a), "icon jinx-icon")}${icon(byId.get(j.b), "icon jinx-icon")}</span>
            <span class="jinx-text"><b>${esc(byId.get(j.a).name)} &amp; ${esc(byId.get(j.b).name)}:</b> ${esc(j.reason)}</span>
          </div>`,
        )
        .join("");

// ── Variant A: Classic ─────────────────────────────────────────────────────
// Parchment, gothic headings, each Team as a 2-column grid. Night sheet is
// First Night | Other Nights side by side, both upright.
const variantA = {
  name: "Classic",
  character: () => `
    <header class="a-head">
      <h1>${esc(script.name)}</h1>
      <p class="a-author">by ${esc(script.author)}</p>
    </header>
    <div class="a-body" data-fit>
      ${grouped()
        .map(
          ({ team, characters }) => `
        <section class="a-team ${team.alignment}">
          <h2><span>${team.label}</span></h2>
          <div class="a-grid">
            ${characters
              .map(
                (ch) => `<div class="a-char">${icon(ch)}<div><div class="a-name">${esc(ch.name)}</div><div class="a-ability">${esc(ch.ability)}</div></div></div>`,
              )
              .join("")}
          </div>
        </section>`,
        )
        .join("")}
      ${script.jinxes.length ? `<section class="a-team jinxes"><h2><span>Jinxes</span></h2>${jinxList("a-jinx")}</section>` : ""}
    </div>
    <footer class="a-foot">${disclaimer}</footer>`,
  night: () => {
    const col = (title, entries) => `
      <div class="a-night-col">
        <h2>${title}</h2>
        ${entries
          .map((e) =>
            e.kind === "step"
              ? `<div class="a-step step-${e.id}"><span class="glyph">${stepGlyph[e.id]}</span><div><div class="a-name">${e.name}</div><div class="a-instr">${esc(e.text)}</div></div></div>`
              : `<div class="a-nchar">${icon(e.ch, "icon small")}<div><div class="a-name">${esc(e.ch.name)}</div><div class="a-instr">${instruction(e.text)}</div></div></div>`,
          )
          .join("")}
      </div>`;
    return `
      <header class="a-head small"><h1>${esc(script.name)}</h1><p class="a-author">Night Order</p></header>
      <div class="a-night" data-fit>${col("First Night", firstNight())}${col("Other Nights", otherNight())}</div>
      <footer class="a-foot">${disclaimer}</footer>`;
  },
};

// ── Variant B: Alignment split ─────────────────────────────────────────────
// Dark title band; Good on the left, Evil (plus Travellers and Jinxes) on the
// right, Teams marked by vertical colour rails. Night sheet puts Other Nights
// upside down so a table can read both halves.
const variantB = {
  name: "Alignment split",
  character: () => {
    const groups = grouped();
    const rail = ({ team, characters }) => `
      <section class="b-team ${team.alignment}">
        <div class="b-rail"><span>${team.label}</span></div>
        <div class="b-list">
          ${characters
            .map(
              (ch) => `<div class="b-char">${icon(ch)}<div><div class="b-name">${esc(ch.name)}</div><div class="b-ability">${esc(ch.ability)}</div></div></div>`,
            )
            .join("")}
        </div>
      </section>`;
    const good = groups.filter((g) => g.team.alignment === "good");
    const rest = groups.filter((g) => g.team.alignment !== "good");
    return `
      <header class="b-head"><h1>${esc(script.name)}</h1><p>${esc(script.author)}</p></header>
      <div class="b-cols" data-fit>
        <div class="b-col">${good.map(rail).join("")}</div>
        <div class="b-col">
          ${rest.map(rail).join("")}
          ${script.jinxes.length ? `<section class="b-jinxes"><h3>Jinxes</h3>${jinxList("b-jinx")}</section>` : ""}
        </div>
      </div>
      <footer class="b-foot">${disclaimer}</footer>`;
  },
  night: () => {
    const half = (title, entries, flipped) => `
      <div class="b-half ${flipped ? "flipped" : ""}">
        <h2>${title}</h2>
        <div class="b-nlist" data-fit>
          ${entries
            .map((e) =>
              e.kind === "step"
                ? `<div class="b-step step-${e.id}"><span class="glyph">${stepGlyph[e.id]}</span><span class="b-sname">${e.name}</span><span class="b-stext">${esc(e.text)}</span></div>`
                : `<div class="b-nchar">${icon(e.ch, "icon small")}<div><span class="b-name">${esc(e.ch.name)}</span> <span class="b-instr">${instruction(e.text)}</span></div></div>`,
            )
            .join("")}
        </div>
      </div>`;
    return `
      <div class="b-night">
        ${half("First Night", firstNight(), false)}
        <div class="b-spine"><span>${esc(script.name)}</span></div>
        ${half("Other Nights", otherNight(), true)}
      </div>`;
  },
};

// ── Variant C: Token poster + night tables ─────────────────────────────────
// Print-economy black on white. Characters as centred token cells, setup
// table in the footer. Night sheet is two numbered tables, one per night.
const variantC = {
  name: "Token poster",
  character: () => `
    <header class="c-head"><h1>${esc(script.name)}</h1><p>by ${esc(script.author)}</p></header>
    <div class="c-body" data-fit>
      ${grouped()
        .map(
          ({ team, characters }) => `
        <section class="c-team ${team.alignment}">
          <h2>${team.label}</h2>
          <div class="c-grid">
            ${characters
              .map(
                (ch) => `<div class="c-cell">${icon(ch)}<div class="c-name">${esc(ch.name)}</div><div class="c-ability">${esc(ch.ability)}</div></div>`,
              )
              .join("")}
          </div>
        </section>`,
        )
        .join("")}
    </div>
    <footer class="c-foot">
      <table class="c-setup">
        <tr><th>Players</th>${setupCounts.map((r) => `<td>${r[0]}${r[0] === 15 ? "+" : ""}</td>`).join("")}</tr>
        <tr><th class="good">Townsfolk</th>${setupCounts.map((r) => `<td>${r[1]}</td>`).join("")}</tr>
        <tr><th class="good">Outsiders</th>${setupCounts.map((r) => `<td>${r[2]}</td>`).join("")}</tr>
        <tr><th class="evil">Minions</th>${setupCounts.map((r) => `<td>${r[3]}</td>`).join("")}</tr>
        <tr><th class="evil">Demons</th>${setupCounts.map((r) => `<td>${r[4]}</td>`).join("")}</tr>
      </table>
      <div class="c-jinxes">${script.jinxes.length ? `<h3>Jinxes</h3>${jinxList("c-jinx")}` : ""}</div>
      <p class="c-disclaimer">${disclaimer}</p>
    </footer>`,
  night: () => {
    const table = (title, entries) => `
      <section class="c-ntable">
        <h2>${title}</h2>
        <table>
          ${entries
            .map((e) =>
              e.kind === "step"
                ? `<tr class="c-step step-${e.id}"><td class="n">${e.n}</td><td class="g">${stepGlyph[e.id]}</td><td class="nm">${e.name}</td><td class="tx">${esc(e.text)}</td></tr>`
                : `<tr><td class="n">${e.n}</td><td class="g">${icon(e.ch, "icon small")}</td><td class="nm">${esc(e.ch.name)}</td><td class="tx">${instruction(e.text)}</td></tr>`,
            )
            .join("")}
        </table>
      </section>`;
    return `
      <header class="c-head"><h1>${esc(script.name)}</h1><p>Night Order</p></header>
      <div class="c-nbody" data-fit>${table("First Night", firstNight())}${table("Other Nights", otherNight())}</div>
      <footer class="c-foot slim"><p class="c-disclaimer">${disclaimer}</p></footer>`;
  },
};

const variants = { A: variantA, B: variantB, C: variantC };
const keys = Object.keys(variants);
const variant = variants[opts.variant] ?? variantA;

// ── Mount ──────────────────────────────────────────────────────────────────
const [pw, ph] = pages[opts.page] ?? pages.letter;
document.documentElement.style.setProperty("--page-w", `${pw}px`);
document.documentElement.style.setProperty("--page-h", `${ph}px`);
// Experiment: unhinted glyph advances so 1x layout matches the 300dpi raster.
if (opts.geo === "1") document.documentElement.classList.add("geo");

const stage = document.getElementById("stage");
stage.innerHTML = ["character", "night"]
  .map(
    (sheet) => `
    <figure class="frame">
      <figcaption>${sheet === "character" ? "Character sheet" : "Night sheet"} <span class="overflow-badge" data-for="${sheet}"></span></figcaption>
      <section class="sheet v-${opts.variant} ${sheet}" data-sheet="${sheet}">${variant[sheet]()}</section>
    </figure>`,
  )
  .join("");

const state = { lastExport: null, images: { ok: 0, failed: [] }, fonts: {} };

const measure = () =>
  Object.fromEntries(
    ["character", "night"].map((sheet) => {
      const node = document.querySelector(`[data-sheet="${sheet}"]`);
      const over = [...node.querySelectorAll("[data-fit]"), node]
        .map((el) => el.scrollHeight - el.clientHeight)
        .filter((d) => d > 1);
      return [sheet, over.length ? Math.max(...over) : 0];
    }),
  );

const renderState = () => {
  const overflow = measure();
  for (const [sheet, px] of Object.entries(overflow)) {
    const badge = document.querySelector(`.overflow-badge[data-for="${sheet}"]`);
    badge.textContent = px ? `OVERFLOW ${px}px` : "fits";
    badge.className = `overflow-badge ${px ? "bad" : "ok"}`;
  }
  const counts = grouped().map((g) => `${g.team.label} ${g.characters.length}`).join(" · ");
  document.getElementById("state").innerHTML = `
    <b>PROTOTYPE state</b>
    <dl>
      <dt>variant</dt><dd>${opts.variant} (${variant.name})</dd>
      <dt>script</dt><dd>${esc(script.name)} — ${counts}</dd>
      <dt>night</dt><dd>first ${script.firstNight.length} · other ${script.otherNight.length} entries</dd>
      <dt>page</dt><dd>${opts.page} ${pw}×${ph} css px → ${Math.round((pw * DPI) / 96)}×${Math.round((ph * DPI) / 96)} @${DPI}dpi</dd>
      <dt>icons</dt><dd>${opts.icons === "cross" ? "cross-origin :" + (Number(location.port) + 1) : "same-origin"} · ${state.images.ok} ok${state.images.failed.length ? ` · FAILED ${state.images.failed.join(", ")}` : ""}</dd>
      <dt>fonts</dt><dd>${Object.entries(state.fonts).map(([f, ok]) => `${ok ? "✓" : "✗"} ${f}`).join("<br>")}</dd>
      <dt>overflow</dt><dd>character ${overflow.character}px · night ${overflow.night}px</dd>
      <dt>export</dt><dd>${state.lastExport ?? "—"}</dd>
    </dl>`;
};

const families = ["Sorts Mill Goudy", "Pirata One", "Cinzel", "Libre Franklin", "Oswald"];

const ready = (async () => {
  await Promise.all(families.map((f) => document.fonts.load(`16px "${f}"`)));
  await document.fonts.ready;
  for (const f of families) state.fonts[f] = document.fonts.check(`16px "${f}"`);
  await Promise.all(
    [...document.querySelectorAll(".sheet img")].map((img) =>
      img.decode().then(
        () => state.images.ok++,
        () => state.images.failed.push(img.src.split("/").pop()),
      ),
    ),
  );
  renderState();
})();

const capture = async (sheet) => {
  await ready;
  const node = document.querySelector(`[data-sheet="${sheet}"]`);
  const t0 = performance.now();
  const dataUrl = await htmlToImage.toPng(node, { pixelRatio: DPI / 96, width: pw, height: ph });
  const ms = Math.round(performance.now() - t0);
  return { dataUrl, ms };
};

// Used by render.mjs.
window.__ready = ready.then(() => measure());
window.__capture = capture;

const exportAll = async () => {
  const results = [];
  for (const sheet of ["character", "night"]) {
    const { dataUrl, ms } = await capture(sheet);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${opts.script}-${opts.variant}-${sheet}.png`;
    a.click();
    results.push(`${sheet} ${ms}ms`);
  }
  state.lastExport = results.join(" · ");
  renderState();
};

// ── Floating switcher (prototype chrome, never part of the sheet) ─────────
const go = (patch) => {
  const next = new URLSearchParams({ ...opts, ...patch });
  location.search = next.toString();
};
const cycle = (dir) => go({ variant: keys[(keys.indexOf(opts.variant) + dir + keys.length) % keys.length] });

document.getElementById("switcher").innerHTML = `
  <button data-act="prev" title="Previous variant (←)">◀</button>
  <span class="label">${opts.variant} (${variant.name})</span>
  <button data-act="next" title="Next variant (→)">▶</button>
  <span class="sep"></span>
  <select data-opt="script"><option value="full">Full script</option><option value="teensy">Teensy script</option></select>
  <select data-opt="page"><option value="letter">US Letter</option><option value="a4">A4</option></select>
  <select data-opt="icons"><option value="same">Icons same-origin</option><option value="cross">Icons cross-origin</option></select>
  <button data-act="export">Export PNGs</button>`;
for (const sel of document.querySelectorAll("#switcher select")) {
  sel.value = opts[sel.dataset.opt];
  sel.addEventListener("change", () => go({ [sel.dataset.opt]: sel.value }));
}
document.querySelector('[data-act="prev"]').addEventListener("click", () => cycle(-1));
document.querySelector('[data-act="next"]').addEventListener("click", () => cycle(1));
document.querySelector('[data-act="export"]').addEventListener("click", exportAll);
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "ArrowLeft") cycle(-1);
  if (e.key === "ArrowRight") cycle(1);
});
