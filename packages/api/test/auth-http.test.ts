import { AuthRejected } from "@alchemist/domain";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { Auth, SESSION_SECONDS } from "../src/auth.ts";
import { FLOW_COOKIE, SESSION_COOKIE, handleAuth, readCookie } from "../src/auth-http.ts";

const auth = Layer.mock(Auth, {
  callback: (state, browser, code) =>
    state === "state" && browser === "browser" && code === "code"
      ? Effect.succeed("session-token")
      : Effect.fail(new AuthRejected({})),
});

const callback = (query: string) =>
  Effect.runPromise(
    handleAuth(
      new Request(`https://alchemist.test/auth/google/callback?${query}`, {
        headers: { Cookie: `${FLOW_COOKIE}=browser` },
      }),
    ).pipe(Effect.provide(auth)),
  );

test("callback sets a fixed-lifetime host-only secure session, clears pending cookie, and redirects home", async () => {
  const response = await callback("state=state&code=code");
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe("/");
  expect(response.headers.getSetCookie()).toEqual([
    `${FLOW_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    `${SESSION_COOKIE}=session-token; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
  ]);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});

test("callback rejects duplicate/missing/error query parameters and invalid flows without a session", async () => {
  for (const query of [
    "state=state&code=wrong",
    "state=state&state=other&code=code",
    "state=state&code=code&code=other",
    "code=code",
    "state=state&error=access_denied",
  ]) {
    const response = await callback(query);
    expect(response.status).toBe(400);
    expect(response.headers.getSetCookie()).toEqual([
      `${FLOW_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    ]);
  }

  expect(readCookie(`${SESSION_COOKIE}=a; ${SESSION_COOKIE}=b`, SESSION_COOKIE)).toBeNull();
});
