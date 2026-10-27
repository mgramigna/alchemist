import {
  SOURCE_BYTE_LIMIT,
  sniffImageType,
  sourceProblem,
  type SourceType,
} from "@alchemist/domain";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

export interface FetchedImage {
  readonly bytes: Uint8Array;
  readonly contentType: SourceType;
}

// The message is shown to the owner beside the failed slot.
export class ImageFetchFailed extends Schema.TaggedError<
  ImageFetchFailed,
  { readonly brand: unique symbol }
>()("ImageFetchFailed", { message: Schema.String }) {}

/**
 * Downloads an untrusted external image for import. Every failure, whatever
 * the cause, is an ImageFetchFailed the owner can act on.
 */
export class ImageFetcher extends Context.Service<
  ImageFetcher,
  { readonly fetch: (url: string) => Effect.Effect<FetchedImage, ImageFetchFailed> }
>()("alchemist/ImageFetcher") {}

export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT = "15 seconds";

const REFUSED = "Alchemist can’t copy images from this address. Use a public http(s) image URL.";
const UNREACHABLE = "The image host couldn’t be reached. Retry later or replace the image.";

// Special-use and documentation names (RFC 2606, RFC 6761) that never name a public host.
const RESERVED_SUFFIXES = [".localhost", ".local", ".internal", ".test", ".example", ".invalid"];
const RESERVED_HOSTS = ["localhost", "example.com", "example.net", "example.org"];

// IPv4 ranges that are not publicly routable: this network, private, CGNAT,
// loopback, link-local, IETF protocol assignments, benchmarking, multicast and reserved.
const PRIVATE_IPV4: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 8],
  [10, 0, 8],
  [100, 64, 10],
  [127, 0, 8],
  [169, 254, 16],
  [172, 16, 12],
  [192, 0, 24],
  [192, 168, 16],
  [198, 18, 15],
  [224, 0, 3],
];

const privateIpv4 = (host: string) => {
  const parts = host.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  const address = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

  return PRIVATE_IPV4.some(([first, second, bits]) => {
    const mask = (0xffffffff << (32 - bits)) >>> 0;

    return (address & mask) >>> 0 === (((first << 24) | (second << 16)) & mask) >>> 0;
  });
};

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

/**
 * Why Alchemist refuses to request this URL, if it does. The WHATWG parser
 * has already normalized numeric host forms such as `http://2130706433/` to
 * dotted IPv4. Hostnames that resolve to private addresses are refused by the
 * Workers runtime itself, which cannot reach private networks.
 */
export const imageTargetProblem = (url: URL): string | undefined => {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  if (url.protocol !== "https:" && url.protocol !== "http:") return REFUSED;

  // Credentials and non-default ports point at something other than a public image host.
  if (url.username !== "" || url.password !== "" || url.port !== "") return REFUSED;

  // IPv6 literals are refused outright rather than classified.
  if (host.startsWith("[") || !host.includes(".")) return REFUSED;

  if (
    RESERVED_HOSTS.includes(host) ||
    RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    (IPV4.test(host) && privateIpv4(host))
  )
    return REFUSED;

  return undefined;
};

const failed = (message: string) => new ImageFetchFailed({ message });

/** Fetches over the given HttpClient, which must not follow redirects itself. */
export const httpImageFetcher = Layer.effect(
  ImageFetcher,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    // Each hop is checked before it is requested, including redirect targets.
    const request = Effect.fn("ImageFetcher.request")(function* (start: URL) {
      let url = start;

      for (let hops = 0; ; hops++) {
        const problem = imageTargetProblem(url);

        if (problem !== undefined) return yield* failed(problem);

        const response = yield* client
          .execute(
            HttpClientRequest.get(url).pipe(
              HttpClientRequest.setHeader("accept", "image/png,image/jpeg,image/webp,image/gif"),
            ),
          )
          .pipe(Effect.mapError(() => failed(UNREACHABLE)));

        if (response.status < 300 || response.status >= 400) {
          if (response.status < 200 || response.status >= 300)
            return yield* failed(`The image host answered HTTP ${response.status}.`);

          return response;
        }

        const location = response.headers["location"];

        if (location === undefined || hops >= MAX_REDIRECTS)
          return yield* failed("The image host redirected too many times.");
        url = new URL(location, url);
      }
    });

    const tooLarge = () =>
      failed(`The image is larger than ${SOURCE_BYTE_LIMIT / 1024 / 1024} MB.`);

    const download = Effect.fn("ImageFetcher.download")(function* (source: string) {
      const url = URL.parse(source);

      if (url === null) return yield* failed(REFUSED);
      const response = yield* request(url);
      const declared = Number(response.headers["content-length"]);

      if (declared > SOURCE_BYTE_LIMIT) return yield* tooLarge();

      // Read at most the limit, whatever the host declared.
      const chunks: Array<Uint8Array> = [];
      let size = 0;

      yield* response.stream.pipe(
        Stream.mapError(() => failed(UNREACHABLE)),
        Stream.runForEach((chunk) => {
          size += chunk.length;

          if (size > SOURCE_BYTE_LIMIT) return Effect.fail(tooLarge());
          chunks.push(chunk);

          return Effect.void;
        }),
      );

      const bytes = new Uint8Array(size);
      let offset = 0;

      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }

      // The content itself decides, never the declared Content-Type.
      const contentType = sniffImageType(bytes);
      const invalid = sourceProblem(bytes);

      if (invalid !== undefined || contentType === undefined)
        return yield* failed("The address didn’t return a PNG, JPEG, WebP or GIF image.");

      return { bytes, contentType };
    });

    return ImageFetcher.of({
      fetch: (source) =>
        download(source).pipe(
          Effect.timeoutOrElse({
            duration: FETCH_TIMEOUT,
            orElse: () => Effect.fail(failed("The image host took too long to respond.")),
          }),
          Effect.tapError((error) => Effect.logWarning("Imported image copy failed", error)),
        ),
    });
  }),
);
