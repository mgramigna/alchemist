import { ScriptId } from "@alchemist/domain";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { AppConfig, handleRequest } from "../src/app.ts";
import { Auth, hashToken } from "../src/auth.ts";
import { FLOW_COOKIE, SESSION_COOKIE } from "../src/auth-http.ts";
import { Scripts } from "../src/scripts.ts";
import { asUser, authFixture, signIn } from "./support/auth.ts";

const origin = "https://alchemist.test";
const config = Layer.succeed(AppConfig, { origin });
const unusedScripts = Layer.mock(Scripts, {});

const account = (
  token: string | null,
  tag = "Account.current",
  payload: { readonly displayName: string } | null = null,
) => {
  const headers = new Headers({ Origin: origin, "Content-Type": "application/x-ndjson" });

  if (token) headers.set("Cookie", `${SESSION_COOKIE}=${token}`);

  return handleRequest(
    new Request(`${origin}/api/rpc/`, {
      method: "POST",
      headers,
      body: `{"_tag":"Request","id":"1","tag":${JSON.stringify(tag)},"payload":${JSON.stringify(payload)},"headers":[]}\n`,
    }),
  );
};

it.effect(
  "HTTP RPC isolates concurrent identities, serializes renames and invalidates only the signed-out browser",
  () =>
    Effect.gen(function* () {
      const f = yield* authFixture;
      yield* Effect.gen(function* () {
        const alice = yield* signIn("alice");
        const secondAlice = yield* signIn("alice");
        const bob = yield* signIn("bob");
        const auth = yield* Auth;
        yield* auth.rename("Alice").pipe(asUser(alice));
        yield* auth.rename("Bob").pipe(asUser(bob));

        const responses = yield* Effect.forEach(
          [alice, bob, null],
          (token) =>
            account(token).pipe(
              Effect.flatMap((response) => Effect.promise(() => response.json())),
            ),
          { concurrency: "unbounded" },
        );

        assert.strictEqual(responses[0].exit.value.displayName, "Alice");
        assert.strictEqual(responses[1].exit.value.displayName, "Bob");
        assert.isNull(responses[2].exit.value);
        const renamed = yield* account(alice, "Account.rename", { displayName: "Edited over RPC" });
        assert.strictEqual(renamed.headers.get("Cache-Control"), "no-store");
        assert.strictEqual(
          (yield* Effect.promise(() => renamed.json())).exit.value.displayName,
          "Edited over RPC",
        );

        const logout = yield* handleRequest(
          new Request(`${origin}/auth/sign-out`, {
            method: "POST",
            headers: { Origin: origin, Cookie: `${SESSION_COOKIE}=${alice}` },
          }),
        );

        assert.strictEqual(logout.status, 303);
        assert.include(logout.headers.get("Set-Cookie") ?? "", "Max-Age=0");
        const signedOut = yield* account(alice);
        assert.isNull((yield* Effect.promise(() => signedOut.json())).exit.value);
        const stillSignedIn = yield* account(secondAlice);
        assert.strictEqual(
          (yield* Effect.promise(() => stillSignedIn.json())).exit.value.displayName,
          "Edited over RPC",
        );
        const denied = yield* account(alice, "Account.rename", { displayName: "Denied" });
        assert.strictEqual((yield* Effect.promise(() => denied.json())).exit._tag, "Failure");
      }).pipe(Effect.provide([f.layer, config, unusedScripts]));
    }),
);

it.effect(
  "HTTP OAuth binds PKCE/nonce to the browser, uses secure cookies, rejects missing state and completes a controlled sign-in",
  () =>
    Effect.gen(function* () {
      const f = yield* authFixture;
      yield* Effect.gen(function* () {
        const response = yield* handleRequest(new Request(`${origin}/auth/google`));
        assert.strictEqual(response.status, 303);
        const location = new URL(response.headers.get("Location") ?? "");
        const state = location.searchParams.get("state") ?? "";
        const pending = f.flows.get(yield* hashToken(state));
        assert.isDefined(pending);
        assert.strictEqual(
          location.searchParams.get("challenge"),
          yield* hashToken(pending?.verifier ?? ""),
        );
        assert.strictEqual(location.searchParams.get("nonce"), pending?.nonce);
        const browserCookie = response.headers.get("Set-Cookie") ?? "";
        assert.match(
          browserCookie,
          /__Host-alchemist-login=[\w-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=600/,
        );
        const callbackUrl = `${origin}/auth/google/callback?state=${state}&code=alice`;
        assert.strictEqual((yield* handleRequest(new Request(callbackUrl))).status, 400);

        const callback = yield* handleRequest(
          new Request(callbackUrl, { headers: { Cookie: browserCookie.split(";")[0] ?? "" } }),
        );

        assert.strictEqual(callback.status, 303);

        const sessionCookie =
          callback.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`)) ??
          "";

        assert.match(sessionCookie, /; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000/);
        assert.include(callback.headers.getSetCookie()[0] ?? "", `${FLOW_COOKIE}=;`);
        assert.strictEqual(
          (yield* handleRequest(
            new Request(callbackUrl, { headers: { Cookie: browserCookie.split(";")[0] ?? "" } }),
          )).status,
          400,
        );
      }).pipe(Effect.provide([f.layer, config, unusedScripts]));
    }),
);

it.effect("HTTP rejects cross-origin RPC calls and auth mutations before accessing services", () =>
  Effect.gen(function* () {
    for (const headers of [
      {},
      { Origin: "https://evil.test" },
      { Origin: origin, "Sec-Fetch-Site": "cross-site" },
    ]) {
      for (const path of ["/auth/sign-out", "/api/rpc/"]) {
        assert.strictEqual(
          (yield* handleRequest(new Request(`${origin}${path}`, { method: "POST", headers })))
            .status,
          403,
        );
      }
    }

    assert.strictEqual(
      (yield* handleRequest(new Request("https://evil.test/auth/google/callback"))).status,
      400,
    );
  }).pipe(Effect.provide([config, unusedScripts, Layer.mock(Auth, {})])),
);

it.effect("public reads stay anonymous through the shared RPC endpoint", () =>
  Effect.gen(function* () {
    const id = ScriptId.make("01k8ac00000000000000000001");

    const response = yield* handleRequest(
      new Request(`${origin}/api/rpc/`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/x-ndjson" },
        body: `{"_tag":"Request","id":"1","tag":"Script.readPublic","payload":{"id":"${id}"},"headers":[]}\n`,
      }),
    );

    assert.deepStrictEqual((yield* Effect.promise(() => response.json())).exit.value, {
      id,
      name: "Public",
      authorCredit: "Credit",
      characters: [],
    });
  }).pipe(
    Effect.provide([
      Layer.mock(Auth, {}),
      config,
      Layer.mock(Scripts, {
        readPublic: (id) =>
          Effect.succeed({ id, name: "Public", authorCredit: "Credit", characters: [] }),
      }),
    ]),
  ),
);
