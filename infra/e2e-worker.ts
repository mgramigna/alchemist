import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { localGoogleProvider } from "../packages/api/test/support/google.ts";
import { application } from "./application.ts";

// This entrypoint belongs only to alchemy.e2e.ts, whose stack rejects live mode.
// There is no environment flag capable of enabling this adapter in the normal Worker.
export default Cloudflare.Worker(
  "App",
  {
    main: import.meta.url,
    assets: {
      directory: "./packages/web/dist",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*", "/auth", "/auth/*", "/artwork/*", "/scripts/*/json"],
    },
    dev: { port: 1338, strictPort: true },
  },
  Effect.gen(function* () {
    const origin = yield* Config.String("APP_ORIGIN");

    if (origin !== "http://localhost:1338")
      return yield* Effect.die("The E2E identity provider requires http://localhost:1338");

    return yield* application(origin, localGoogleProvider(origin));
  }),
);
