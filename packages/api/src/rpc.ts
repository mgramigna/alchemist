import { AuthRejected } from "@alchemist/domain";
import { Authentication, CurrentUser, Rpcs } from "@alchemist/domain/rpc";
import { Context, Effect, Layer } from "effect";
import { Scripts } from "./scripts.ts";
import { Auth } from "./auth.ts";
import { SESSION_COOKIE, readCookie } from "./auth-http.ts";

// App.handleRequest supplies the configured public origin, never RPC message headers.
export class ExportOrigin extends Context.Service<ExportOrigin, { readonly origin: string }>()(
  "alchemist/ExportOrigin",
) {}

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
      "Script.exportPublic": ({ id }) =>
        Effect.gen(function* () {
          const config = yield* ExportOrigin;

          return yield* scripts.exportPublicJson(id, config.origin);
        }),
      "Script.export": ({ id }) =>
        Effect.gen(function* () {
          const config = yield* ExportOrigin;

          return yield* scripts.exportJson(id, config.origin);
        }),
      "Script.useGenericArtwork": ({ id, field, characterId }) =>
        scripts.useGenericArtwork(id, field, characterId),
      "Script.readArtwork": ({ id }) => scripts.readScriptArtwork(id),
      "Script.uploadArtwork": ({ id, field, source }) =>
        scripts.uploadScriptArtwork(id, field, source),
      "Script.removeArtwork": ({ id, field }) => scripts.removeScriptArtwork(id, field),
      "Script.reviewImport": ({ json }) => scripts.reviewImport(json),
      "Script.import": ({ json, acknowledgeDiscard }) =>
        Effect.gen(function* () {
          const config = yield* ExportOrigin;

          return yield* scripts.importJson(json, acknowledgeDiscard, config.origin);
        }),
      "Script.retryImportedArtwork": ({ id, field, characterId }) =>
        Effect.gen(function* () {
          const config = yield* ExportOrigin;

          return yield* scripts.retryImportedArtwork(id, field, characterId, config.origin);
        }),
      "Script.readImported": ({ id }) => scripts.readImported(id),
      "Script.delete": ({ id }) => scripts.delete(id),
      "Script.create": () => scripts.create(),
      "Script.listOwned": () => scripts.listOwned(),
      "Script.readOwned": ({ id }) => scripts.readOwned(id),
      "Script.updateDetails": ({ id, name, authorCredit }) =>
        scripts.updateDetails(id, { name, authorCredit }),
      "Character.list": ({ scriptId }) => scripts.listCharacters(scriptId),
      "Character.create": ({ scriptId, team, nights }) =>
        scripts.createCharacter(scriptId, team, nights),
      "Character.update": ({ scriptId, id, ...details }) =>
        scripts.updateCharacter(scriptId, id, details),
      "Character.delete": ({ scriptId, id }) => scripts.deleteCharacter(scriptId, id),
      "Artwork.upload": ({ scriptId, id, ...upload }) =>
        scripts.uploadArtwork(scriptId, id, upload),
      "Artwork.restyle": ({ scriptId, id, ...restyle }) =>
        scripts.restyleArtwork(scriptId, id, restyle),
      "Artwork.readSource": ({ scriptId, id }) => scripts.readArtworkSource(scriptId, id),
      "Artwork.remove": ({ scriptId, id }) => scripts.removeArtwork(scriptId, id),
      "Jinx.list": ({ scriptId }) => scripts.listJinxes(scriptId),
      "Jinx.create": ({ scriptId, ...pair }) => scripts.createJinx(scriptId, pair),
      "Jinx.update": ({ scriptId, ...jinx }) => scripts.updateJinx(scriptId, jinx),
      "Jinx.delete": ({ scriptId, ...pair }) => scripts.deleteJinx(scriptId, pair),
      "CharacterOrder.replace": ({ scriptId, order }) =>
        scripts.replaceCharacterOrder(scriptId, order),
      "NightOrder.read": ({ scriptId }) => scripts.readNightOrders(scriptId),
      "NightOrder.replace": ({ scriptId, night, order }) =>
        scripts.replaceNightOrder(scriptId, night, order),
      "Account.current": (_, { headers }) =>
        auth.current(readCookie(headers.cookie, SESSION_COOKIE)),
      "Account.rename": ({ displayName }) => auth.rename(displayName),
    };
  }),
);
