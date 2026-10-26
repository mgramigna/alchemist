import * as Cloudflare from "@alchemy.run/cloudflare";
import * as SQL from "@alchemy.run/cloudflare/D1/SQL";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient, HttpServerResponse } from "effect/http";
import { AppConfig, handleRequest } from "../packages/api/src/app.ts";
import { AuthLive } from "../packages/api/src/auth.ts";
import { D1AuthStore } from "../packages/api/src/auth-store.ts";
import { D1ScriptStore } from "../packages/api/src/d1.ts";
import { googleProvider } from "../packages/api/src/google.ts";
import { ScriptsLive } from "../packages/api/src/scripts.ts";
import { Database } from "./database.ts";

export default Cloudflare.Worker(
  "App",
  {
    main: import.meta.url,
    assets: {
      directory: "./packages/web/dist",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*", "/auth", "/auth/*"],
    },
    dev: { port: 1337, strictPort: true },
  },
  Effect.gen(function* () {
    // Resolve required configuration during construction so Alchemy binds it.
    const origin = yield* Config.String("APP_ORIGIN");
    const clientId = yield* Config.String("GOOGLE_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("GOOGLE_CLIENT_SECRET");

    const database = yield* Cloudflare.D1.QueryDatabase(Database);

    const services = Layer.mergeAll(
      ScriptsLive.pipe(Layer.provide(D1ScriptStore)),
      AuthLive.pipe(
        Layer.provide(D1AuthStore),
        Layer.provide(
          googleProvider({
            clientId,
            clientSecret,
            callbackUrl: `${origin}/auth/google/callback`,
          }).pipe(
            Layer.provide(FetchHttpClient.layer),
            // Workers reject `redirect: "error"`; a 3xx stays non-2xx and is rejected.
            Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
          ),
        ),
      ),
      Layer.succeed(AppConfig, { origin }),
    ).pipe(
      // Alchemy builds the SQL client lazily, once per execution scope. The raw
      // binding uses primary reads; neither adapter enables D1 read replicas.
      Layer.provide(SQL.D1Layer(database)),
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* Cloudflare.Request;

        return HttpServerResponse.fromWeb(yield* handleRequest(request));
      }).pipe(Effect.provide(services)),
    };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding)),
);
