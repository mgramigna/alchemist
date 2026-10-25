import { Effect } from "effect";

export const greet = Effect.fn("greet")(function* (name: string) {
  yield* Effect.logDebug("greeting", name);

  return `Hello, ${name}`;
});
