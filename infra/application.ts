import * as Cloudflare from "@alchemy.run/cloudflare";
import * as SQL from "@alchemy.run/cloudflare/D1/SQL";
import { Effect, Layer } from "effect";
import { HttpServerResponse } from "effect/http";
import { AppConfig, handleRequest } from "../packages/api/src/app.ts";
import { AuthLive, GoogleIdentityProvider } from "../packages/api/src/auth.ts";
import { D1AuthStore } from "../packages/api/src/auth-store.ts";
import { D1ScriptStore } from "../packages/api/src/d1.ts";
import { ScriptsLive } from "../packages/api/src/scripts.ts";
import { Database } from "./database.ts";

// Both entrypoints use the same application; only the external identity adapter differs.
export const application = (origin: string, identity: Layer.Layer<GoogleIdentityProvider>) =>
  Effect.gen(function* () {
    const database = yield* Cloudflare.D1.QueryDatabase(Database);

    const services = Layer.mergeAll(
      ScriptsLive.pipe(Layer.provide(D1ScriptStore)),
      AuthLive.pipe(Layer.provide(D1AuthStore), Layer.provide(identity)),
      Layer.succeed(AppConfig, { origin }),
    ).pipe(Layer.provide(SQL.D1Layer(database)));

    return {
      fetch: Effect.gen(function* () {
        const request = yield* Cloudflare.Request;

        return HttpServerResponse.fromWeb(yield* handleRequest(request));
      }).pipe(Effect.provide(services)),
    };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding));
