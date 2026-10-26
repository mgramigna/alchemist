import { expect, test } from "@playwright/test";

test("native Worker preserves OAuth-start configuration and secure login cookies", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/auth/google", { maxRedirects: 0 });
  expect(response.headers()["cache-control"]).toBe("no-store");

  expect(response.status()).toBe(303);
  const location = new URL(response.headers().location ?? "");
  expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(location.searchParams.get("redirect_uri")).toBe(
    new URL("/auth/google/callback", baseURL).href,
  );
  expect(location.searchParams.get("scope")).toBe("openid profile");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location.searchParams.get("code_challenge")).toHaveLength(43);
  const cookie = response.headers()["set-cookie"] ?? "";
  expect(cookie).toMatch(/^__Host-alchemist-login=[\w-]{43};/);

  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=600"])
    expect(cookie).toContain(attribute);
  expect(cookie).not.toMatch(/Domain=/i);
});

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
