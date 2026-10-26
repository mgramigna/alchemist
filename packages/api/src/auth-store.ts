import { AuthUnavailable, User } from "@alchemist/domain";
import { D1Client } from "@effect/sql-d1/D1Client";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { AuthStore, PendingFlow } from "./auth.ts";

const users = Schema.Array(User);

const decodeUser = Effect.fn("AuthStore.decodeUser")(function* (rows: ReadonlyArray<object>) {
  const decoded = yield* Schema.decodeUnknownEffect(users)(rows);

  return decoded[0] ?? null;
});

export const D1AuthStore = Layer.effect(
  AuthStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // D1's atomic batch is a driver extension; SqlClient has no equivalent.
    // Both tags are supplied by the same Alchemy SQL.D1Layer in the composition root.
    const d1 = yield* D1Client;

    // The cause is dropped from the domain error, so record it here.
    const unavailable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.tapCause(Effect.logError),
        Effect.mapError(() => new AuthUnavailable({})),
      );

    return AuthStore.of({
      saveFlow: Effect.fn("D1AuthStore.saveFlow")(function* (flow, now) {
        yield* d1.batch([
          sql`DELETE FROM login_flows WHERE expires_at <= ${now}`,
          sql`DELETE FROM sessions WHERE expires_at <= ${now}`,
          sql`INSERT INTO login_flows (state_hash, browser_hash, verifier, nonce, expires_at)
          VALUES (${flow.stateHash}, ${flow.browserHash}, ${flow.verifier}, ${flow.nonce}, ${flow.expiresAt})`,
        ]);
      }, unavailable),
      consumeFlow: Effect.fn("D1AuthStore.consumeFlow")(function* (state, browser, now) {
        const rows = yield* sql`DELETE FROM login_flows
        WHERE state_hash = ${state} AND browser_hash = ${browser} AND expires_at > ${now}
        RETURNING verifier, nonce`;

        const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(PendingFlow))(rows);

        return decoded[0] ?? null;
      }, unavailable),
      signIn: Effect.fn("D1AuthStore.signIn")(function* (identity, userId, session) {
        const results = yield* d1.batch([
          sql`INSERT INTO users (id, google_sub, display_name) VALUES (${userId}, ${identity.sub}, ${identity.name})
          ON CONFLICT(google_sub) DO NOTHING`,
          sql`INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
          SELECT ${session.tokenHash}, id, ${session.createdAt}, ${session.expiresAt}
          FROM users WHERE google_sub = ${identity.sub}`,
          sql`SELECT id, display_name AS displayName FROM users WHERE google_sub = ${identity.sub}`,
        ]);

        const user = yield* decodeUser(results[2]);

        if (user === null) return yield* new AuthUnavailable({});

        return user;
      }, unavailable),
      current: Effect.fn("D1AuthStore.current")(function* (hash, now) {
        return yield* decodeUser(
          yield* sql`SELECT users.id, display_name AS displayName FROM users
        JOIN sessions ON sessions.user_id = users.id
        WHERE token_hash = ${hash} AND expires_at > ${now}`,
        );
      }, unavailable),
      rename: Effect.fn("D1AuthStore.rename")(function* (userId, name) {
        return yield* decodeUser(
          yield* sql`UPDATE users SET display_name = ${name} WHERE id = ${userId}
        RETURNING id, display_name AS displayName`,
        );
      }, unavailable),
      signOut: Effect.fn("D1AuthStore.signOut")(function* (hash) {
        yield* sql`DELETE FROM sessions WHERE token_hash = ${hash}`;
      }, unavailable),
    });
  }),
);
