import * as Cloudflare from "@alchemy.run/cloudflare";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { Effect, Option } from "effect";

export const Database = Cloudflare.D1.Database(
  "Scripts",
  Effect.gen(function* () {
    // The deployment context is absent when the Worker reconstructs resource
    // identities at runtime. Fixture imports are a local planning concern only.
    const context = yield* Effect.serviceOption(AlchemyContext);

    return {
      migrations: "./packages/api/migrations",
      importFiles: Option.exists(context, ({ dev }) => dev)
        ? ["./packages/api/fixtures/public-script.sql"]
        : [],
    };
  }),
);
