import { AuthRejected, AuthUnavailable, DisplayName, User } from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { Clock, Context, Effect, Layer, Schema } from "effect";

export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;

export const PendingFlow = Schema.Struct({
  verifier: Schema.String,
  nonce: Schema.String,
});

export interface PendingFlow extends Schema.Schema.Type<typeof PendingFlow> {}

export interface LoginFlow extends PendingFlow {
  readonly stateHash: string;
  readonly browserHash: string;
  readonly expiresAt: number;
}

export interface Session {
  readonly tokenHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface GoogleIdentity {
  readonly sub: string;
  readonly name: string;
}

export class AuthStore extends Context.Service<
  AuthStore,
  {
    readonly saveFlow: (flow: LoginFlow, now: number) => Effect.Effect<void, AuthUnavailable>;
    readonly consumeFlow: (
      stateHash: string,
      browserHash: string,
      now: number,
    ) => Effect.Effect<PendingFlow | null, AuthUnavailable>;
    readonly signIn: (
      identity: GoogleIdentity,
      userId: string,
      session: Session,
    ) => Effect.Effect<User, AuthUnavailable>;
    readonly current: (
      tokenHash: string,
      now: number,
    ) => Effect.Effect<User | null, AuthUnavailable>;
    readonly rename: (userId: string, name: string) => Effect.Effect<User | null, AuthUnavailable>;
    readonly signOut: (tokenHash: string) => Effect.Effect<void, AuthUnavailable>;
  }
>()("alchemist/AuthStore") {}

export class GoogleIdentityProvider extends Context.Service<
  GoogleIdentityProvider,
  {
    readonly authorizationUrl: (state: string, challenge: string, nonce: string) => string;
    readonly exchange: (
      code: string,
      flow: PendingFlow,
      now: number,
    ) => Effect.Effect<GoogleIdentity, AuthRejected | AuthUnavailable>;
  }
>()("alchemist/GoogleIdentityProvider") {}

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return base64url(bytes);
};

export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export const hashToken = (token: string) =>
  Effect.promise(async () =>
    base64url(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    ),
  );

export class Auth extends Context.Service<
  Auth,
  {
    readonly start: () => Effect.Effect<
      { readonly url: string; readonly browser: string },
      AuthUnavailable
    >;
    readonly callback: (
      state: string,
      browser: string,
      code: string,
    ) => Effect.Effect<string, AuthRejected | AuthUnavailable>;
    readonly current: (token: string | null) => Effect.Effect<User | null, AuthUnavailable>;
    // Renames the signed-in User; only Authentication or an explicit test can provide one.
    readonly rename: (
      name: string,
    ) => Effect.Effect<User, AuthRejected | AuthUnavailable, CurrentUser>;
    readonly signOut: (token: string | null) => Effect.Effect<void, AuthUnavailable>;
  }
>()("alchemist/Auth") {}

export const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const store = yield* AuthStore;
    const google = yield* GoogleIdentityProvider;

    return Auth.of({
      start: Effect.fn("Auth.start")(function* () {
        const now = yield* Clock.currentTimeMillis;
        const state = randomToken();
        const browser = randomToken();
        const verifier = randomToken();
        const nonce = randomToken();
        yield* store.saveFlow(
          {
            stateHash: yield* hashToken(state),
            browserHash: yield* hashToken(browser),
            verifier,
            nonce,
            expiresAt: now + FLOW_SECONDS * 1000,
          },
          now,
        );

        return { browser, url: google.authorizationUrl(state, yield* hashToken(verifier), nonce) };
      }),
      callback: Effect.fn("Auth.callback")(function* (state, browser, code) {
        if (
          !/^[\w-]{43}$/.test(state) ||
          !/^[\w-]{43}$/.test(browser) ||
          !code ||
          code.length > 4096
        )
          return yield* new AuthRejected({});
        const now = yield* Clock.currentTimeMillis;

        // DELETE ... RETURNING is the one-time claim, before any provider I/O.
        const flow = yield* store.consumeFlow(
          yield* hashToken(state),
          yield* hashToken(browser),
          now,
        );

        if (flow === null) return yield* new AuthRejected({});
        const identity = yield* google.exchange(code, flow, now);
        const token = randomToken();
        yield* store.signIn(identity, crypto.randomUUID(), {
          tokenHash: yield* hashToken(token),
          createdAt: now,
          expiresAt: now + SESSION_SECONDS * 1000,
        });

        return token;
      }),
      current: Effect.fn("Auth.current")(function* (token) {
        if (token === null || !/^[\w-]{43}$/.test(token)) return null;

        return yield* store.current(yield* hashToken(token), yield* Clock.currentTimeMillis);
      }),
      rename: Effect.fn("Auth.rename")(function* (name) {
        const current = yield* CurrentUser;

        const displayName = yield* Schema.decodeEffect(DisplayName)(name.trim()).pipe(
          Effect.mapError(() => new AuthRejected({})),
        );

        const user = yield* store.rename(current.id, displayName);

        if (user === null) return yield* new AuthRejected({});

        return user;
      }),
      signOut: Effect.fn("Auth.signOut")(function* (token) {
        if (token !== null && /^[\w-]{43}$/.test(token))
          yield* store.signOut(yield* hashToken(token));
      }),
    });
  }),
);
