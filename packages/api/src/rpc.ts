import { PublicRpcs } from "@alchemist/domain/rpc";
import { Effect } from "effect";
import { Scripts } from "./scripts.ts";

export const PublicHandlers = PublicRpcs.toLayer(
  Effect.gen(function* () {
    const scripts = yield* Scripts;

    return { "Script.readPublic": ({ id }) => scripts.readPublic(id) };
  }),
);
