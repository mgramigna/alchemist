import assert from "node:assert/strict";
import { PublicRpcs } from "@alchemist/domain/rpc";
import { ScriptId } from "@alchemist/domain";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

const origin = process.argv[2] ?? "http://localhost:1337";
const id = ScriptId.make(process.argv[3] ?? "01k8ac00000000000000000001");

const protocol = RpcClient.layerProtocolHttp({ url: `${origin}/api/public/rpc` }).pipe(
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
);

await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(PublicRpcs);
      const script = yield* client["Script.readPublic"]({ id });
      assert.deepEqual(Object.keys(script).sort(), ["authorCredit", "characters", "id", "name"]);
      assert.equal(script.id, id);

      if (process.argv[3] === undefined) {
        assert.equal(script.name, "The Midnight Alchemist");
        assert.equal(script.authorCredit, "The Clocktower Collective");
        assert.deepEqual(script.characters, []);
      }

      const missing = yield* client["Script.readPublic"]({
        id: ScriptId.make("00000000000000000000000000"),
      }).pipe(Effect.flip);

      assert.equal(missing._tag, "ScriptNotFound");
    }),
  ).pipe(Effect.provide(protocol)),
);

const navigation = await fetch(`${origin}/scripts/${id}`, {
  headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
});

assert.equal(navigation.status, 200);

assert.match(navigation.headers.get("content-type") ?? "", /text\/html/);

assert.match(await navigation.text(), /<div id="root">/);

for (const path of ["/api", "/api/missing", "/api/public/rpc", "/auth/missing"]) {
  const response = await fetch(`${origin}${path}`, {
    headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
  });

  assert.ok(response.status >= 400, `${path} must return an HTTP error`);
  assert.doesNotMatch(
    response.headers.get("content-type") ?? "",
    /text\/html/,
    `${path} must not fall through to SPA HTML`,
  );
}

const invalid = await fetch(`${origin}/api/public/rpc`, {
  method: "POST",
  headers: { "Content-Type": "application/x-ndjson" },
  // Deliberately malformed input exercises the raw RPC wire decoder.
  body: '{"_tag":"Request","id":"1","tag":"Script.readPublic","payload":{"id":"invalid"},"headers":[]}\n',
});

assert.doesNotMatch(await invalid.text(), /<!doctype|<html/i);

console.log(`Public HTTP/D1 smoke passed at ${origin} for ${id}`);
