import {
  ArtworkSource,
  AuthoredTeam,
  Character,
  OwnedScript,
  PublicScript,
  pngDimensions,
} from "@alchemist/domain";
import { expect, test, type Page, type Route } from "@playwright/test";
import { Schema } from "effect";
import { callRpc, signIn } from "./support/api.ts";

const rpc = /\/api\/rpc\/?$/;

// The wire carries the original as base64.
const SourceWire = Schema.Struct({ ...ArtworkSource.fields, bytes: Schema.Uint8ArrayFromBase64 });

const NAMES: Record<AuthoredTeam, string> = {
  townsfolk: "Lamplighter",
  outsider: "Hermit",
  minion: "Forger",
  demon: "Wyrm",
  traveller: "Pilgrim",
};

// One Character per authored Team, created through the real API.
const seedScript = async (page: Page) => {
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

const readCharacter = async (page: Page, scriptId: string, name: string) => {
  const characters = await callRpc(page, "Character.list", { scriptId }, Schema.Array(Character));
  const character = characters.find((candidate) => candidate.name === name);

  if (!character) throw new Error(`Missing ${name}`);

  return character;
};

// Only transport failures are intercepted. Every successful request reaches the server.
const failRpcOnce = async (page: Page, tag: string) => {
  const handler = async (route: Route) => {
    if (route.request().postDataJSON().tag !== tag) return route.continue();
    await route.abort();
    await page.unroute(rpc, handler);
  };

  await page.route(rpc, handler);
};

type Sample = "lineart" | "ink" | "photo";

/** Renders the prototype's built-in samples (#13) to image files in the browser. */
const sampleFile = async (page: Page, sample: Sample) => {
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

const SAMPLE_FOR: Record<AuthoredTeam, Sample> = {
  townsfolk: "lineart",
  outsider: "lineart",
  minion: "ink",
  demon: "photo",
  traveller: "lineart",
};

const selectCharacter = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Script sections" }).getByRole("button", { name }).click();

const openCharacter = async (page: Page, scriptId: string, name: string) => {
  await page.goto(`/scripts/${scriptId}/edit`);
  await selectCharacter(page, name);

  return page.getByRole("region", { name: "Icon" });
};

const variantImages = (icon: ReturnType<Page["getByRole"]>) =>
  icon.getByRole("list", { name: "Icon variants" }).locator("img");

const upload = async (page: Page, sample: Sample) => {
  const file = await sampleFile(page, sample);
  await page.locator('input[type="file"]').setInputFiles(file);

  return file;
};

test("line art, ink on paper and a photo are cut out, styled, stored and published", async ({
  page,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  const icon = await openCharacter(page, scriptId, NAMES.townsfolk);
  await expect(icon).toContainText("Generic icons follow the Team");

  const expected: Record<Sample, { note: string; auto: string }> = {
    lineart: { note: "kept the image’s own transparency", auto: "Auto (Solid)" },
    ink: { note: "removed the light paper behind the drawing", auto: "Auto (Solid)" },
    photo: {
      note: "removed the backdrop by flooding in from the edges",
      auto: "Auto (Pale lines)",
    },
  };

  const published: Array<string> = [];

  for (const sample of ["lineart", "ink", "photo"] as const) {
    const before = (await readCharacter(page, scriptId, NAMES.townsfolk)).artwork?.sourceId;
    const file = await upload(page, sample);
    await expect(icon).toContainText(`Automatic cutout: ${expected[sample].note}.`);
    await expect(icon.getByRole("radio", { name: expected[sample].auto })).toBeChecked();
    await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
    await icon.screenshot({ path: info.outputPath(`townsfolk-${sample}.png`) });

    const saved = await readCharacter(page, scriptId, NAMES.townsfolk);
    expect(saved.artwork?.sourceId).not.toBe(before);
    expect(saved.artwork?.style).toEqual({ look: "auto" });
    expect(saved.artwork?.variants.map(({ variant }) => variant)).toEqual(["regular", "flipped"]);
    published.push(...(saved.artwork?.variants.map(({ path }) => path) ?? []));

    // The owner's private original is the uploaded file, byte for byte.
    const source = await callRpc(
      page,
      "Artwork.readSource",
      { scriptId, id: saved.id },
      SourceWire,
    );

    expect(Buffer.from(source.bytes).equals(file.buffer)).toBe(true);
  }

  // Every published variant, including replaced ones, stays public, immutable and 400×400.
  for (const path of published) {
    const response = await page.request.get(path, { headers: { Origin: "https://botc.app" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(pngDimensions(new Uint8Array(await response.body()))).toEqual({
      width: 400,
      height: 400,
    });
  }

  // Viewers see the published variants, never the original.
  const current = await readCharacter(page, scriptId, NAMES.townsfolk);
  const viewed = await callRpc(page, "Script.readPublic", { id: scriptId }, PublicScript);
  expect(viewed.characters.find(({ id }) => id === current.id)?.artwork?.variants).toEqual(
    current.artwork?.variants,
  );
  expect(JSON.stringify(viewed)).not.toContain(current.artwork?.sourceId ?? "missing");

  await page.reload();
  await selectCharacter(page, NAMES.townsfolk);
  await expect(variantImages(icon).first()).toHaveAttribute(
    "src",
    current.artwork?.variants[0]?.path ?? "missing",
  );
  await expect(
    page.getByRole("complementary", { name: "Preview" }).locator('img[src^="/artwork/"]'),
  ).toHaveCount(1);
});

test("every Team publishes its variant set; Travellers get unaligned, Good and Evil", async ({
  page,
}, info) => {
  await signIn(page);
  const scriptId = await seedScript(page);

  for (const team of AuthoredTeam.literals) {
    const icon = await openCharacter(page, scriptId, NAMES[team]);
    await upload(page, SAMPLE_FOR[team]);
    await expect(variantImages(icon)).toHaveCount(team === "traveller" ? 3 : 2);
    await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);
    await icon
      .getByRole("list", { name: "Icon variants" })
      .screenshot({ path: info.outputPath(`team-${team}.png`) });

    const saved = await readCharacter(page, scriptId, NAMES[team]);
    expect(saved.artwork?.team).toBe(team);
    expect(saved.artwork?.variants.map(({ variant }) => variant)).toEqual(
      team === "traveller" ? ["unaligned", "good", "evil"] : ["regular", "flipped"],
    );
  }
});

test("Look changes by keyboard, Team changes replay the saved Look, and failures keep prior icons", async ({
  page,
}) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  const icon = await openCharacter(page, scriptId, NAMES.townsfolk);
  await upload(page, "photo");
  const auto = icon.getByRole("radio", { name: "Auto (Pale lines)" });
  await expect(auto).toBeChecked();
  const uploaded = await readCharacter(page, scriptId, NAMES.townsfolk);

  await auto.focus();
  await page.keyboard.press("ArrowRight");
  await expect(icon.getByRole("radio", { name: "Solid" })).toBeChecked();
  await expect(variantImages(icon).first()).not.toHaveAttribute(
    "src",
    uploaded.artwork?.variants[0]?.path ?? "",
  );
  const solid = await readCharacter(page, scriptId, NAMES.townsfolk);
  expect(solid.artwork?.style).toEqual({ look: "solid" });
  expect(solid.artwork?.sourceId).toBe(uploaded.artwork?.sourceId);

  // A failed restyle keeps the current icons and offers a retry.
  await failRpcOnce(page, "Artwork.restyle");
  await icon.getByRole("radio", { name: "Solid" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(icon.getByRole("alert")).toContainText("Your previous icons are kept");
  await expect(variantImages(icon).first()).toHaveAttribute(
    "src",
    solid.artwork?.variants[0]?.path ?? "",
  );
  await expect(icon.getByRole("radio", { name: "Solid" })).toBeChecked();
  await icon.getByRole("button", { name: "Try again" }).click();
  await expect(icon.getByRole("radio", { name: "Shaded" })).toBeChecked();

  // Changing Team restyles from the retained original with the saved Look.
  await page.getByRole("combobox", { name: "Team" }).click();
  await page.getByRole("option", { name: "Minion" }).click();
  await expect(icon.getByRole("status")).toHaveText("Restyling for Minion…");
  await expect(icon.getByRole("status")).toBeHidden();

  await expect
    .poll(async () => {
      const saved = await readCharacter(page, scriptId, NAMES.townsfolk);

      return { team: saved.team, artwork: saved.artwork?.team, look: saved.artwork?.style.look };
    })
    .toEqual({ team: "minion", artwork: "minion", look: "shaded" });
  const moved = await readCharacter(page, scriptId, NAMES.townsfolk);
  expect(moved.ability).toBe("Ability");
  expect(moved.artwork?.sourceId).toBe(uploaded.artwork?.sourceId);

  // Generic icons remain available at any time.
  await icon.getByRole("button", { name: "Use generic icons" }).click();
  await expect(variantImages(icon).first()).toHaveAttribute("src", /\/icons\/generic\/v1\//);
  await expect
    .poll(async () => (await readCharacter(page, scriptId, NAMES.townsfolk)).artwork)
    .toBeUndefined();
});

test("a failed upload keeps generic icons and retries; the editor fits a narrow screen", async ({
  page,
}) => {
  await signIn(page);
  const scriptId = await seedScript(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const icon = await openCharacter(page, scriptId, NAMES.outsider);
  await failRpcOnce(page, "Artwork.upload");
  await upload(page, "lineart");
  await expect(icon.getByRole("alert")).toContainText("Your previous icons are unchanged");
  await expect(variantImages(icon).first()).toHaveAttribute("src", /\/icons\/generic\/v1\//);
  expect((await readCharacter(page, scriptId, NAMES.outsider)).artwork).toBeUndefined();
  await icon.getByRole("button", { name: "Try again" }).click();
  await expect(variantImages(icon).first()).toHaveAttribute("src", /^\/artwork\//);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);

  // Non-images are refused before anything is sent.
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(icon.getByRole("alert")).toContainText("Use a PNG, JPEG, WebP or GIF image.");
});
