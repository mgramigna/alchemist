import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { localState } from "alchemy/State/LocalState";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import Worker from "./infra/e2e-worker.ts";

export default Alchemy.Stack(
  "alchemist-e2e",
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    // Fail before provisioning anything. The normal deployment entrypoint never
    // imports the E2E Worker or its unsigned local identity adapter.
    const context = yield* AlchemyContext;

    if (!context.dev) return yield* Effect.die("The E2E stack may only run with alchemy dev");
    const worker = yield* Worker;

    return { url: worker.url };
  }),
);
