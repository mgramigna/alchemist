import { SOURCE_BYTE_LIMIT } from "@alchemist/domain";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import {
  ImageFetcher,
  MAX_REDIRECTS,
  httpImageFetcher,
  imageTargetProblem,
} from "../src/image-fetch.ts";
import { png } from "./support/images.ts";

// A fake network: each URL answers with a fixed Response; anything else fails to connect.
const network = (routes: Record<string, () => Response>) => {
  const requested: Array<string> = [];

  const client = HttpClient.make((request, url) =>
    Effect.suspend(() => {
      requested.push(url.href);
      const route = routes[url.href];

      return route === undefined
        ? Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, description: "unreachable" }),
            }),
          )
        : Effect.succeed(HttpClientResponse.fromWeb(request, route()));
    }),
  );

  return {
    requested,
    layer: httpImageFetcher.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
  };
};

const image = png(64, 64);

const fetchWith = (routes: Record<string, () => Response>, url: string) => {
  const fake = network(routes);

  return ImageFetcher.use((fetcher) => fetcher.fetch(url)).pipe(
    Effect.provide(fake.layer),
    Effect.result,
    Effect.map((result) => ({ result, requested: fake.requested })),
  );
};

const failure = (routes: Record<string, () => Response>, url: string) =>
  fetchWith(routes, url).pipe(
    Effect.map(({ result, requested }) => {
      assert(Result.isFailure(result), "expected the fetch to fail");

      return { message: result.failure.message, requested };
    }),
  );

describe("imageTargetProblem", () => {
  it("allows public http(s) hosts only", () => {
    for (const url of [
      "https://images.botc.app/seer.png",
      "http://cdn.example.co.uk/a.webp",
      "https://8.8.8.8/a.png",
    ])
      assert.isUndefined(imageTargetProblem(new URL(url)), url);

    for (const url of [
      "ftp://images.botc.app/a.png",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "https://user:pass@images.botc.app/a.png",
      "https://images.botc.app:8443/a.png",
      "http://localhost/a.png",
      "http://app.localhost/a.png",
      "http://intranet/a.png",
      "http://printer.local/a.png",
      "http://service.internal/a.png",
      "https://example.org/a.png",
      "https://images.invalid/a.png",
      "http://127.0.0.1/a.png",
      "http://2130706433/a.png",
      "http://0x7f.1/a.png",
      "http://10.1.2.3/a.png",
      "http://172.20.0.1/a.png",
      "http://192.168.1.1/a.png",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/a.png",
      "http://0.0.0.0/a.png",
      "http://[::1]/a.png",
      "http://[fd00::1]/a.png",
    ])
      assert.isDefined(imageTargetProblem(new URL(url)), url);
  });
});

describe("httpImageFetcher", () => {
  it.effect("returns the bytes and sniffed type, whatever the declared Content-Type", () =>
    Effect.gen(function* () {
      const { result } = yield* fetchWith(
        {
          "https://art.botc.app/a.png": () =>
            new Response(image, { headers: { "content-type": "text/plain" } }),
        },
        "https://art.botc.app/a.png",
      );

      assert(Result.isSuccess(result));
      assert.deepStrictEqual(result.success, { bytes: image, contentType: "image/png" });
    }),
  );

  it.effect("follows bounded redirects, checking every target before requesting it", () =>
    Effect.gen(function* () {
      const redirect = (location: string) => () =>
        new Response(null, { status: 302, headers: { location } });

      const followed = yield* fetchWith(
        {
          "https://a.botc.app/x": redirect("/y"),
          "https://a.botc.app/y": redirect("https://b.botc.app/z.png"),
          "https://b.botc.app/z.png": () => new Response(image),
        },
        "https://a.botc.app/x",
      );

      assert.isTrue(Result.isSuccess(followed.result));

      const metadata = yield* failure(
        { "https://a.botc.app/x": redirect("http://169.254.169.254/latest") },
        "https://a.botc.app/x",
      );

      assert.match(metadata.message, /can’t copy images from this address/);
      assert.deepStrictEqual(metadata.requested, ["https://a.botc.app/x"]);

      const loop = yield* failure(
        { "https://a.botc.app/x": redirect("https://a.botc.app/x") },
        "https://a.botc.app/x",
      );

      assert.match(loop.message, /redirected too many times/);
      assert.lengthOf(loop.requested, MAX_REDIRECTS + 1);
    }),
  );

  it.effect("refuses unsafe targets without any request", () =>
    Effect.gen(function* () {
      for (const url of ["http://127.0.0.1/a.png", "not a url", "https://example.org/a.png"]) {
        const { requested } = yield* failure({}, url);
        assert.deepStrictEqual(requested, [], url);
      }
    }),
  );

  it.effect("reports unreachable hosts, HTTP errors, oversized bodies and non-images", () =>
    Effect.gen(function* () {
      const url = "https://art.botc.app/a.png";
      const oversized = new Uint8Array(SOURCE_BYTE_LIMIT + 1);
      oversized.set(image);

      const cases: ReadonlyArray<readonly [(() => Response) | undefined, RegExp]> = [
        [undefined, /couldn’t be reached/],
        [() => new Response("missing", { status: 404 }), /HTTP 404/],
        [
          () =>
            new Response(image, { headers: { "content-length": String(SOURCE_BYTE_LIMIT + 1) } }),
          /larger than 10 MB/,
        ],
        // A host that understates or omits its length is still cut off.
        [() => new Response(new Blob([oversized]).stream()), /larger than 10 MB/],
        [() => new Response("<svg onload=alert(1)>"), /didn’t return a PNG, JPEG, WebP or GIF/],
        [() => new Response(new Uint8Array()), /didn’t return a PNG, JPEG, WebP or GIF/],
      ];

      for (const [route, expected] of cases) {
        const { message } = yield* failure(route === undefined ? {} : { [url]: route }, url);
        assert.match(message, expected);
      }
    }),
  );
});
