import { scriptsFixture } from "./support/scripts.ts";
import { ScriptId, defaultNightOrders } from "@alchemist/domain";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { AppConfig, handleRequest } from "../src/app.ts";
import { Auth, hashToken } from "../src/auth.ts";
import { FLOW_COOKIE, SESSION_COOKIE } from "../src/auth-http.ts";
import { ArtworkStorage } from "../src/artwork-storage.ts";
import { Scripts } from "../src/scripts.ts";
import { asUser, authFixture, signIn } from "./support/auth.ts";
import { png } from "./support/images.ts";

const origin = "https://alchemist.test";
const config = Layer.succeed(AppConfig, { origin });
const unusedScripts = Layer.mergeAll(Layer.mock(Scripts, {}), Layer.mock(ArtworkStorage, {}));

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
      nightOrders: defaultNightOrders,
      jinxes: [],
    });
  }).pipe(
    Effect.provide([
      Layer.mock(ArtworkStorage, {}),
      Layer.mock(Auth, {}),
      config,
      Layer.mock(Scripts, {
        readPublic: (id) =>
          Effect.succeed({
            id,
            name: "Public",
            authorCredit: "Credit",
            characters: [],
            nightOrders: defaultNightOrders,
            jinxes: [],
          }),
      }),
    ]),
  ),
);

it.effect(
  "JSON export over HTTP validates drafts, enforces ownership and serializes the saved download",
  () =>
    Effect.gen(function* () {
      const a = yield* authFixture;
      const s = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const token = yield* signIn("alice");
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(asUser(token));

        const exportRequest = (sessionToken: string | null, tag = "Script.export") =>
          handleRequest(
            new Request(`${origin}/api/rpc`, {
              method: "POST",
              headers: {
                Origin: origin,
                "Content-Type": "application/x-ndjson",
                Cookie: `${SESSION_COOKIE}=${sessionToken ?? ""}`,
              },
              body: `{"_tag":"Request","id":"1","tag":${JSON.stringify(tag)},"payload":{"id":${JSON.stringify(script.id)}},"headers":[]}\n`,
            }),
          ).pipe(Effect.flatMap((response) => Effect.promise(() => response.json())));

        assert.strictEqual((yield* exportRequest(null)).exit.cause[0].error._tag, "AuthRejected");
        assert.strictEqual(
          (yield* exportRequest(token)).exit.cause[0].error._tag,
          "ScriptExportInvalid",
        );

        assert.strictEqual(
          (yield* exportRequest(null, "Script.exportPublic")).exit.cause[0].error._tag,
          "ScriptExportInvalid",
        );

        for (let i = 0; i < 4; i++) {
          const character = yield* scripts
            .createCharacter(script.id, "townsfolk", [])
            .pipe(asUser(token));

          yield* scripts
            .updateCharacter(script.id, character.id, {
              ...character,
              name: `Character ${i}`,
              ability: "Ability",
            })
            .pipe(asUser(token));
        }

        const publicResponse = yield* exportRequest(null, "Script.exportPublic");
        assert.strictEqual(publicResponse.exit._tag, "Success");
        const response = yield* exportRequest(token);
        assert.deepStrictEqual(publicResponse, response);
        assert.strictEqual(response.exit._tag, "Success");
        const document = JSON.parse(response.exit.value.json);
        assert.strictEqual(document[0].name, "Untitled Script");
        assert.strictEqual(document.length, 5);
        assert.include(document[1].image[0], `${origin}/icons/generic/v1/`);
        const bob = yield* signIn("bob");
        assert.strictEqual((yield* exportRequest(bob)).exit.cause[0].error._tag, "ScriptNotFound");
      }).pipe(Effect.provide([a.layer, s.layer, config]));
    }),
);

it.effect(
  "HTTP RPC carries artwork bytes as base64 and serves the published variants anonymously",
  () =>
    Effect.gen(function* () {
      const a = yield* authFixture;
      const s = yield* scriptsFixture;
      yield* Effect.gen(function* () {
        const token = yield* signIn("alice");
        const scripts = yield* Scripts;
        const script = yield* scripts.create().pipe(asUser(token));

        const character = yield* scripts
          .createCharacter(script.id, "townsfolk", [])
          .pipe(asUser(token));

        const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
        const variant = png(400, 400);

        // The payload arrives as JSON text, as the browser's RPC client sends it.
        const call = (tag: string, payload: string) =>
          handleRequest(
            new Request(`${origin}/api/rpc`, {
              method: "POST",
              headers: {
                Origin: origin,
                "Content-Type": "application/x-ndjson",
                Cookie: `${SESSION_COOKIE}=${token}`,
              },
              body: `{"_tag":"Request","id":"1","tag":${JSON.stringify(tag)},"payload":${payload},"headers":[]}\n`,
            }),
          ).pipe(Effect.flatMap((response) => Effect.promise(() => response.json())));

        const uploaded = yield* call(
          "Artwork.upload",
          JSON.stringify({
            scriptId: script.id,
            id: character.id,
            source: base64(png(900, 700)),
            style: { look: "auto" },
            team: "townsfolk",
            variants: [
              { variant: "regular", image: base64(variant) },
              { variant: "flipped", image: base64(variant) },
            ],
          }),
        );

        assert.strictEqual(uploaded.exit._tag, "Success");

        const source = yield* call(
          "Artwork.readSource",
          JSON.stringify({ scriptId: script.id, id: character.id }),
        );

        assert.strictEqual(source.exit.value.bytes, base64(png(900, 700)));

        // Studio settings outside their ranges are refused at the RPC boundary.
        const restyle = (style: Readonly<Record<string, string | number | boolean>>) =>
          call(
            "Artwork.restyle",
            JSON.stringify({
              scriptId: script.id,
              id: character.id,
              sourceId: uploaded.exit.value.sourceId,
              style,
              team: "townsfolk",
              variants: [
                { variant: "regular", image: base64(variant) },
                { variant: "flipped", image: base64(variant) },
              ],
            }),
          );

        for (const style of [
          { look: "auto", size: 2 },
          { look: "auto", outline: -1 },
          { look: "auto", cutout: "eraser" },
          { look: "auto", color: "original" },
        ])
          assert.strictEqual((yield* restyle(style)).exit._tag, "Failure");

        const studio = { look: "lines", size: 0.5, offsetX: -20, teamShades: true };
        const restyled = yield* restyle(studio);
        assert.deepStrictEqual(restyled.exit.value.style, studio);

        const image = yield* handleRequest(
          new Request(`${origin}${uploaded.exit.value.variants[0].path}`),
        );

        assert.strictEqual(image.status, 200);
        assert.strictEqual(image.headers.get("Access-Control-Allow-Origin"), "*");
        assert.deepStrictEqual(
          new Uint8Array(yield* Effect.promise(() => image.arrayBuffer())),
          variant,
        );
      }).pipe(Effect.provide([a.layer, s.layer, config]));
    }),
);
