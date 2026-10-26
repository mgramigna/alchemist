import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { googleProvider } from "../packages/api/src/google.ts";
import { application } from "./application.ts";

export default Cloudflare.Worker(
  "App",
  {
    main: import.meta.url,
    assets: {
      directory: "./packages/web/dist",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*", "/auth", "/auth/*", "/artwork/*"],
    },
    dev: { port: 1337, strictPort: true },
  },
  Effect.gen(function* () {
    // Resolve required configuration during construction so Alchemy binds it.
    const origin = yield* Config.String("APP_ORIGIN");
    const clientId = yield* Config.String("GOOGLE_CLIENT_ID");
    const clientSecret = yield* Config.Redacted("GOOGLE_CLIENT_SECRET");

    return yield* application(
      origin,
      googleProvider({
        clientId,
        clientSecret,
        callbackUrl: `${origin}/auth/google/callback`,
      }).pipe(
        Layer.provide(FetchHttpClient.layer),
        // Workers reject `redirect: "error"`; a 3xx stays non-2xx and is rejected.
        Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
      ),
    );
  }),
);
