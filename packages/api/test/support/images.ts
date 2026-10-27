import { sniffImageType } from "@alchemist/domain";
import { Effect, Layer } from "effect";
import { ImageFetchFailed, ImageFetcher } from "../../src/image-fetch.ts";

// Just the PNG signature and IHDR chunk the server inspects, plus a marker byte.
export const png = (width: number, height: number, marker = 0) => {
  const bytes = new Uint8Array(34);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[33] = marker;

  return bytes;
};

export const UNREACHABLE = "The image host couldn’t be reached. Retry later or replace the image.";

// External image hosts. Unknown URLs are unreachable; `images` can change
// between attempts to model a host coming back.
export const imageFetcherFixture = () => {
  const images = new Map<string, Uint8Array>();
  const requests: Array<string> = [];

  const layer = Layer.succeed(ImageFetcher, {
    fetch: (url) =>
      Effect.suspend(() => {
        requests.push(url);
        const bytes = images.get(url);
        const contentType = bytes === undefined ? undefined : sniffImageType(bytes);

        return bytes === undefined || contentType === undefined
          ? Effect.fail(new ImageFetchFailed({ message: UNREACHABLE }))
          : Effect.succeed({ bytes, contentType });
      }),
  });

  return { images, requests, layer };
};
