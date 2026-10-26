import {
  AuthRejected,
  CharacterNotFound,
  AuthUnavailable,
  NightOrderInvalid,
  ScriptWriteUnavailable,
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
import { AuthenticationLive, Handlers, ExportOrigin } from "../src/rpc.ts";
import { Scripts } from "../src/scripts.ts";
import { authFixture, signIn } from "./support/auth.ts";
import { scriptsFixture } from "./support/scripts.ts";

const noInstructions = {
  reminders: [],
  remindersGlobal: [],
  setup: false,
  flavor: "",
  firstNightInstructions: "",
  otherNightInstructions: "",
};

const id = ScriptId.make("01k8ac00000000000000000001");
const unavailableId = ScriptId.make("01k8ac00000000000000000002");
const unknownId = ScriptId.make("00000000000000000000000000");

const fixture = PublicScript.make({
  id,
  name: "Saved Script",
  authorCredit: "Saved credit",
  characters: [],
  jinxes: [],
});

const scripts = Layer.mock(Scripts, {
  readPublic: Effect.fn("TestScripts.readPublic")(function* (requested) {
    if (requested === unavailableId) return yield* new ScriptReadUnavailable({});

    if (requested !== id) return yield* new ScriptNotFound({ id: requested });

    return fixture;
  }),
});

const server = Layer.mergeAll(Handlers, AuthenticationLive).pipe(
  Layer.provide(Layer.succeed(ExportOrigin, { origin: "https://alchemist.test" })),
);

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

it.effect(
  "owner Script RPCs reject anonymous calls and act as the session's User, never another's",
  () =>
    Effect.gen(function* () {
      const a = yield* authFixture;
      const s = yield* scriptsFixture;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(Rpcs);
          const alice = yield* signIn("alice");
          const bob = yield* signIn("bob");

          const anonymous: ReadonlyArray<
            Effect.Effect<
              void,
              | AuthRejected
              | AuthUnavailable
              | ScriptNotFound
              | ScriptReadUnavailable
              | ScriptWriteUnavailable
            >
          > = [
            client["Script.create"]().pipe(Effect.asVoid),
            client["Script.listOwned"]().pipe(Effect.asVoid),
            client["Script.readOwned"]({ id }).pipe(Effect.asVoid),
            client["Script.updateDetails"]({ id, name: "Anonymous", authorCredit: "" }).pipe(
              Effect.asVoid,
            ),
          ];

          for (const call of anonymous)
            assert.instanceOf(yield* call.pipe(Effect.flip), AuthRejected);
          assert.strictEqual(s.rows.size, 0);

          const created = yield* client["Script.create"]().pipe(session(alice));
          assert.strictEqual(created.authorCredit, "Google name");
          assert.strictEqual(s.rows.get(created.id)?.ownerId, a.users.get("alice")?.id);

          const saved = yield* client["Script.updateDetails"]({
            id: created.id,
            name: "Saved over RPC",
            authorCredit: "Credit",
          }).pipe(session(alice));

          assert.strictEqual(saved.name, "Saved over RPC");
          assert.deepStrictEqual(yield* client["Script.listOwned"]().pipe(session(bob)), []);
          assert.instanceOf(
            yield* client["Script.updateDetails"]({
              id: created.id,
              name: "Bob was here",
              authorCredit: "",
            }).pipe(session(bob), Effect.flip),
            ScriptNotFound,
          );
          assert.deepStrictEqual(
            yield* client["Script.readOwned"]({ id: created.id }).pipe(session(alice)),
            saved,
          );
        }),
      ).pipe(Effect.provide(Layer.provideMerge(server, Layer.merge(a.layer, s.layer))));
    }),
);

