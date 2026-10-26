import { AuthRejected, DisplayName } from "@alchemist/domain";
import { Effect, Layer, Schema } from "effect";
import { GoogleIdentityProvider, hashToken } from "../../src/auth.ts";

// An intentional local-only identity bypass, not a token verifier. Production's
// Worker entrypoint never imports this adapter. State, cookies, one-time flows,
// sessions, and authorization still go through AuthLive and migrated D1.
export const LocalGoogleCode = Schema.Struct({
  sub: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  name: DisplayName,
  nonce: Schema.String,
  challenge: Schema.String,
});

export const localGoogleProvider = (origin: string) =>
  Layer.succeed(
    GoogleIdentityProvider,
    GoogleIdentityProvider.of({
      authorizationUrl: (state, challenge, nonce) => {
        const callback = new URL("/auth/google/callback", origin);
        callback.search = new URLSearchParams({
          state,
          code: JSON.stringify({
            sub: crypto.randomUUID(),
            name: "Local Alchemist",
            nonce,
            challenge,
          }),
        }).toString();

        return callback.href;
      },
      exchange: Effect.fn("LocalGoogle.exchange")(function* (code, flow) {
        const identity = yield* Schema.decodeEffect(Schema.fromJsonString(LocalGoogleCode))(
          code,
        ).pipe(Effect.mapError(() => new AuthRejected({})));

        if (
          identity.nonce !== flow.nonce ||
          identity.challenge !== (yield* hashToken(flow.verifier))
        )
          return yield* new AuthRejected({});

        return { sub: identity.sub, name: identity.name };
      }),
    }),
  );
