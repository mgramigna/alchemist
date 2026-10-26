import { AuthUnavailable } from "@alchemist/domain";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer } from "effect";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { AuthStore } from "../src/auth.ts";
import { D1AuthStore } from "../src/auth-store.ts";

// Only adapter semantics need workerd. HTTP and workflows use swapped layers.
const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  compatibilityDate: "2026-07-01",
  d1Databases: ["DB"],
});

const db = await mf.getD1Database("DB");
const store = D1AuthStore.pipe(Layer.provide(D1Client.layer({ db })));

const run = <A, E>(effect: Effect.Effect<A, E, AuthStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(store)));

beforeAll(async () => {
  for (const filename of ["0001_scripts.sql", "0002_auth.sql"]) {
    const sql = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");

    for (const statement of sql.split(";")) if (statement.trim()) await db.prepare(statement).run();
  }
});

afterAll(() => mf.dispose());

test("D1 DELETE RETURNING atomically consumes one matching unexpired login flow", () =>
  run(
    Effect.gen(function* () {
      const auth = yield* AuthStore;
      yield* auth.saveFlow(
        {
          stateHash: "state",
          browserHash: "browser",
          verifier: "pkce",
          nonce: "nonce",
          expiresAt: 100,
        },
        0,
      );
      expect(yield* auth.consumeFlow("state", "wrong", 1)).toBeNull();

      const claims = yield* Effect.all(
        [auth.consumeFlow("state", "browser", 1), auth.consumeFlow("state", "browser", 1)],
        { concurrency: "unbounded" },
      );

      expect(claims.filter((flow) => flow !== null)).toEqual([
        { verifier: "pkce", nonce: "nonce" },
      ]);
      yield* auth.saveFlow(
        {
          stateHash: "expired",
          browserHash: "browser",
          verifier: "pkce",
          nonce: "nonce",
          expiresAt: 10,
        },
        0,
      );
      expect(yield* auth.consumeFlow("expired", "browser", 10)).toBeNull();
    }),
  ));

test("D1 identity upsert preserves names and session queries enforce expiry and current-session deletion", () =>
  run(
    Effect.gen(function* () {
      const auth = yield* AuthStore;
      const first = { tokenHash: "first-hash", createdAt: 0, expiresAt: 100 };
      yield* auth.signIn({ sub: "alice", name: "Alice" }, "alice-id", first);
      yield* auth.rename("alice-id", "Chosen Alice");
      expect(
        yield* auth.signIn({ sub: "alice", name: "Overwrite" }, "ignored-id", {
          ...first,
          tokenHash: "second-hash",
        }),
      ).toEqual({ id: "alice-id", displayName: "Chosen Alice" });
      yield* auth.signOut(first.tokenHash);
      expect(yield* auth.current(first.tokenHash, 1)).toBeNull();
      expect(yield* auth.current("second-hash", 99)).toEqual({
        id: "alice-id",
        displayName: "Chosen Alice",
      });
      expect(yield* auth.current("second-hash", 100)).toBeNull();
      expect(yield* auth.rename("missing-id", "Missing")).toBeNull();
    }),
  ));

test("D1 batch rolls back user creation when session insertion fails", async () => {
  await run(
    Effect.gen(function* () {
      const auth = yield* AuthStore;
      const session = { tokenHash: "duplicate", createdAt: 0, expiresAt: 100 };
      yield* auth.signIn({ sub: "existing", name: "Existing" }, "existing-id", session);
      expect(
        yield* auth
          .signIn({ sub: "rollback", name: "Must roll back" }, "rollback-id", session)
          .pipe(Effect.flip),
      ).toBeInstanceOf(AuthUnavailable);
    }),
  );
  expect(
    await db.prepare("SELECT id FROM users WHERE google_sub = 'rollback'").all(),
  ).toMatchObject({ results: [] });
});
