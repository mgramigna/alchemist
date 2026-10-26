import { AuthRejected } from "@alchemist/domain";
import { Authentication, CurrentUser, Rpcs } from "@alchemist/domain/rpc";
import { Effect, Layer } from "effect";
import { Scripts } from "./scripts.ts";
import { Auth } from "./auth.ts";
import { SESSION_COOKIE, readCookie } from "./auth-http.ts";

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth;

    return Authentication.of((effect, { headers }) =>
      Effect.gen(function* () {
        const user = yield* auth.current(readCookie(headers.cookie, SESSION_COOKIE));

        if (user === null) return yield* new AuthRejected({});

        return yield* Effect.provideService(effect, CurrentUser, user);
      }),
    );
  }),
);

export const Handlers = Rpcs.toLayer(
  Effect.gen(function* () {
    const scripts = yield* Scripts;
    const auth = yield* Auth;

    return {
      "Script.readPublic": ({ id }) => scripts.readPublic(id),
      "Account.current": (_, { headers }) =>
        auth.current(readCookie(headers.cookie, SESSION_COOKIE)),
      "Account.rename": ({ displayName }) => auth.rename(displayName),
    };
  }),
);
