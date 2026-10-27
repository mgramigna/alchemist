import { ScriptReadUnavailable, ScriptWriteUnavailable, type SourceType } from "@alchemist/domain";
import { Context, Effect, Layer, Option } from "effect";

/** Published images never change, so any cache may keep them for a year. */
export const PUBLISHED_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface PublishedImage {
  readonly bytes: Uint8Array;
  readonly etag: string;
}

/**
 * Private originals and immutable published variants, kept in separate
 * buckets. Publishing refuses to replace an existing key, so a published URL
 * always means the image first written there.
 */
export class ArtworkStorage extends Context.Service<
  ArtworkStorage,
  {
    readonly putSource: (
      key: string,
      bytes: Uint8Array,
      contentType: SourceType,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly readSource: (
      key: string,
    ) => Effect.Effect<Option.Option<Uint8Array>, ScriptReadUnavailable>;
    readonly deleteSources: (prefix: string) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly deleteSource: (key: string) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly publish: (
      key: string,
      image: Uint8Array,
      contentType: SourceType,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly readPublished: (
      key: string,
    ) => Effect.Effect<Option.Option<PublishedImage>, ScriptReadUnavailable>;
  }
>()("alchemist/ArtworkStorage") {}

const read = <A>(attempt: () => Promise<A>) =>
  Effect.tryPromise(attempt).pipe(
    Effect.tapCause(Effect.logError),
    Effect.mapError(() => new ScriptReadUnavailable({})),
  );

const write = <A>(attempt: () => Promise<A>) =>
  Effect.tryPromise(attempt).pipe(
    Effect.tapCause(Effect.logError),
    Effect.mapError(() => new ScriptWriteUnavailable({})),
  );

/** The part of an R2 bucket binding the adapter uses. */
export interface ObjectBucket {
  get(key: string): Promise<{
    readonly httpEtag: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  put(
    key: string,
    value: Uint8Array,
    options: {
      readonly onlyIf?: { readonly etagDoesNotMatch: string };
      readonly httpMetadata: { readonly contentType: string; readonly cacheControl?: string };
    },
  ): Promise<{ readonly key: string } | null>;
  delete(key: string | string[]): Promise<void>;
  list(options: { readonly prefix: string; readonly cursor?: string }): Promise<{
    readonly objects: ReadonlyArray<{ readonly key: string }>;
    readonly truncated: boolean;
    readonly cursor?: string;
  }>;
}

/** R2 adapter over the two Worker bucket bindings. */
export const r2ArtworkStorage = (sources: ObjectBucket, published: ObjectBucket) =>
  Layer.succeed(
    ArtworkStorage,
    ArtworkStorage.of({
      putSource: Effect.fn("R2ArtworkStorage.putSource")(function* (key, bytes, contentType) {
        yield* write(() => sources.put(key, bytes, { httpMetadata: { contentType } }));
      }),
      readSource: Effect.fn("R2ArtworkStorage.readSource")(function* (key) {
        const object = yield* read(() => sources.get(key));

        if (object === null) return Option.none();

        return Option.some(new Uint8Array(yield* read(() => object.arrayBuffer())));
      }),
      deleteSources: Effect.fn("R2ArtworkStorage.deleteSources")(function* (prefix) {
        let cursor: string | undefined;

        do {
          const page = yield* write(() =>
            sources.list(cursor === undefined ? { prefix } : { prefix, cursor }),
          );

          if (page.objects.length > 0)
            yield* write(() => sources.delete(page.objects.map((object) => object.key)));
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor !== undefined);
      }),
      deleteSource: Effect.fn("R2ArtworkStorage.deleteSource")(function* (key) {
        yield* write(() => sources.delete(key));
      }),
      publish: Effect.fn("R2ArtworkStorage.publish")(function* (key, image, contentType) {
        // A precondition no existing object can satisfy: never overwrite a published image.
        const object = yield* write(() =>
          published.put(key, image, {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType, cacheControl: PUBLISHED_CACHE_CONTROL },
          }),
        );

        if (object === null) {
          yield* Effect.logError(`Refused to overwrite published artwork ${key}`);

          return yield* new ScriptWriteUnavailable({});
        }
      }),
      readPublished: Effect.fn("R2ArtworkStorage.readPublished")(function* (key) {
        const object = yield* read(() => published.get(key));

        if (object === null) return Option.none();

        // Published images are bounded by the upload limits, so buffering them is acceptable.
        return Option.some({
          bytes: new Uint8Array(yield* read(() => object.arrayBuffer())),
          etag: object.httpEtag,
        });
      }),
    }),
  );