it.effect(
  "Character RPCs require a session, scope to its owner and delete by returning the ID",
  () =>
    Effect.gen(function* () {
      const a = yield* authFixture;
      const s = yield* scriptsFixture;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(Rpcs);
          const alice = yield* signIn("alice");
          const bob = yield* signIn("bob");

          assert.instanceOf(
            yield* client["Character.list"]({ scriptId: id }).pipe(Effect.flip),
            AuthRejected,
          );

          const script = yield* client["Script.create"]().pipe(session(alice));

          const character = yield* client["Character.create"]({
            scriptId: script.id,
            team: "minion",
            nights: ["otherNight"],
          }).pipe(session(alice));

          const renamed = yield* client["Character.update"]({
            scriptId: script.id,
            id: character.id,
            name: "Poisoner",
            ability: "Each night, poison a player.",
            team: "minion",
            ...noInstructions,
            reminders: ["Poisoned", "Poisoned", " ", "x".repeat(31)],
            remindersGlobal: Array.from({ length: 21 }, () => "x".repeat(26)),
            setup: true,
            flavor: "x".repeat(501),
          }).pipe(session(alice));

          assert.deepStrictEqual(renamed.reminders, ["Poisoned", "Poisoned", " ", "x".repeat(31)]);
          assert.strictEqual(renamed.remindersGlobal.length, 21);
          assert.strictEqual(renamed.setup, true);
          assert.strictEqual(renamed.flavor.length, 501);
          assert.instanceOf(
            yield* client["Character.update"]({ ...renamed, scriptId: script.id }).pipe(
              Effect.flip,
            ),
            AuthRejected,
          );
          assert.instanceOf(
            yield* client["Character.update"]({ ...renamed, scriptId: script.id }).pipe(
              session(bob),
              Effect.flip,
            ),
            CharacterNotFound,
          );

          assert.deepStrictEqual(
            yield* client["Character.list"]({ scriptId: script.id }).pipe(session(alice)),
            [renamed],
          );
          assert.instanceOf(
            yield* client["Character.list"]({ scriptId: script.id }).pipe(
              session(bob),
              Effect.flip,
            ),
            ScriptNotFound,
          );
          assert.instanceOf(
            yield* client["Character.delete"]({ scriptId: script.id, id: character.id }).pipe(
              session(bob),
              Effect.flip,
            ),
            CharacterNotFound,
          );

          // Night Orders round-trip over the wire; malformed orders and other users are refused.
          assert.deepStrictEqual(
            yield* client["NightOrder.read"]({ scriptId: script.id }).pipe(session(alice)),
            {
              firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
              otherNight: ["dusk", character.id, "dawn"],
            },
          );

          const replaced = yield* client["NightOrder.replace"]({
            scriptId: script.id,
            night: "firstNight",
            order: ["dusk", "minioninfo", "demoninfo", "dawn", character.id],
          }).pipe(session(alice));

          assert.deepStrictEqual(replaced.firstNight, [
            "dusk",
            "minioninfo",
            "demoninfo",
            "dawn",
            character.id,
          ]);
          assert.instanceOf(
            yield* client["NightOrder.replace"]({
              scriptId: script.id,
              night: "otherNight",
              order: ["dusk", "minioninfo", "dawn"],
            }).pipe(session(alice), Effect.flip),
            NightOrderInvalid,
          );
          assert.instanceOf(
            yield* client["NightOrder.replace"]({
              scriptId: script.id,
              night: "otherNight",
              order: ["dusk", "dawn"],
            }).pipe(session(bob), Effect.flip),
            ScriptNotFound,
          );
          assert.instanceOf(
            yield* client["NightOrder.read"]({ scriptId: script.id }).pipe(
              session(bob),
              Effect.flip,
            ),
            ScriptNotFound,
          );

          assert.strictEqual(
            yield* client["Character.delete"]({ scriptId: script.id, id: character.id }).pipe(
              session(alice),
            ),
            character.id,
          );
          assert.deepStrictEqual(
            yield* client["NightOrder.read"]({ scriptId: script.id }).pipe(session(alice)),
            {
              firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
              otherNight: ["dusk", "dawn"],
            },
          );
        }),
      ).pipe(Effect.provide(Layer.provideMerge(server, Layer.merge(a.layer, s.layer))));
    }),
);

