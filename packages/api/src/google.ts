import { AuthRejected, AuthUnavailable, DisplayName } from "@alchemist/domain";
import { Effect, Layer, Redacted, Schema } from "effect";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { GoogleIdentityProvider } from "./auth.ts";

export interface GoogleConfig {
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly callbackUrl: string;
}

// Only public verification keys are shared between requests. jose handles rotation.
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const TokenResponse = Schema.Struct({ id_token: Schema.String });

const Claims = Schema.Struct({
  sub: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  nonce: Schema.String,
  name: Schema.optional(Schema.String),
  azp: Schema.optional(Schema.String),
});

export const verifyGoogleToken = Effect.fn("Google.verifyToken")(function* (
  token: string,
  nonce: string,
  clientId: string,
  now: number,
  keys: JWTVerifyGetKey = googleKeys,
) {
  const verified = yield* Effect.tryPromise({
    try: () =>
      jwtVerify(token, keys, {
        algorithms: ["RS256"],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
        requiredClaims: ["exp", "iat", "sub", "nonce"],
        maxTokenAge: "10 minutes",
        currentDate: new Date(now),
      }),
    catch: () => new AuthRejected({}),
  });

  const claims = yield* Schema.decodeUnknownEffect(Claims)(verified.payload).pipe(
    Effect.mapError(() => new AuthRejected({})),
  );

  if (
    claims.nonce !== nonce ||
    (claims.azp !== undefined && claims.azp !== clientId) ||
    (Array.isArray(verified.payload.aud) &&
      verified.payload.aud.length > 1 &&
      claims.azp !== clientId)
  )
    return yield* new AuthRejected({});
  const name = claims.name?.trim() || "Alchemist";

  const displayName = yield* Schema.decodeEffect(DisplayName)(name.slice(0, 100)).pipe(
    Effect.mapError(() => new AuthRejected({})),
  );

  return { sub: claims.sub, name: displayName };
});

export const googleProvider = (
  config: GoogleConfig,
  request: typeof fetch = fetch,
  keys: JWTVerifyGetKey = googleKeys,
) =>
  Layer.succeed(GoogleIdentityProvider, {
    authorizationUrl: (state, challenge, nonce) => {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
        response_type: "code",
        scope: "openid profile",
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();

      return url.href;
    },
    exchange: Effect.fn("Google.exchange")(function* (code, flow, now) {
      const response = yield* Effect.tryPromise({
        try: () =>
          request("https://oauth2.googleapis.com/token", {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            redirect: "error",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: config.clientId,
              client_secret: Redacted.value(config.clientSecret),
              redirect_uri: config.callbackUrl,
              grant_type: "authorization_code",
              code_verifier: flow.verifier,
            }),
          }),
        catch: () => new AuthUnavailable({}),
      });

      if (!response.ok) return yield* new AuthRejected({});

      const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new AuthRejected({}),
      });

      const token = yield* Schema.decodeUnknownEffect(TokenResponse)(body).pipe(
        Effect.mapError(() => new AuthRejected({})),
      );

      // Only sub/name escape this adapter; Google tokens and other profile claims are discarded.
      return yield* verifyGoogleToken(token.id_token, flow.nonce, config.clientId, now, keys);
    }),
  });
