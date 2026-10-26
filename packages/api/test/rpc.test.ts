import {
  AuthRejected,
  PublicScript,
  ScriptId,
  ScriptNotFound,
  ScriptReadUnavailable,
} from "@alchemist/domain";
import { Rpcs } from "@alchemist/domain/rpc";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { RpcClient, RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";
import { Auth, SESSION_SECONDS } from "../src/auth.ts";
import { SESSION_COOKIE } from "../src/auth-http.ts";
import { AuthenticationLive, Handlers } from "../src/rpc.ts";
import { Scripts } from "../src/scripts.ts";
import { authFixture, signIn } from "./support/auth.ts";

const id = ScriptId.make("01k8ac00000000000000000001");
const unavailableId = ScriptId.make("01k8ac00000000000000000002");
const unknownId = ScriptId.make("00000000000000000000000000");

const fixture = PublicScript.make({
  id,
  name: "Saved Script",
  authorCredit: "Saved credit",
  characters: [],
});

const scripts = Layer.succeed(Scripts, {
  readPublic: Effect.fn("TestScripts.readPublic")(function* (requested) {
    if (requested === unavailableId) return yield* new ScriptReadUnavailable({});

    if (requested !== id) return yield* new ScriptNotFound({ id: requested });

    return fixture;
  }),
});

const server = Layer.mergeAll(Handlers, AuthenticationLive);

const session = (token: string) => RpcClient.withHeaders({ cookie: `${SESSION_COOKIE}=${token}` });

it.effect("public RPC delegates to Scripts and preserves expected error variants", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Rpcs);

      assert.deepStrictEqual(yield* client["Script.readPublic"]({ id }), fixture);
      assert.instanceOf(
        yield* client["Script.readPublic"]({ id: unknownId }).pipe(Effect.flip),
        ScriptNotFound,
      );
      assert.instanceOf(
        yield* client["Script.readPublic"]({ id: unavailableId }).pipe(Effect.flip),
        ScriptReadUnavailable,
      );
    }),
  ).pipe(Effect.provide(server.pipe(Layer.provide([scripts, Layer.mock(Auth, {})])))),
);

it.effect(
  "Authentication provides the session's User and rejects missing, signed-out and expired sessions",
  () =>
    Effect.gen(function* () {
      const f = yield* authFixture;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const auth = yield* Auth;
          const client = yield* RpcTest.makeClient(Rpcs);
          const alice = yield* signIn("alice");
          const bob = yield* signIn("bob");

          const renamed = yield* client["Account.rename"]({ displayName: "Alice" }).pipe(
            session(alice),
          );

          assert.strictEqual(renamed.displayName, "Alice");
          assert.strictEqual(f.users.get("alice")?.displayName, "Alice");
          assert.strictEqual(f.users.get("bob")?.displayName, "Google name");
          assert.instanceOf(
            yield* client["Account.rename"]({ displayName: "Anonymous" }).pipe(Effect.flip),
            AuthRejected,
          );
          yield* auth.signOut(alice);
          assert.instanceOf(
            yield* client["Account.rename"]({ displayName: "Signed out" }).pipe(
              session(alice),
              Effect.flip,
            ),
            AuthRejected,
          );
          yield* TestClock.adjust(SESSION_SECONDS * 1000);
          assert.instanceOf(
            yield* client["Account.rename"]({ displayName: "Expired" }).pipe(
              session(bob),
              Effect.flip,
            ),
            AuthRejected,
          );
          assert.strictEqual(f.users.get("alice")?.displayName, "Alice");
          assert.strictEqual(f.users.get("bob")?.displayName, "Google name");
        }),
      ).pipe(Effect.provide(Layer.provideMerge(server, Layer.merge(f.layer, scripts))));
    }),
);
