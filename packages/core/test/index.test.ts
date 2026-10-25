import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { greet } from "../src/index.ts";

it.effect("greet", () =>
  Effect.gen(function* () {
    const message = yield* greet("Alchemist");
    assert.strictEqual(message, "Hello, Alchemist");
  }),
);
