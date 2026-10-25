import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { localState } from "alchemy/State/LocalState";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";

export default Alchemy.Stack(
  "alchemist",
  {
    providers: Cloudflare.providers(),
    state: localState(),
  },
  Effect.gen(function* () {
    const { dev } = yield* AlchemyContext;

    const db = yield* Cloudflare.D1.Database("Scripts", {
      migrations: "./packages/api/migrations",
      importFiles: dev ? ["./packages/api/fixtures/public-script.sql"] : [],
    });

    const worker = yield* Cloudflare.Worker("App", {
      main: "./packages/api/src/worker.ts",
      env: { DB: db },
      assets: {
        directory: "./packages/web/dist",
        notFoundHandling: "single-page-application",
        runWorkerFirst: ["/api", "/api/*", "/auth", "/auth/*"],
      },
      dev: { port: 1337, strictPort: true },
    });

    return { url: worker.url };
  }),
);