it.effect("Jinx RPCs require authentication and round-trip one pair from either endpoint", () =>
  Effect.gen(function* () {
    const a = yield* authFixture;
    const s = yield* scriptsFixture;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(Rpcs);
        const alice = yield* signIn("alice");
        const script = yield* client["Script.create"]().pipe(session(alice));

        const first = yield* client["Character.create"]({
          scriptId: script.id,
          team: "townsfolk",
          nights: [],
        }).pipe(session(alice));

        const second = yield* client["Character.create"]({
          scriptId: script.id,
          team: "demon",
          nights: [],
        }).pipe(session(alice));

        const payload = { scriptId: script.id, first: first.id, second: second.id };
        assert.instanceOf(
          yield* client["Jinx.list"]({ scriptId: script.id }).pipe(Effect.flip),
          AuthRejected,
        );
        assert.instanceOf(yield* client["Jinx.create"](payload).pipe(Effect.flip), AuthRejected);
        assert.instanceOf(
          yield* client["Jinx.update"]({ ...payload, explanation: "x" }).pipe(Effect.flip),
          AuthRejected,
        );
        assert.instanceOf(yield* client["Jinx.delete"](payload).pipe(Effect.flip), AuthRejected);
        const created = yield* client["Jinx.create"](payload).pipe(session(alice));
        assert.strictEqual(created.explanation, "");

        const saved = yield* client["Jinx.update"]({
          ...payload,
          first: second.id,
          second: first.id,
          explanation: "A shared rule.",
        }).pipe(session(alice));

        assert.deepStrictEqual(
          yield* client["Jinx.list"]({ scriptId: script.id }).pipe(session(alice)),
          [saved],
        );
        assert.deepStrictEqual((yield* client["Script.readPublic"]({ id: script.id })).jinxes, [
          saved,
        ]);
        assert.deepStrictEqual(
          yield* client["Jinx.delete"]({ ...payload, first: second.id, second: first.id }).pipe(
            session(alice),
          ),
          { first: saved.first, second: saved.second },
        );
      }),
    ).pipe(Effect.provide(Layer.provideMerge(server, Layer.merge(a.layer, s.layer))));
  }),
);

it.effect(
  "import RPCs authenticate review/commit, serialize preserved data, and enforce artwork ownership",
  () =>
    Effect.gen(function* () {
      const a = yield* authFixture;
      const s = yield* scriptsFixture;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(Rpcs);
          const alice = yield* signIn("alice");
          const bob = yield* signIn("bob");

          const json =
            '[{"id":"custom","name":"","team":"townsfolk","ability":"","image":"https://example.org/icon.png","edition":"homebrew","special":[{"type":"signal","name":"card"}],"extra":true}]';

          assert.instanceOf(
            yield* client["Script.reviewImport"]({ json }).pipe(Effect.flip),
            AuthRejected,
          );
          assert.instanceOf(
            yield* client["Script.import"]({ json, acknowledgeDiscard: true }).pipe(Effect.flip),
            AuthRejected,
          );
          const report = yield* client["Script.reviewImport"]({ json }).pipe(session(alice));
          assert(report.draft);
          assert.deepStrictEqual(report.discarded, ["Entry 1.extra"]);
          assert(report.blockers.length > 0);

          const imported = yield* client["Script.import"]({ json, acknowledgeDiscard: true }).pipe(
            session(alice),
          );

          const data = yield* client["Script.readImported"]({ id: imported.id }).pipe(
            session(alice),
          );

          assert(data);
          assert.strictEqual(data.characters[0]?.edition, "homebrew");
          assert.strictEqual(data.artwork[0]?.slots[0]?.source, "https://example.org/icon.png");
          assert.instanceOf(
            yield* client["Script.readImported"]({ id: imported.id }).pipe(
              session(bob),
              Effect.flip,
            ),
            ScriptNotFound,
          );

          const repair = {
            id: imported.id,
            field: "image" as const,
            characterId: report.draft.characters[0]?.id ?? null,
          };

          assert.instanceOf(
            yield* client["Script.useGenericArtwork"](repair).pipe(Effect.flip),
            AuthRejected,
          );
          assert.instanceOf(
            yield* client["Script.useGenericArtwork"](repair).pipe(session(bob), Effect.flip),
            ScriptNotFound,
          );
          yield* client["Script.useGenericArtwork"](repair).pipe(session(alice));
          assert.deepStrictEqual(
            (yield* client["Script.readImported"]({ id: imported.id }).pipe(session(alice)))
              ?.artwork,
            [],
          );
        }),
      ).pipe(Effect.provide(Layer.provideMerge(server, Layer.merge(a.layer, s.layer))));
    }),
);
