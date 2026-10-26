import * as Alchemy from "alchemy";
import { localState } from "alchemy/State/LocalState";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import Worker from "./infra/worker.ts";

export default Alchemy.Stack(
  "alchemist",
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    const worker = yield* Worker;

    return { url: worker.url };
  }),
);
