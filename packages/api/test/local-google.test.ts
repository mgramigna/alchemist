import { layer } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";
import { GoogleIdentityProvider, hashToken } from "../src/auth.ts";
import { localGoogleProvider } from "./support/google.ts";

const origin = "http://localhost:1338";
const flow = { verifier: "local-test-verifier", nonce: "local-test-nonce" };

layer(localGoogleProvider(origin))((it) => {
  it.effect(
    "local identity adapter preserves state and validates nonce and verifier continuity",
    () =>
      Effect.gen(function* () {
        const provider = yield* GoogleIdentityProvider;

        const url = new URL(
          provider.authorizationUrl("state", yield* hashToken(flow.verifier), flow.nonce),
        );

        expect(url.origin).toBe(origin);
        expect(url.pathname).toBe("/auth/google/callback");
        expect(url.searchParams.get("state")).toBe("state");
        const code = url.searchParams.get("code") ?? "";
        const identity = yield* provider.exchange(code, flow, 0);

        expect(identity.name).toBe("Local Alchemist");
        expect(identity.sub).not.toBe("");

        for (const changed of [
          { ...flow, nonce: "wrong" },
          { ...flow, verifier: "wrong" },
        ]) {
          const error = yield* provider.exchange(code, changed, 0).pipe(Effect.flip);
          expect(error._tag).toBe("AuthRejected");
        }
      }),
  );

  for (const code of [
    "not json",
    "{}",
    JSON.stringify({ sub: "", name: "", nonce: "", challenge: "" }),
  ]) {
    it.effect(`local identity adapter rejects malformed identity: ${code}`, () =>
      Effect.gen(function* () {
        const provider = yield* GoogleIdentityProvider;
        const error = yield* provider.exchange(code, flow, 0).pipe(Effect.flip);
        expect(error._tag).toBe("AuthRejected");
      }),
    );
  }
});
