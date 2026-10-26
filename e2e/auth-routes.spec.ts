import { expect, test } from "@playwright/test";
import { Schema } from "effect";
import { User } from "@alchemist/domain";
import { callRpc } from "./support/api.ts";

const localCode = Schema.Struct({
  sub: Schema.String,
  name: Schema.String,
  nonce: Schema.String,
  challenge: Schema.String,
});

test("native Worker starts a real persisted login flow with secure cookies", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/auth/google", { maxRedirects: 0 });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.status()).toBe(303);
  const location = new URL(response.headers().location ?? "");
  expect(location.origin + location.pathname).toBe(new URL("/auth/google/callback", baseURL).href);
  expect(location.searchParams.get("state")).toHaveLength(43);

  const code = Schema.decodeUnknownSync(Schema.fromJsonString(localCode))(
    location.searchParams.get("code"),
  );

  expect(code.nonce).toHaveLength(43);
  expect(code.challenge).toHaveLength(43);
  const cookie = response.headers()["set-cookie"] ?? "";
  expect(cookie).toMatch(/^__Host-alchemist-login=[\w-]{43};/);

  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=600"])
    expect(cookie).toContain(attribute);
  expect(cookie).not.toMatch(/Domain=/i);
});

test("the sign-in link completes a real session, survives reload, and sign-out revokes it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Local Alchemist" })).toBeVisible();
  await page.reload();
  expect(await callRpc(page, "Account.current", {}, Schema.NullOr(User))).toMatchObject({
    displayName: "Local Alchemist",
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await callRpc(page, "Account.current", {}, Schema.NullOr(User))).toBeNull();
});

test("login callbacks reject a missing browser cookie and cannot replay a consumed flow", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  const start = await page.context().request.get("/auth/google", { maxRedirects: 0 });
  const callback = start.headers().location ?? "";

  const stranger = await browser.newContext({
    baseURL: baseURL ?? "http://localhost:1338",
  });

  try {
    const rejected = await stranger.request.get(callback, { maxRedirects: 0 });
    expect(rejected.status()).toBe(400);
  } finally {
    await stranger.close();
  }

  await page.goto(callback);
  await expect(page.getByRole("heading", { name: "Welcome back, Local Alchemist" })).toBeVisible();
  const replay = await page.context().request.get(callback, { maxRedirects: 0 });
  expect(replay.status()).toBe(400);
});

for (const field of ["nonce", "challenge"] as const) {
  test(`login callbacks reject a mismatched ${field}`, async ({ page }) => {
    await page.goto("/");
    const start = await page.context().request.get("/auth/google", { maxRedirects: 0 });
    const callback = new URL(start.headers().location ?? "");

    const code = Schema.decodeUnknownSync(Schema.fromJsonString(localCode))(
      callback.searchParams.get("code"),
    );

    callback.searchParams.set("code", JSON.stringify({ ...code, [field]: "wrong" }));
    const response = await page.context().request.get(callback.href, { maxRedirects: 0 });
    expect(response.status()).toBe(400);
    expect(await callRpc(page, "Account.current", {}, Schema.NullOr(User))).toBeNull();
  });
}

test("native Worker rejects cross-origin sign-out and preserves session-clearing cookie flags", async ({
  request,
  baseURL,
}) => {
  const blocked = await request.post("/auth/sign-out", {
    headers: { Origin: "https://evil.test" },
    maxRedirects: 0,
  });

  expect(blocked.status()).toBe(403);

  const response = await request.post("/auth/sign-out", {
    headers: { Origin: new URL(baseURL ?? "").origin },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/");
  const cookie = response.headers()["set-cookie"] ?? "";
  expect(cookie).toMatch(/^__Host-alchemist-session=;/);

  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=0"])
    expect(cookie).toContain(attribute);
  expect(cookie).not.toMatch(/Domain=/i);
});
