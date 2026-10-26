import { expect, type Page } from "@playwright/test";
import { Predicate, Schema } from "effect";
import { Rpcs } from "@alchemist/domain/rpc";
import type { RpcGroup } from "effect/rpc";

type Requests = RpcGroup.Rpcs<typeof Rpcs>;

type Tag = Requests["_tag"];

type Payload<T extends Tag> = Extract<Requests, { readonly _tag: T }>["payloadSchema"]["Encoded"];

type Input<T extends Tag> = Payload<T> extends void ? Readonly<Record<never, never>> : Payload<T>;

const RequestMessage = Schema.TaggedStruct("Request", {
  id: Schema.String,
  tag: Schema.String,
  payload: Schema.Unknown,
  headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
});

const Message = Schema.TaggedStruct("Exit", {
  requestId: Schema.String,
  exit: Schema.Union([
    Schema.TaggedStruct("Success", { value: Schema.Unknown }),
    Schema.TaggedStruct("Failure", { cause: Schema.Unknown }),
  ]),
});

// Requests go over HTTP to the running Worker, using this browser's real cookie jar.
// The schema validates responses; this helper never manufactures an RPC response.
export const callRpc = async <A, T extends Tag>(
  page: Page,
  tag: T,
  payload: Input<T>,
  schema: Schema.Codec<A, unknown>,
): Promise<A> => {
  const origin = new URL(page.url()).origin;
  const id = crypto.randomUUID();

  const response = await page.context().request.post(`${origin}/api/rpc`, {
    headers: { "Content-Type": "application/x-ndjson", Origin: origin },
    data:
      JSON.stringify(
        RequestMessage.make({
          id,
          tag,
          payload: Rpcs.requests.get(tag)?.payloadSchema === Schema.Void ? null : payload,
          headers: [],
        }),
      ) + "\n",
  });

  if (!response.ok()) throw new Error(`${tag}: HTTP ${response.status()}`);
  const lines = (await response.text()).trim().split("\n");

  const message = lines
    .map((line) => Schema.decodeSync(Schema.fromJsonString(Message))(line))
    .find((value) => value.requestId === id);

  if (!message) throw new Error(`${tag}: missing RPC result`);

  if (Predicate.isTagged(message.exit, "Failure"))
    throw new Error(`${tag}: ${JSON.stringify(message.exit.cause)}`);

  return Schema.decodeUnknownSync(schema)(message.exit.value);
};

const Code = Schema.Struct({
  sub: Schema.String,
  name: Schema.String,
  nonce: Schema.String,
  challenge: Schema.String,
});

export const signIn = async (
  page: Page,
  identity: { readonly sub?: string; readonly name?: string } = {},
) => {
  // Establish the configured origin without relying on a pre-existing page URL.
  await page.goto("/");
  const origin = new URL(page.url()).origin;

  if (origin !== "http://localhost:1338")
    throw new Error(
      "signIn requires the managed local E2E stack; it cannot sign into a deployed app",
    );
  const response = await page.context().request.get(`${origin}/auth/google`, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const callback = new URL(response.headers().location ?? "");
  expect(callback.origin).toBe(origin);
  expect(callback.pathname).toBe("/auth/google/callback");

  const code = Schema.decodeUnknownSync(Schema.fromJsonString(Code))(
    callback.searchParams.get("code"),
  );

  callback.searchParams.set(
    "code",
    JSON.stringify({
      ...code,
      sub: identity.sub ?? crypto.randomUUID(),
      name: identity.name ?? "Alice",
    }),
  );
  await page.goto(callback.href);
  await expect(
    page.getByRole("heading", { name: `Welcome back, ${identity.name ?? "Alice"}` }),
  ).toBeVisible();
};
