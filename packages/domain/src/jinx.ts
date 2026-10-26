import { Schema } from "effect";
import { CharacterId, type ExportBlocker } from "./character.ts";

export const JINX_EXPLANATION_EXPORT_LIMIT = 500;

// Keep over-limit drafts, with a separate storage bound as for Character fields.
export const JinxExplanation = Schema.String.check(Schema.isMaxLength(2000));
export const JinxPair = Schema.Struct({ first: CharacterId, second: CharacterId });

export interface JinxPair extends Schema.Schema.Type<typeof JinxPair> {}

export const Jinx = Schema.Struct({ ...JinxPair.fields, explanation: JinxExplanation });

export interface Jinx extends Schema.Schema.Type<typeof Jinx> {}

export const jinxPair = (first: CharacterId, second: CharacterId): JinxPair =>
  first < second ? { first, second } : { first: second, second: first };

export const jinxKey = ({ first, second }: JinxPair): string => {
  const pair = jinxPair(first, second);

  return `${pair.first}:${pair.second}`;
};

export const explanationBlocker = (explanation: string): string | undefined => {
  if (explanation.trim() === "") return "Explain how these Characters interact.";

  if (explanation.length > JINX_EXPLANATION_EXPORT_LIMIT)
    return `Use ${JINX_EXPLANATION_EXPORT_LIMIT} characters or fewer.`;

  return undefined;
};

// One blocker per relationship, navigable from either endpoint.
export const jinxExportBlockers = (jinxes: ReadonlyArray<Jinx>): ReadonlyArray<ExportBlocker> =>
  jinxes.flatMap((jinx) => {
    const message = explanationBlocker(jinx.explanation);

    return message === undefined
      ? []
      : [
          {
            characterId: jinx.first,
            otherCharacterId: jinx.second,
            field: "jinx" as const,
            message,
          },
        ];
  });

export class JinxInvalid extends Schema.TaggedError<
  JinxInvalid,
  { readonly brand: unique symbol }
>()("JinxInvalid", { message: Schema.String }) {}

export class JinxConflict extends Schema.TaggedError<
  JinxConflict,
  { readonly brand: unique symbol }
>()("JinxConflict", {}) {}

export class JinxNotFound extends Schema.TaggedError<
  JinxNotFound,
  { readonly brand: unique symbol }
>()("JinxNotFound", {}) {}
