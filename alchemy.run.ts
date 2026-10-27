import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { localState } from "alchemy/State/LocalState";
import { Stage } from "alchemy/Stage";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Layer } from "effect";
import Worker from "./infra/worker.ts";

export default Alchemy.Stack(
  "alchemist",
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(
      Effect.gen(function* () {
        const { dev } = yield* AlchemyContext;

        return dev ? localState() : Cloudflare.state({ name: "alchemist" });
      }),
    ),
  },
  Effect.gen(function* () {
    const { dev } = yield* AlchemyContext;
    const stage = yield* Stage;

    if (!dev && stage !== "prod")
      return yield* Effect.die("Live deployments must use --stage prod.");

    const worker = yield* Worker;

    return { url: worker.url };
  }),
);
