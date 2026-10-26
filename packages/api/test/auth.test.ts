import { AuthRejected } from "@alchemist/domain";
import { assert, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { TestClock } from "effect/testing";
import { Auth, FLOW_SECONDS, SESSION_SECONDS, hashToken } from "../src/auth.ts";
import { authFixture, signIn } from "./support/auth.ts";

it.effect(
  "sign-in links by sub, preserves edited names, hashes tokens, and signs out only this browser",
  () =>
    Effect.gen(function* () {
      const f = yield* authFixture;
      yield* Effect.gen(function* () {
        const auth = yield* Auth;
        assert.isNull(yield* auth.current(null));
        const first = yield* signIn("alice");
        const user = yield* auth.current(first);
        assert.strictEqual(user?.displayName, "Google name");
        assert.isFalse(f.sessions.has(first));
        assert.isTrue(f.sessions.has(yield* hashToken(first)));
        assert.deepStrictEqual(Object.keys(f.users.get("alice") ?? {}).sort(), [
          "displayName",
          "id",
        ]);
        yield* auth.rename(first, "  Chosen name  ");
        const second = yield* signIn("alice");
        assert.deepStrictEqual(yield* auth.current(second), {
          id: user?.id,
          displayName: "Chosen name",
        });
        const other = yield* signIn("bob");
        yield* auth.rename(other, "Bob");
        yield* auth.signOut(first);
        assert.isNull(yield* auth.current(first));
        assert.instanceOf(yield* auth.rename(first, "No").pipe(Effect.flip), AuthRejected);
        assert.strictEqual((yield* auth.current(second))?.displayName, "Chosen name");
        assert.strictEqual((yield* auth.current(other))?.displayName, "Bob");
        assert.strictEqual(f.sessions.size, 2);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect(
  "login state is browser-bound, expires, and can only be claimed once even concurrently",
  () =>
    Effect.gen(function* () {
      const f = yield* authFixture;
      yield* Effect.gen(function* () {
        const auth = yield* Auth;
        const flow = yield* auth.start();
        const state = new URL(flow.url).searchParams.get("state") ?? "";
        assert.instanceOf(
          yield* auth.callback(state, "x".repeat(43), "alice").pipe(Effect.flip),
          AuthRejected,
        );
        assert.instanceOf(
          yield* auth.callback("bad", flow.browser, "alice").pipe(Effect.flip),
          AuthRejected,
        );
        assert.deepStrictEqual(f.exchanges, []);

        const results = yield* Effect.forEach(
          [0, 1],
          () => auth.callback(state, flow.browser, "alice").pipe(Effect.result),
          { concurrency: "unbounded" },
        );

        assert.strictEqual(results.filter(Result.isSuccess).length, 1);
        assert.strictEqual(f.exchanges.length, 1);
        const expired = yield* auth.start();
        yield* TestClock.adjust(FLOW_SECONDS * 1000);
        assert.instanceOf(
          yield* auth
            .callback(
              new URL(expired.url).searchParams.get("state") ?? "",
              expired.browser,
              "alice",
            )
            .pipe(Effect.flip),
          AuthRejected,
        );
        const failed = yield* auth.start();
        const failedState = new URL(failed.url).searchParams.get("state") ?? "";
        assert.instanceOf(
          yield* auth.callback(failedState, failed.browser, "invalid").pipe(Effect.flip),
          AuthRejected,
        );
        assert.instanceOf(
          yield* auth.callback(failedState, failed.browser, "alice").pipe(Effect.flip),
          AuthRejected,
        );
        assert.strictEqual(f.exchanges.length, 2);
      }).pipe(Effect.provide(f.layer));
    }),
);

it.effect("session expiry is fixed at 30 days and expired sessions cannot mutate a profile", () =>
  Effect.gen(function* () {
    const f = yield* authFixture;
    yield* Effect.gen(function* () {
      const auth = yield* Auth;
      const token = yield* signIn("alice");
      yield* TestClock.adjust((SESSION_SECONDS - 1) * 1000);
      assert.isNotNull(yield* auth.current(token));
      yield* auth.rename(token, "Before expiry");
      yield* TestClock.adjust(1000);
      assert.isNull(yield* auth.current(token));
      assert.instanceOf(yield* auth.rename(token, "After expiry").pipe(Effect.flip), AuthRejected);
      assert.strictEqual(f.users.get("alice")?.displayName, "Before expiry");
    }).pipe(Effect.provide(f.layer));
  }),
);
