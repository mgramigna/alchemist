import { AccountRpcs, PublicRpcs } from "@alchemist/domain/rpc";
import { Effect } from "effect";
import { Scripts } from "./scripts.ts";
import { Auth } from "./auth.ts";
import { BrowserSession } from "./auth-http.ts";

export const PublicHandlers = PublicRpcs.toLayer(
  Effect.gen(function* () {
    const scripts = yield* Scripts;

    return { "Script.readPublic": ({ id }) => scripts.readPublic(id) };
  }),
);

export const AccountHandlers = AccountRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* Auth;
    const session = yield* BrowserSession;

    return {
      "Account.current": () => auth.current(session.token),
      "Account.rename": ({ displayName }) => auth.rename(session.token, displayName),
    };
  }),
);
