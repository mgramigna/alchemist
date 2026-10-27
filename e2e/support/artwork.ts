import { ArtworkSource, AuthoredTeam, Character, OwnedScript } from "@alchemist/domain";
import { type Page, type Route } from "@playwright/test";
import { Schema } from "effect";
import { callRpc } from "./api.ts";

export const rpc = /\/api\/rpc\/?$/;

// The wire carries the original as base64.
export const SourceWire = Schema.Struct({
  ...ArtworkSource.fields,
  bytes: Schema.Uint8ArrayFromBase64,
});

export const NAMES: Record<AuthoredTeam, string> = {
  townsfolk: "Lamplighter",
  outsider: "Hermit",
  minion: "Forger",
  demon: "Wyrm",
  traveller: "Pilgrim",
};

// One Character per authored Team, created through the real API.
export const seedScript = async (page: Page) => {
  const script = await callRpc(page, "Script.create", {}, OwnedScript);

  for (const team of AuthoredTeam.literals) {
    const character = await callRpc(
      page,
      "Character.create",
      { scriptId: script.id, team, nights: [] },
      Character,
    );

    await callRpc(
      page,
      "Character.update",
      {
        scriptId: script.id,
        id: character.id,
        name: NAMES[team],
        ability: "Ability",
        team,
        reminders: [],
        remindersGlobal: [],
        setup: false,
        flavor: "",
        firstNightInstructions: "",
        otherNightInstructions: "",
      },
      Character,
    );
  }

  return script.id;
};

export const readCharacter = async (page: Page, scriptId: string, name: string) => {
  const characters = await callRpc(page, "Character.list", { scriptId }, Schema.Array(Character));
  const character = characters.find((candidate) => candidate.name === name);

  if (!character) throw new Error(`Missing ${name}`);

  return character;
};

// Only transport failures are intercepted. Every successful request reaches the server.
export const failRpcOnce = async (page: Page, tag: string) => {
  const handler = async (route: Route) => {
    if (route.request().postDataJSON().tag !== tag) return route.continue();
    await route.abort();
    await page.unroute(rpc, handler);
  };

  await page.route(rpc, handler);
};

export type Sample = "lineart" | "ink" | "photo";

/** Renders the prototype's built-in samples (#13) to image files in the browser. */
export const sampleFile = async (page: Page, sample: Sample) => {
  const base64 = await page.evaluate(async (kind) => {
    const chalice = (paper: boolean) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 200 200">${
        paper
          ? '<rect width="200" height="200" fill="#f5f0e1"/><circle cx="36" cy="160" r="18" fill="#ebe3cf"/><circle cx="168" cy="38" r="12" fill="#ece5d2"/>'
          : ""
      }<g fill="#1f1b18"><path fill-rule="evenodd" d="M50 42 H150 Q150 112 100 122 Q50 112 50 42 Z M100 64 L114 84 L100 104 L86 84 Z"/><rect x="92" y="120" width="16" height="42"/><path d="M58 182 Q60 160 100 158 Q140 160 142 182 Z"/><circle cx="100" cy="24" r="9"/></g><g stroke="#cfc6b0" stroke-width="3" fill="none"><path d="M57 54 H143"/><path d="M66 176 Q100 166 134 176"/><path d="M62 70 Q66 98 90 110"/></g></svg>`;

    const apple = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 200 200"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe7ee"/><stop offset="1" stop-color="#aab8c4"/></linearGradient><radialGradient id="ap" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#ff8a80"/><stop offset=".5" stop-color="#d32f2f"/><stop offset="1" stop-color="#5d0f0f"/></radialGradient></defs><rect width="200" height="200" fill="url(#bg)"/><ellipse cx="100" cy="182" rx="60" ry="8" fill="#8e9ba6" opacity=".6"/><ellipse cx="100" cy="118" rx="58" ry="55" fill="url(#ap)"/><path d="M100 66 q4 -22 14 -30" stroke="#4e342e" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M108 54 q30 -20 46 -6 q-22 22 -46 6z" fill="#4caf50"/><ellipse cx="80" cy="96" rx="10" ry="16" fill="#fff" opacity=".5"/></svg>`;

    const svg = kind === "photo" ? apple : chalice(kind === "ink");
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const context = canvas.getContext("2d");
    context?.drawImage(image, 0, 0);

    // Sensor-like grain, so the photo is not a perfectly flat vector render.
    if (kind === "photo" && context) {
      const pixels = context.getImageData(0, 0, 600, 600);

      for (let i = 0; i < pixels.data.length; i += 4) {
        const grain = (Math.sin(i * 12.9898) * 43758.5453) % 1;

        for (let k = 0; k < 3; k++) pixels.data[i + k] = (pixels.data[i + k] ?? 0) + grain * 6;
      }

      context.putImageData(pixels, 0, 0);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, kind === "lineart" ? "image/png" : "image/jpeg", 0.9),
    );

    const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0));

    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  }, sample);

  return {
    name: sample === "lineart" ? `${sample}.png` : `${sample}.jpg`,
    mimeType: sample === "lineart" ? "image/png" : "image/jpeg",
    buffer: Buffer.from(base64, "base64"),
  };
};

export const SAMPLE_FOR: Record<AuthoredTeam, Sample> = {
  townsfolk: "lineart",
  outsider: "lineart",
  minion: "ink",
  demon: "photo",
  traveller: "lineart",
};

export const selectCharacter = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Script sections" }).getByRole("button", { name }).click();

export const openCharacter = async (page: Page, scriptId: string, name: string) => {
  await page.goto(`/scripts/${scriptId}/edit`);
  await selectCharacter(page, name);

  return page.getByRole("region", { name: "Icon" });
};

export const variantImages = (icon: ReturnType<Page["getByRole"]>) =>
  icon.getByRole("list", { name: "Icon variants" }).locator("img");

export const upload = async (page: Page, sample: Sample) => {
  const file = await sampleFile(page, sample);
  await page.locator('input[type="file"]').setInputFiles(file);

  return file;
};
