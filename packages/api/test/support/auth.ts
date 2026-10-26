import { AuthRejected, type User } from "@alchemist/domain";
import { Effect, Layer } from "effect";
import {
  Auth,
  AuthLive,
  AuthStore,
  GoogleIdentityProvider,
  type LoginFlow,
  type Session,
} from "../../src/auth.ts";

export const authFixture = Effect.sync(() => {
  const flows = new Map<string, LoginFlow>();
  const users = new Map<string, User>();
  const sessions = new Map<string, Session & { readonly userId: string }>();
  const exchanges: string[] = [];

  const store = Layer.succeed(AuthStore, {
    saveFlow: (flow) =>
      Effect.sync(() => {
        flows.set(flow.stateHash, flow);
      }),
    consumeFlow: (state, browser, now) =>
      Effect.sync(() => {
        const flow = flows.get(state);

        if (!flow || flow.browserHash !== browser || flow.expiresAt <= now) return null;
        flows.delete(state);

        return { verifier: flow.verifier, nonce: flow.nonce };
      }),
    signIn: (identity, id, session) =>
      Effect.sync(() => {
        let user = users.get(identity.sub);

        if (!user) {
          user = { id, displayName: identity.name };
          users.set(identity.sub, user);
        }

        sessions.set(session.tokenHash, { ...session, userId: user.id });

        return user;
      }),
    current: (hash, now) =>
      Effect.sync(() => {
        const session = sessions.get(hash);

        return session && session.expiresAt > now
          ? ([...users.values()].find((user) => user.id === session.userId) ?? null)
          : null;
      }),
    rename: (hash, now, displayName) =>
      Effect.sync(() => {
        const session = sessions.get(hash);
        const entry = [...users.entries()].find(([, user]) => user.id === session?.userId);

        if (!session || session.expiresAt <= now || !entry) return null;
        const user = { id: entry[1].id, displayName };
        users.set(entry[0], user);

        return user;
      }),
    signOut: (hash) =>
      Effect.sync(() => {
        sessions.delete(hash);
      }),
  });

  const google = Layer.succeed(GoogleIdentityProvider, {
    authorizationUrl: (state, challenge, nonce) =>
      `https://google.test/?${new URLSearchParams({ state, challenge, nonce })}`,
    exchange: (code) => {
      exchanges.push(code);

      return code === "invalid"
        ? Effect.fail(new AuthRejected({}))
        : Effect.succeed({ sub: code, name: "Google name" });
    },
  });

  return {
    flows,
    users,
    sessions,
    exchanges,
    layer: AuthLive.pipe(Layer.provide([store, google])),
  };
});

export const signIn = Effect.fn("Test.signIn")(function* (sub: string) {
  const auth = yield* Auth;
  const flow = yield* auth.start();
  const state = new URL(flow.url).searchParams.get("state") ?? "";

  return yield* auth.callback(state, flow.browser, sub);
});
