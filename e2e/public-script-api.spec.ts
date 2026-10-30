import { ScriptId, ScriptNotFound, defaultNightOrders } from "@alchemist/domain";
import { Rpcs } from "@alchemist/domain/rpc";
import { expect, test } from "@playwright/test";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

const scriptId = ScriptId.make(process.env.ALCHEMIST_SCRIPT_ID ?? "01k8ac00000000000000000001");

// Raw input deliberately bypasses client validation to test the HTTP wire boundary.
const readRequest = (id: string) =>
  `{"_tag":"Request","id":"1","tag":"Script.readPublic","payload":{"id":${JSON.stringify(id)}},"headers":[]}\n`;

test("public RPC reads persisted data, exposes only public fields, and reports typed not-found", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;

  const protocol = RpcClient.layerProtocolHttp({
    url: new URL("/api/rpc", baseURL).href,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("Origin", origin)),
  }).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]));

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(Rpcs);
        const script = yield* client["Script.readPublic"]({ id: scriptId });

        expect(script.id).toBe(scriptId);

        if (process.env.ALCHEMIST_SCRIPT_ID === undefined) {
          expect(script.name).toBe("The Midnight Alchemist");
          expect(script.authorCredit).toBe("The Clocktower Collective");
          expect(script.characters).toEqual([]);
          expect(script.nightOrders).toEqual(defaultNightOrders);
          expect(script.artwork).toEqual({ logo: null, background: null });
        }

        const missing = yield* client["Script.readPublic"]({
          id: ScriptId.make("00000000000000000000000000"),
        }).pipe(Effect.flip);

        expect(missing).toBeInstanceOf(ScriptNotFound);
      }),
    ).pipe(Effect.provide(protocol)),
  );

  const response = await request.post("/api/rpc", {
    headers: { "Content-Type": "application/x-ndjson", Origin: origin },
    data: readRequest(scriptId),
  });

  expect(response.ok()).toBe(true);
  const message = await response.json();
  expect(message.exit._tag).toBe("Success");
  // Check the actual wire payload before a typed client can strip extra fields.
  expect(Object.keys(message.exit.value).sort()).toEqual([
    "artwork",
    "authorCredit",
    "backgroundCredit",
    "characters",
    "id",
    "jinxes",
    "logoCredit",
    "name",
    "nightOrders",
  ]);
  expect(message.exit.value.id).toBe(scriptId);
});

test("public URL refresh returns the SPA document", async ({ request }) => {
  const response = await request.get(`/scripts/${scriptId}`, {
    headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/text\/html/);
  expect(await response.text()).toContain('<div id="root">');
});

test("reserved API and auth paths return HTTP errors instead of SPA HTML", async ({ request }) => {
  for (const path of ["/api", "/api/missing", "/api/rpc", "/auth/missing"]) {
    const response = await request.get(path, {
      headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
    });

    expect(response.status(), path).toBeGreaterThanOrEqual(400);
    expect(response.headers()["content-type"] ?? "", path).not.toMatch(/text\/html/);
    expect(await response.text(), path).not.toMatch(/<!doctype|<html/i);
  }
});

test("malformed RPC input returns a protocol failure instead of SPA HTML", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/rpc", {
    headers: { "Content-Type": "application/x-ndjson", Origin: new URL(baseURL ?? "").origin },
    data: readRequest("invalid"),
  });

  expect(response.headers()["content-type"]).toContain("application/x-ndjson");
  const message = await response.json();
  expect(message.requestId).toBe("1");
  expect(message.exit._tag).toBe("Failure");
});
