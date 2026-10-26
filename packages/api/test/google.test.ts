import { AuthRejected } from "@alchemist/domain";
import { Effect, Layer, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { expect, test } from "vitest";
import { GoogleIdentityProvider } from "../src/auth.ts";
import { googleProvider, verifyGoogleToken } from "../src/google.ts";

const now = Date.UTC(2026, 9, 26);
const pair = await generateKeyPair("RS256");
const otherPair = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(pair.publicKey)), kid: "google-1", alg: "RS256" };
const keys = createLocalJWKSet({ keys: [jwk] });

const base = {
  iss: "https://accounts.google.com",
  aud: "client",
  sub: "stable-sub",
  nonce: "nonce",
  iat: now / 1000,
  exp: now / 1000 + 3600,
  name: "Google name",
  email: "discard@example.com",
  picture: "https://discard.test/avatar",
};

const sign = (payload: JWTPayload, key = pair.privateKey) =>
  new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "google-1" }).sign(key);

test("Google signature, issuer, audience, expiry, nonce, subject and authorized-party checks", async () => {
  const token = await sign(base);
  expect(await Effect.runPromise(verifyGoogleToken(token, "nonce", "client", now, keys))).toEqual({
    sub: "stable-sub",
    name: "Google name",
  });

  const invalidClaims: JWTPayload[] = [
    { ...base, iss: "https://evil.test" },
    { ...base, aud: "other-client" },
    { ...base, exp: now / 1000 },
    { ...base, iat: now / 1000 + 60 },
    { ...base, iat: now / 1000 - 601 },
    { ...base, nonce: "wrong" },
    { ...base, sub: "" },
    { ...base, azp: "other-client" },
    { ...base, aud: ["client", "other-client"] },
    { ...base, nbf: now / 1000 + 3600 },
  ];

  for (const claim of ["exp", "iat", "sub", "nonce"]) {
    const missing: JWTPayload = { ...base };
    delete missing[claim];
    invalidClaims.push(missing);
  }

  for (const payload of invalidClaims) {
    expect(
      await Effect.runPromise(
        verifyGoogleToken(await sign(payload), "nonce", "client", now, keys).pipe(Effect.flip),
      ),
    ).toBeInstanceOf(AuthRejected);
  }

  expect(
    await Effect.runPromise(
      verifyGoogleToken(await sign(base, otherPair.privateKey), "nonce", "client", now, keys).pipe(
        Effect.flip,
      ),
    ),
  ).toBeInstanceOf(AuthRejected);
  expect(
    await Effect.runPromise(
      verifyGoogleToken("not-a-jwt", "nonce", "client", now, keys).pipe(Effect.flip),
    ),
  ).toBeInstanceOf(AuthRejected);

  const rotated = createLocalJWKSet({
    keys: [jwk, { ...(await exportJWK(otherPair.publicKey)), kid: "google-2", alg: "RS256" }],
  });

  const rotatedToken = await new SignJWT(base)
    .setProtectedHeader({ alg: "RS256", kid: "google-2" })
    .sign(otherPair.privateKey);

  expect(
    await Effect.runPromise(verifyGoogleToken(rotatedToken, "nonce", "client", now, rotated)),
  ).toEqual({ sub: "stable-sub", name: "Google name" });
});

test("Google exchanges the code with exact callback, secret and PKCE; returns only sub and name", async () => {
  const token = await sign(base);

  const transport: typeof fetch = async (input, init) => {
    expect(input instanceof URL ? input.href : input).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(Uint8Array);
    expect(init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : "").toBe(
      new URLSearchParams({
        code: "code",
        client_id: "client",
        client_secret: "secret",
        redirect_uri: "https://alchemist.test/auth/google/callback",
        grant_type: "authorization_code",
        code_verifier: "verifier",
      }).toString(),
    );

    return Response.json({ id_token: token, access_token: "discard", refresh_token: "discard" });
  };

  const provider = googleProvider(
    {
      clientId: "client",
      clientSecret: Redacted.make("secret"),
      callbackUrl: "https://alchemist.test/auth/google/callback",
    },
    keys,
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, transport)),
  );

  const identity = await Effect.runPromise(
    Effect.gen(function* () {
      const google = yield* GoogleIdentityProvider;
      const authorization = new URL(google.authorizationUrl("state", "challenge", "nonce"));
      expect(authorization.origin + authorization.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(Object.fromEntries(authorization.searchParams)).toEqual({
        client_id: "client",
        redirect_uri: "https://alchemist.test/auth/google/callback",
        response_type: "code",
        scope: "openid profile",
        state: "state",
        nonce: "nonce",
        code_challenge: "challenge",
        code_challenge_method: "S256",
      });

      return yield* google.exchange("code", { nonce: "nonce", verifier: "verifier" }, now);
    }).pipe(Effect.provide(provider)),
  );

  expect(identity).toEqual({ sub: "stable-sub", name: "Google name" });
});
