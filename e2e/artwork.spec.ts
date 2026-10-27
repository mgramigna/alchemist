import { AuthoredTeam, PublicScript, pngDimensions } from "@alchemist/domain";
import { expect, test } from "@playwright/test";
import { callRpc, signIn } from "./support/api.ts";
import {
  NAMES,
  SAMPLE_FOR,
  SourceWire,
  failRpcOnce,
  openCharacter,
  readCharacter,
  seedScript,
  selectCharacter,
  upload,
  variantImages,
  type Sample,
} from "./support/artwork.ts";

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
