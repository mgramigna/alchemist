import {
  ArtworkConflict,
  ArtworkInvalid,
  ArtworkNotFound,
  sniffImageType,
  sourceProblem,
  variantsProblem,
  IMAGE_EXTENSIONS,
  NO_SCRIPT_ARTWORK,
  type ArtworkRestyle,
  type ArtworkSource,
  type ArtworkUpload,
  type CharacterArtwork,
  type RenderedVariant,
  type SourceType,
  AUTO_STYLE,
  genericIconAt,
  INVALID_REFERENCE,
  type ImportedArtwork,
  type ImportedArtworkField,
  type ImportedArtworkRepair,
  ImportedData,
  ImportDraft,
  ImportReview,
  ScriptImportInvalid,
  reviewImport,
  ScriptExportInvalid,
  botcDocument,
  botcSchemaProblems,
  scriptExportProblems,
  Jinx,
  JinxPair,
  JinxInvalid,
  JinxConflict,
  JinxNotFound,
  jinxPair,
  Character,
  CharacterId,
  CharacterNotFound,
  CharacterOrderInvalid,
  characterOrderProblem,
  type CharacterOrder,
  NightOrderInvalid,
  OwnedScript,
  PublicScript,
  ScriptId,
  ScriptNotFound,
  ScriptReadUnavailable,
  ScriptWriteUnavailable,
  addBeforeDawn,
  nightOrderProblem,
  scriptFileStem,
  type AuthoredTeam,
  type CharacterDetails,
  type Night,
  type NightOrder,
  type NightOrders,
  type ScriptArtwork,
  type ScriptArtworkField,
  type ScriptDetails,
  type ScriptExportSource,
} from "@alchemist/domain";
import { CurrentUser } from "@alchemist/domain/rpc";
import { Clock, Context, Effect, Layer, Option, Result, Schema } from "effect";
import { ArtworkStorage } from "./artwork-storage.ts";
import { ImageFetchFailed, ImageFetcher, type FetchedImage } from "./image-fetch.ts";
import { createId } from "./ids.ts";

/** Current artwork as stored, including the private original's format. */
export interface StoredArtwork extends CharacterArtwork {
  readonly sourceType: SourceType;
}

/** A Script's current logo or background: the private original and its published copy. */
export interface StoredScriptImage {
  readonly sourceId: string;
  readonly sourceType: SourceType;
  readonly path: string;
}

export type StoredScriptArtwork = Record<ScriptArtworkField, StoredScriptImage | null>;

export const publicScriptArtwork = (artwork: StoredScriptArtwork): ScriptArtwork => ({
  logo: artwork.logo?.path ?? null,
  background: artwork.background?.path ?? null,
});

// Originals are grouped by Script so its deletion can find them.
export const sourceKey = (scriptId: ScriptId, sourceId: string) => `${scriptId}/${sourceId}`;

// Published paths are also their bucket keys, and resolve against the asset origin.
export const PUBLISHED_PREFIX = "/artwork/";

export const PUBLISHED_TYPES = new Map(
  Object.entries(IMAGE_EXTENSIONS).map(([type, extension]) => [extension, type]),
);

export const PUBLISHED_PATH = new RegExp(
  `^${PUBLISHED_PREFIX}[0-9a-z]{26}\\.(${[...PUBLISHED_TYPES.keys()].join("|")})$`,
);

/**
 * What a copy of imported artwork makes current. Character artwork switches
 * only while its original is still `expectedSourceId` (null: none yet); a
 * Script slot is filled only while empty.
 */
export type ImportedCopy =
  | {
      readonly kind: "character";
      readonly artwork: StoredArtwork;
      readonly expectedSourceId: string | null;
    }
  | { readonly kind: "script"; readonly image: StoredScriptImage };

export class ScriptStore extends Context.Service<
  ScriptStore,
  {
    readonly pendingDeletions: (
      ownerId: string,
    ) => Effect.Effect<ReadonlyArray<ScriptId>, ScriptReadUnavailable>;
    readonly finishDeletion: (
      ownerId: string,
      id: ScriptId,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly deleteOwned: (
      ownerId: string,
      id: ScriptId,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // The Character's saved Team and current artwork; None unless the owner's Character exists.
    readonly findArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
    ) => Effect.Effect<
      Option.Option<{ readonly team: AuthoredTeam; readonly artwork: StoredArtwork | null }>,
      ScriptReadUnavailable
    >;
    // Switches to the new artwork only while the current original is still
    // `expectedSourceId` (null: none yet), also dropping any imported image
    // reference for the Character. False means nothing was written.
    readonly replaceArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      artwork: StoredArtwork,
      expectedSourceId: string | null,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // Also drops any imported image reference for the Character.
    readonly deleteArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // The owner's Script artwork slots; None unless the owner's Script exists.
    readonly findScriptArtwork: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<Option.Option<StoredScriptArtwork>, ScriptReadUnavailable>;
    // Switches the slot only while its original is still `expectedSourceId`
    // (null: empty), also dropping any imported reference for the same slot.
    // False means nothing was written.
    readonly replaceScriptArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      field: ScriptArtworkField,
      image: StoredScriptImage,
      expectedSourceId: string | null,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // Empties the slot only while its original is still `expectedSourceId`.
    readonly deleteScriptArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      field: ScriptArtworkField,
      expectedSourceId: string,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // Drops the imported reference and, for a Character image, any imported
    // artwork made from it. Uploaded artwork is never removed here.
    readonly useGenericArtwork: (
      ownerId: string,
      id: ScriptId,
      field: ImportedArtworkField,
      characterId: CharacterId | null,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    // Replaces the matching imported reference with `reference` and makes the
    // copy current, atomically and only while that reference still exists.
    // False means nothing was written.
    readonly saveImportedArtwork: (
      ownerId: string,
      scriptId: ScriptId,
      reference: ImportedArtwork,
      copy: ImportedCopy | null,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    readonly insertImport: (
      ownerId: string,
      script: OwnedScript,
      draft: ImportDraft,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    readonly readImported: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<ImportedData | null, ScriptReadUnavailable>;
    // Internal snapshot for export; imported private sources never cross the RPC boundary.
    readonly findExport: (
      id: ScriptId,
    ) => Effect.Effect<Option.Option<ScriptExportSource>, ScriptReadUnavailable>;
    readonly findPublic: (
      id: ScriptId,
    ) => Effect.Effect<Option.Option<PublicScript>, ScriptReadUnavailable>;
    // Also stores the default Night Orders, in the same atomic write.
    readonly insert: (
      ownerId: string,
      script: OwnedScript,
    ) => Effect.Effect<void, ScriptWriteUnavailable>;
    // Every owner query is scoped by ownerId in storage, not filtered afterwards.
    readonly listOwned: (
      ownerId: string,
    ) => Effect.Effect<ReadonlyArray<OwnedScript>, ScriptReadUnavailable>;
    readonly findOwned: (
      ownerId: string,
      id: ScriptId,
    ) => Effect.Effect<Option.Option<OwnedScript>, ScriptReadUnavailable>;
    readonly updateDetails: (
      ownerId: string,
      id: ScriptId,
      details: ScriptDetails,
      now: number,
    ) => Effect.Effect<Option.Option<OwnedScript>, ScriptWriteUnavailable>;
    // Character writes check ownership of the Script in storage and also record
    // the Script's change time. None means the Script (or Character) is not the owner's.
    readonly listCharacters: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Character>, ScriptReadUnavailable>;
    // Writes the Character and the Script's resulting Night Orders together.
    readonly insertCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      character: Character,
      nightOrders: NightOrders,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    readonly updateCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      details: CharacterDetails,
      now: number,
    ) => Effect.Effect<Option.Option<Character>, ScriptWriteUnavailable>;
    // Removes Night Order memberships, attached Jinxes and the current artwork
    // reference in the same atomic write.
    readonly deleteCharacter: (
      ownerId: string,
      scriptId: ScriptId,
      id: CharacterId,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    readonly listJinxes: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Jinx>, ScriptReadUnavailable>;
    readonly insertJinx: (
      ownerId: string,
      scriptId: ScriptId,
      jinx: Jinx,
      now: number,
    ) => Effect.Effect<Option.Option<Jinx>, ScriptWriteUnavailable>;
    readonly updateJinx: (
      ownerId: string,
      scriptId: ScriptId,
      jinx: Jinx,
      now: number,
    ) => Effect.Effect<Option.Option<Jinx>, ScriptWriteUnavailable>;
    readonly deleteJinx: (
      ownerId: string,
      scriptId: ScriptId,
      pair: JinxPair,
      now: number,
    ) => Effect.Effect<boolean, ScriptWriteUnavailable>;
    readonly findNightOrders: (
      ownerId: string,
      scriptId: ScriptId,
    ) => Effect.Effect<Option.Option<NightOrders>, ScriptReadUnavailable>;
    // Positions each listed Character by its index. None means the Script is not the owner's.
    readonly replaceCharacterOrder: (
      ownerId: string,
      scriptId: ScriptId,
      order: CharacterOrder,
      now: number,
    ) => Effect.Effect<Option.Option<CharacterOrder>, ScriptWriteUnavailable>;
    // Storage refuses entries naming another Script's Characters, failing the whole write.
    readonly replaceNightOrder: (
      ownerId: string,
      scriptId: ScriptId,
      night: Night,
      order: NightOrder,
      now: number,
    ) => Effect.Effect<Option.Option<NightOrders>, ScriptWriteUnavailable>;
  }
>()("alchemist/ScriptStore") {}

export class Scripts extends Context.Service<
  Scripts,
  {
    readonly delete: (
      id: ScriptId,
    ) => Effect.Effect<ScriptId, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly uploadArtwork: (
      scriptId: ScriptId,
      id: CharacterId,
      upload: ArtworkUpload,
    ) => Effect.Effect<
      CharacterArtwork,
      CharacterNotFound | ArtworkInvalid | ArtworkConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly restyleArtwork: (
      scriptId: ScriptId,
      id: CharacterId,
      restyle: ArtworkRestyle,
    ) => Effect.Effect<
      CharacterArtwork,
      ArtworkNotFound | ArtworkInvalid | ArtworkConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly readArtworkSource: (
      scriptId: ScriptId,
      id: CharacterId,
    ) => Effect.Effect<ArtworkSource, ArtworkNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly removeArtwork: (
      scriptId: ScriptId,
      id: CharacterId,
    ) => Effect.Effect<CharacterId, ArtworkNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly useGenericArtwork: (
      id: ScriptId,
      field: ImportedArtworkField,
      characterId: CharacterId | null,
    ) => Effect.Effect<ScriptId, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    // Copies the reference's uncopied slots again. Published URLs on the asset
    // origin are reused without a network request.
    readonly retryImportedArtwork: (
      id: ScriptId,
      field: ImportedArtworkField,
      characterId: CharacterId | null,
      assetOrigin: string,
    ) => Effect.Effect<
      ImportedArtworkRepair,
      ScriptNotFound | ArtworkConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly readScriptArtwork: (
      id: ScriptId,
    ) => Effect.Effect<ScriptArtwork, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly uploadScriptArtwork: (
      id: ScriptId,
      field: ScriptArtworkField,
      source: Uint8Array,
    ) => Effect.Effect<
      ScriptArtwork,
      ScriptNotFound | ArtworkInvalid | ArtworkConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly removeScriptArtwork: (
      id: ScriptId,
      field: ScriptArtworkField,
    ) => Effect.Effect<
      ScriptArtwork,
      ScriptNotFound | ArtworkConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly reviewImport: (json: string) => Effect.Effect<ImportReview, never, CurrentUser>;
    // Commits the Script first, then copies its artwork; copy failures are
    // recorded per slot and never fail the import.
    readonly importJson: (
      json: string,
      acknowledgeDiscard: boolean,
      assetOrigin: string,
    ) => Effect.Effect<OwnedScript, ScriptImportInvalid | ScriptWriteUnavailable, CurrentUser>;
    readonly readImported: (
      id: ScriptId,
    ) => Effect.Effect<ImportedData | null, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly readPublic: (
      id: ScriptId,
    ) => Effect.Effect<PublicScript, ScriptNotFound | ScriptReadUnavailable>;
    readonly exportPublicJson: (
      id: ScriptId,
      assetOrigin: string,
    ) => Effect.Effect<
      { readonly filename: string; readonly json: string },
      ScriptNotFound | ScriptReadUnavailable | ScriptExportInvalid
    >;
    // Owner operations act as the signed-in User; only Authentication or an explicit test provides one.
    readonly exportJson: (
      id: ScriptId,
      assetOrigin: string,
    ) => Effect.Effect<
      { readonly filename: string; readonly json: string },
      ScriptNotFound | ScriptReadUnavailable | ScriptExportInvalid,
      CurrentUser
    >;
    readonly create: () => Effect.Effect<OwnedScript, ScriptWriteUnavailable, CurrentUser>;
    readonly listOwned: () => Effect.Effect<
      ReadonlyArray<OwnedScript>,
      ScriptReadUnavailable,
      CurrentUser
    >;
    readonly readOwned: (
      id: ScriptId,
    ) => Effect.Effect<OwnedScript, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly updateDetails: (
      id: ScriptId,
      details: ScriptDetails,
    ) => Effect.Effect<OwnedScript, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly listCharacters: (
      scriptId: ScriptId,
    ) => Effect.Effect<
      ReadonlyArray<Character>,
      ScriptNotFound | ScriptReadUnavailable,
      CurrentUser
    >;
    readonly createCharacter: (
      scriptId: ScriptId,
      team: AuthoredTeam,
      nights: ReadonlyArray<Night>,
    ) => Effect.Effect<Character, ScriptNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly updateCharacter: (
      scriptId: ScriptId,
      id: CharacterId,
      details: CharacterDetails,
    ) => Effect.Effect<Character, CharacterNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly deleteCharacter: (
      scriptId: ScriptId,
      id: CharacterId,
    ) => Effect.Effect<CharacterId, CharacterNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly listJinxes: (
      scriptId: ScriptId,
    ) => Effect.Effect<ReadonlyArray<Jinx>, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly createJinx: (
      scriptId: ScriptId,
      pair: JinxPair,
    ) => Effect.Effect<
      Jinx,
      ScriptNotFound | JinxInvalid | JinxConflict | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly updateJinx: (
      scriptId: ScriptId,
      jinx: Jinx,
    ) => Effect.Effect<Jinx, JinxNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly deleteJinx: (
      scriptId: ScriptId,
      pair: JinxPair,
    ) => Effect.Effect<JinxPair, JinxNotFound | ScriptWriteUnavailable, CurrentUser>;
    readonly replaceCharacterOrder: (
      scriptId: ScriptId,
      order: CharacterOrder,
    ) => Effect.Effect<
      CharacterOrder,
      ScriptNotFound | CharacterOrderInvalid | ScriptWriteUnavailable,
      CurrentUser
    >;
    readonly readNightOrders: (
      scriptId: ScriptId,
    ) => Effect.Effect<NightOrders, ScriptNotFound | ScriptReadUnavailable, CurrentUser>;
    readonly replaceNightOrder: (
      scriptId: ScriptId,
      night: Night,
      order: NightOrder,
    ) => Effect.Effect<
      NightOrders,
      ScriptNotFound | NightOrderInvalid | ScriptWriteUnavailable,
      CurrentUser
    >;
  }
>()("alchemist/Scripts") {}

// A write that needs a fresh read reports a failed read as a failed write.
const readForWrite = <A, E, R>(effect: Effect.Effect<A, E | ScriptReadUnavailable, R>) =>
  effect.pipe(
    Effect.catchTag("ScriptReadUnavailable", () => Effect.fail(new ScriptWriteUnavailable({}))),
  );

const ownerArtwork = ({
  team,
  variants,
  sourceId,
  style,
  imported,
}: StoredArtwork): CharacterArtwork =>
  imported ? { team, variants, sourceId, style, imported } : { team, variants, sourceId, style };

const sameReference = (
  art: ImportedArtwork,
  field: ImportedArtworkField,
  characterId: CharacterId | null,
) => art.field === field && (art.characterId ?? null) === characterId;

const STORE_FAILED = "Alchemist couldn’t save the copy. Retry.";

// A copied slot's published image, and its bytes for a possible private source.
// A generic icon from an earlier export has no bytes: it stays generic.
interface SlotCopy extends Partial<FetchedImage> {
  readonly path: string;
}

const GENERIC_PATH = /^\/icons\/generic\/v\d+\/[a-z]+-[a-z]+\.svg$/;

export const ScriptsLive = Layer.effect(
  Scripts,
  Effect.gen(function* () {
    const store = yield* ScriptStore;
    const storage = yield* ArtworkStorage;
    const fetcher = yield* ImageFetcher;

    // Cleanup of a private original that is no longer, or never became, current.
    // Its failure is logged by the adapter and never undoes the saved change.
    const discardSource = (scriptId: ScriptId, sourceId: string) =>
      storage.deleteSource(sourceKey(scriptId, sourceId)).pipe(Effect.ignore);

    // Each variant gets a fresh opaque key; nothing published is ever replaced.
    const publishVariants = (variants: ReadonlyArray<RenderedVariant>) =>
      Effect.forEach(variants, ({ variant, image }) => {
        const path = `${PUBLISHED_PREFIX}${createId()}.png`;

        return storage
          .publish(path.slice(1), image, "image/png")
          .pipe(Effect.as({ variant, path }));
      });

    // One imported slot, copied unchanged. An image already published by
    // Alchemist (a re-imported export) keeps its immutable URL; anything else
    // is fetched and published under a fresh key.
    const copySlot = (source: string, assetOrigin: string) =>
      Effect.gen(function* () {
        const url = URL.parse(source);

        if (url === null) return yield* new ImageFetchFailed({ message: INVALID_REFERENCE });

        if (url.origin === new URL(assetOrigin).origin && GENERIC_PATH.test(url.pathname))
          return { path: url.pathname } satisfies SlotCopy;

        if (url.origin === new URL(assetOrigin).origin && PUBLISHED_PATH.test(url.pathname)) {
          const published = yield* storage
            .readPublished(url.pathname.slice(1))
            .pipe(Effect.mapError(() => new ImageFetchFailed({ message: STORE_FAILED })));

          const contentType = Option.isSome(published)
            ? sniffImageType(published.value.bytes)
            : undefined;

          if (Option.isNone(published) || contentType === undefined)
            return yield* new ImageFetchFailed({
              message: "This Alchemist image no longer exists. Replace it.",
            });

          return { bytes: published.value.bytes, contentType, path: url.pathname };
        }

        const image: FetchedImage = yield* fetcher.fetch(source);
        const path = `${PUBLISHED_PREFIX}${createId()}.${IMAGE_EXTENSIONS[image.contentType]}`;

        yield* storage
          .publish(path.slice(1), image.bytes, image.contentType)
          .pipe(Effect.mapError(() => new ImageFetchFailed({ message: STORE_FAILED })));

        return { ...image, path };
      });

    // Attempts every uncopied slot of one reference, then records each slot's
    // outcome and the resulting artwork in one conditional write.
    const copyImported = Effect.fn("Scripts.copyImported")(function* (
      ownerId: string,
      scriptId: ScriptId,
      field: ImportedArtworkField,
      characterId: CharacterId | null,
      assetOrigin: string,
    ) {
      const scriptArtwork = yield* readForWrite(store.findScriptArtwork(ownerId, scriptId));

      if (Option.isNone(scriptArtwork)) return yield* new ScriptNotFound({ id: scriptId });
      const imported = yield* readForWrite(store.readImported(ownerId, scriptId));

      const reference = imported?.artwork.find((art) => sameReference(art, field, characterId));

      if (reference === undefined) return yield* new ArtworkConflict({});

      const character =
        characterId === null
          ? undefined
          : Option.getOrUndefined(
              yield* readForWrite(store.findArtwork(ownerId, scriptId, characterId)),
            );

      if (characterId !== null && character === undefined) return yield* new ArtworkConflict({});
      const current = character?.artwork ?? null;

      // Uploaded artwork supersedes the reference; it should already be gone.
      if (current !== null && !current.imported) return yield* new ArtworkConflict({});

      const results = yield* Effect.forEach(
        reference.slots,
        (slot) =>
          slot.state === "copied"
            ? Effect.succeed(undefined)
            : copySlot(slot.source, assetOrigin).pipe(Effect.result),
        { concurrency: 3 },
      );

      const copies = results.map((result) =>
        result !== undefined && Result.isSuccess(result) ? result.success : undefined,
      );

      const next: ImportedArtwork = {
        ...reference,
        slots: reference.slots.map((slot, index) => {
          const result = results[index];

          if (result === undefined) return slot;

          return Result.isSuccess(result)
            ? { source: slot.source, state: "copied" }
            : { source: slot.source, state: "failed", problem: result.failure.message };
        }),
      };

      // The first image copied becomes the private source for restyling, and stays so.
      const existingSource = field === "image" ? current : scriptArtwork.value[field];

      const first = copies.find(
        (copy): copy is Required<SlotCopy> =>
          copy?.bytes !== undefined && copy.contentType !== undefined,
      );

      const source =
        existingSource === null && first !== undefined
          ? { sourceId: createId(), sourceType: first.contentType, path: first.path }
          : undefined;

      if (source !== undefined && first !== undefined)
        yield* storage.putSource(
          sourceKey(scriptId, source.sourceId),
          first.bytes,
          first.contentType,
        );

      const sourceId = source?.sourceId;

      let copy: ImportedCopy | null = null;

      if (characterId !== null && character !== undefined) {
        const team = current?.team ?? character.team;

        const variants = next.slots.map((slot, index) => {
          const fallback = genericIconAt(team, index);
          const path = copies[index]?.path ?? current?.variants[index]?.path;

          return {
            variant: fallback.variant,
            path: slot.state === "copied" && path !== undefined ? path : fallback.path,
          };
        });

        const original = current ?? source;

        if (original !== undefined)
          copy = {
            kind: "character",
            artwork: {
              sourceId: original.sourceId,
              sourceType: original.sourceType,
              style: AUTO_STYLE,
              team,
              variants,
              imported: true,
            },
            expectedSourceId: current?.sourceId ?? null,
          };
      } else if (source !== undefined) copy = { kind: "script", image: source };

      const saved = yield* store
        .saveImportedArtwork(ownerId, scriptId, next, copy, yield* Clock.currentTimeMillis)
        .pipe(
          Effect.onError(() =>
            sourceId === undefined ? Effect.void : discardSource(scriptId, sourceId),
          ),
        );

      if (!saved) {
        if (sourceId !== undefined) yield* discardSource(scriptId, sourceId);

        return yield* new ArtworkConflict({});
      }

      const repair: ImportedArtworkRepair = {
        reference: next,
        scriptArtwork: publicScriptArtwork(
          copy?.kind === "script"
            ? { ...scriptArtwork.value, [field]: copy.image }
            : scriptArtwork.value,
        ),
      };

      return copy?.kind === "character"
        ? { ...repair, characterArtwork: ownerArtwork(copy.artwork) }
        : repair;
    });

    return Scripts.of({
      retryImportedArtwork: Effect.fn("Scripts.retryImportedArtwork")(
        function* (id, field, characterId, assetOrigin) {
          const user = yield* CurrentUser;

          return yield* copyImported(user.id, id, field, characterId, assetOrigin);
        },
      ),
      uploadArtwork: Effect.fn("Scripts.uploadArtwork")(function* (scriptId, id, upload) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findArtwork(user.id, scriptId, id));

        if (Option.isNone(current)) return yield* new CharacterNotFound({ id });
        const sourceType = sniffImageType(upload.source);

        const problem =
          sourceProblem(upload.source) ?? variantsProblem(upload.team, upload.variants);

        if (problem !== undefined || sourceType === undefined)
          return yield* new ArtworkInvalid({ message: problem ?? "Choose an image file." });
        const sourceId = createId();

        yield* storage.putSource(sourceKey(scriptId, sourceId), upload.source, sourceType);

        // Publish everything before switching references; a failure leaves the
        // previous artwork current and drops only the unused original.
        const artwork = yield* Effect.gen(function* () {
          const next: StoredArtwork = {
            sourceId,
            sourceType,
            style: upload.style,
            team: upload.team,
            variants: yield* publishVariants(upload.variants),
          };

          const previous = current.value.artwork?.sourceId ?? null;

          if (
            !(yield* store.replaceArtwork(
              user.id,
              scriptId,
              id,
              next,
              previous,
              yield* Clock.currentTimeMillis,
            ))
          )
            return yield* new ArtworkConflict({});

          return next;
        }).pipe(Effect.onError(() => discardSource(scriptId, sourceId)));

        if (current.value.artwork !== null)
          yield* discardSource(scriptId, current.value.artwork.sourceId);

        return ownerArtwork(artwork);
      }),
      restyleArtwork: Effect.fn("Scripts.restyleArtwork")(function* (scriptId, id, restyle) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findArtwork(user.id, scriptId, id));
        const artwork = Option.getOrNull(current)?.artwork ?? null;

        if (artwork === null) return yield* new ArtworkNotFound({ id });

        if (artwork.sourceId !== restyle.sourceId) return yield* new ArtworkConflict({});
        const problem = variantsProblem(restyle.team, restyle.variants);

        if (problem !== undefined) return yield* new ArtworkInvalid({ message: problem });

        const next: StoredArtwork = {
          ...artwork,
          style: restyle.style,
          team: restyle.team,
          variants: yield* publishVariants(restyle.variants),
        };

        if (
          !(yield* store.replaceArtwork(
            user.id,
            scriptId,
            id,
            next,
            artwork.sourceId,
            yield* Clock.currentTimeMillis,
          ))
        )
          return yield* new ArtworkConflict({});

        return ownerArtwork(next);
      }),
      readArtworkSource: Effect.fn("Scripts.readArtworkSource")(function* (scriptId, id) {
        const user = yield* CurrentUser;
        const current = yield* store.findArtwork(user.id, scriptId, id);
        const artwork = Option.getOrNull(current)?.artwork ?? null;

        if (artwork === null) return yield* new ArtworkNotFound({ id });
        const bytes = yield* storage.readSource(sourceKey(scriptId, artwork.sourceId));

        // A current reference without its original means storage lost data.
        if (Option.isNone(bytes)) {
          yield* Effect.logError(`Missing artwork source ${artwork.sourceId}`);

          return yield* new ScriptReadUnavailable({});
        }

        return { sourceId: artwork.sourceId, contentType: artwork.sourceType, bytes: bytes.value };
      }),
      removeArtwork: Effect.fn("Scripts.removeArtwork")(function* (scriptId, id) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findArtwork(user.id, scriptId, id));
        const artwork = Option.getOrNull(current)?.artwork ?? null;

        if (
          artwork === null ||
          !(yield* store.deleteArtwork(user.id, scriptId, id, yield* Clock.currentTimeMillis))
        )
          return yield* new ArtworkNotFound({ id });

        yield* discardSource(scriptId, artwork.sourceId);

        return id;
      }),
      useGenericArtwork: Effect.fn("Scripts.useGenericArtwork")(function* (id, field, characterId) {
        const user = yield* CurrentUser;

        const current =
          field === "image" && characterId !== null
            ? Option.getOrNull(yield* readForWrite(store.findArtwork(user.id, id, characterId)))
                ?.artwork
            : null;

        if (
          !(yield* store.useGenericArtwork(
            user.id,
            id,
            field,
            characterId,
            yield* Clock.currentTimeMillis,
          ))
        )
          return yield* new ScriptNotFound({ id });

        // Imported artwork was removed with the reference; uploads are untouched.
        if (current?.imported) yield* discardSource(id, current.sourceId);

        return id;
      }),
      readScriptArtwork: Effect.fn("Scripts.readScriptArtwork")(function* (id) {
        const user = yield* CurrentUser;
        const artwork = yield* store.findScriptArtwork(user.id, id);

        if (Option.isNone(artwork)) return yield* new ScriptNotFound({ id });

        return publicScriptArtwork(artwork.value);
      }),
      uploadScriptArtwork: Effect.fn("Scripts.uploadScriptArtwork")(function* (id, field, source) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findScriptArtwork(user.id, id));

        if (Option.isNone(current)) return yield* new ScriptNotFound({ id });
        const sourceType = sniffImageType(source);
        const problem = sourceProblem(source);

        if (problem !== undefined || sourceType === undefined)
          return yield* new ArtworkInvalid({ message: problem ?? "Choose an image file." });
        const sourceId = createId();

        yield* storage.putSource(sourceKey(id, sourceId), source, sourceType);

        // Unlike Character artwork there is no styling: the published copy is
        // the original image, under its own fresh opaque key.
        const image = yield* Effect.gen(function* () {
          const path = `${PUBLISHED_PREFIX}${createId()}.${IMAGE_EXTENSIONS[sourceType]}`;

          yield* storage.publish(path.slice(1), source, sourceType);
          const next: StoredScriptImage = { sourceId, sourceType, path };

          if (
            !(yield* store.replaceScriptArtwork(
              user.id,
              id,
              field,
              next,
              current.value[field]?.sourceId ?? null,
              yield* Clock.currentTimeMillis,
            ))
          )
            return yield* new ArtworkConflict({});

          return next;
        }).pipe(Effect.onError(() => discardSource(id, sourceId)));

        const previous = current.value[field];

        if (previous !== null) yield* discardSource(id, previous.sourceId);

        return publicScriptArtwork({ ...current.value, [field]: image });
      }),
      removeScriptArtwork: Effect.fn("Scripts.removeScriptArtwork")(function* (id, field) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findScriptArtwork(user.id, id));

        if (Option.isNone(current)) return yield* new ScriptNotFound({ id });
        const previous = current.value[field];
        const next = publicScriptArtwork({ ...current.value, [field]: null });

        // Already empty: nothing to remove.
        if (previous === null) return next;

        if (
          !(yield* store.deleteScriptArtwork(
            user.id,
            id,
            field,
            previous.sourceId,
            yield* Clock.currentTimeMillis,
          ))
        )
          return yield* new ArtworkConflict({});

        yield* discardSource(id, previous.sourceId);

        return next;
      }),
      reviewImport: Effect.fn("Scripts.reviewImport")(function* (json) {
        const user = yield* CurrentUser;

        return reviewImport(json, user.displayName);
      }),
      importJson: Effect.fn("Scripts.importJson")(
        function* (json, acknowledgeDiscard, assetOrigin) {
          const user = yield* CurrentUser;
          const review = reviewImport(json, user.displayName);

          if (review.draft === null)
            return yield* new ScriptImportInvalid({ messages: review.errors });

          if (review.discarded.length && !acknowledgeDiscard)
            return yield* new ScriptImportInvalid({
              messages: [
                "Acknowledge the listed unsupported fields before discarding them.",
                ...review.discarded,
              ],
            });
          const now = yield* Clock.currentTimeMillis;

          const script = OwnedScript.make({
            id: ScriptId.make(createId()),
            ...review.draft.script,
            updatedAt: now,
          });

          yield* store.insertImport(user.id, script, review.draft);

          // The Script is saved: from here, no artwork problem may fail the import.
          // Each failure stays on its slot (or the slot stays pending) for retry.
          yield* Effect.forEach(
            review.draft.imported.artwork.filter((art) =>
              art.slots.some((slot) => slot.state === "pending"),
            ),
            (art) =>
              copyImported(
                user.id,
                script.id,
                art.field,
                art.characterId ?? null,
                assetOrigin,
              ).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError("Imported artwork copy was not saved", cause),
                ),
              ),
            { concurrency: 4, discard: true },
          );

          return script;
        },
      ),
      readImported: Effect.fn("Scripts.readImported")(function* (id) {
        const user = yield* CurrentUser;

        if (Option.isNone(yield* store.findOwned(user.id, id)))
          return yield* new ScriptNotFound({ id });

        return yield* store.readImported(user.id, id);
      }),
      readPublic: Effect.fn("Scripts.readPublic")(function* (id) {
        const script = yield* store.findPublic(id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        // Decode the explicit representation, stripping any accidental adapter fields.
        return yield* Schema.decodeEffect(PublicScript)(script.value).pipe(
          Effect.tapCause(Effect.logError),
          Effect.mapError(() => new ScriptReadUnavailable({})),
        );
      }),
      exportPublicJson: Effect.fn("Scripts.exportPublicJson")(function* (id, assetOrigin) {
        const source = yield* store.findExport(id);

        if (Option.isNone(source)) return yield* new ScriptNotFound({ id });

        return yield* serializeExport(source.value, assetOrigin);
      }),
      exportJson: Effect.fn("Scripts.exportJson")(function* (id, assetOrigin) {
        const user = yield* CurrentUser;
        const script = yield* store.findOwned(user.id, id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });
        const characters = yield* store.listCharacters(user.id, id);
        const orders = yield* store.findNightOrders(user.id, id);

        if (Option.isNone(orders)) return yield* new ScriptNotFound({ id });
        const jinxes = yield* store.listJinxes(user.id, id);
        const imported = yield* store.readImported(user.id, id);
        const artwork = yield* store.findScriptArtwork(user.id, id);

        const source = {
          script: script.value,
          characters,
          nightOrders: orders.value,
          jinxes,
          imported: imported ?? undefined,
          artwork: Option.match(artwork, {
            onNone: () => NO_SCRIPT_ARTWORK,
            onSome: publicScriptArtwork,
          }),
        };

        return yield* serializeExport(source, assetOrigin);
      }),
      delete: Effect.fn("Scripts.delete")(function* (id) {
        const user = yield* CurrentUser;

        if (!(yield* store.deleteOwned(user.id, id))) return yield* new ScriptNotFound({ id });

        // D1 deletion is committed already. A storage failure stays visible;
        // repeating this operation uses the durable receipt to retry cleanup.
        yield* storage.deleteSources(`${id}/`);
        yield* store.finishDeletion(user.id, id);

        return id;
      }),
      create: Effect.fn("Scripts.create")(function* () {
        const user = yield* CurrentUser;
        const now = yield* Clock.currentTimeMillis;

        // Author Credit is copied once; later display name changes never rewrite it.
        const script = OwnedScript.make({
          id: ScriptId.make(createId()),
          name: "Untitled Script",
          authorCredit: user.displayName,
          updatedAt: now,
        });

        yield* store.insert(user.id, script);

        return script;
      }),
      listOwned: Effect.fn("Scripts.listOwned")(function* () {
        const user = yield* CurrentUser;

        // Recover interrupted/failed cleanup on the next workspace visit,
        // including after a lost response or a browser restart.
        for (const id of yield* store.pendingDeletions(user.id)) {
          yield* storage.deleteSources(`${id}/`).pipe(
            Effect.andThen(store.finishDeletion(user.id, id)),
            Effect.mapError(() => new ScriptReadUnavailable({})),
          );
        }

        return yield* store.listOwned(user.id);
      }),
      readOwned: Effect.fn("Scripts.readOwned")(function* (id) {
        const user = yield* CurrentUser;
        const script = yield* store.findOwned(user.id, id);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        return script.value;
      }),
      updateDetails: Effect.fn("Scripts.updateDetails")(function* (id, details) {
        const user = yield* CurrentUser;

        const script = yield* store.updateDetails(
          user.id,
          id,
          { name: details.name, authorCredit: details.authorCredit },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id });

        return script.value;
      }),
      listCharacters: Effect.fn("Scripts.listCharacters")(function* (scriptId) {
        const user = yield* CurrentUser;
        const script = yield* store.findOwned(user.id, scriptId);

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id: scriptId });

        return yield* store.listCharacters(user.id, scriptId);
      }),
      createCharacter: Effect.fn("Scripts.createCharacter")(function* (scriptId, team, nights) {
        const user = yield* CurrentUser;
        const now = yield* Clock.currentTimeMillis;

        // Blank drafts are valid; problems surface in the editor and block export only.
        const character = Character.make({
          id: CharacterId.make(createId()),
          name: "",
          ability: "",
          team,
          firstNightInstructions: "",
          otherNightInstructions: "",
          reminders: [],
          remindersGlobal: [],
          setup: false,
          flavor: "",
        });

        const orders = yield* readForWrite(store.findNightOrders(user.id, scriptId));

        if (Option.isNone(orders)) return yield* new ScriptNotFound({ id: scriptId });

        const join = (night: Night) =>
          nights.includes(night)
            ? addBeforeDawn(orders.value[night], character.id)
            : orders.value[night];

        const saved = yield* store.insertCharacter(
          user.id,
          scriptId,
          character,
          { firstNight: join("firstNight"), otherNight: join("otherNight") },
          now,
        );

        if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

        return saved.value;
      }),
      updateCharacter: Effect.fn("Scripts.updateCharacter")(function* (scriptId, id, details) {
        const user = yield* CurrentUser;

        const saved = yield* store.updateCharacter(
          user.id,
          scriptId,
          id,
          {
            name: details.name,
            ability: details.ability,
            team: details.team,
            firstNightInstructions: details.firstNightInstructions,
            otherNightInstructions: details.otherNightInstructions,
            reminders: details.reminders,
            remindersGlobal: details.remindersGlobal,
            setup: details.setup,
            flavor: details.flavor,
          },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new CharacterNotFound({ id });

        return saved.value;
      }),
      deleteCharacter: Effect.fn("Scripts.deleteCharacter")(function* (scriptId, id) {
        const user = yield* CurrentUser;
        const current = yield* readForWrite(store.findArtwork(user.id, scriptId, id));

        const deleted = yield* store.deleteCharacter(
          user.id,
          scriptId,
          id,
          yield* Clock.currentTimeMillis,
        );

        if (!deleted) return yield* new CharacterNotFound({ id });
        const artwork = Option.getOrNull(current)?.artwork ?? null;

        if (artwork !== null) yield* discardSource(scriptId, artwork.sourceId);

        return id;
      }),
      listJinxes: Effect.fn("Scripts.listJinxes")(function* (scriptId) {
        const user = yield* CurrentUser;

        if (Option.isNone(yield* store.findOwned(user.id, scriptId)))
          return yield* new ScriptNotFound({ id: scriptId });

        return yield* store.listJinxes(user.id, scriptId);
      }),
      createJinx: Effect.fn("Scripts.createJinx")(function* (scriptId, pair) {
        const user = yield* CurrentUser;

        if (Option.isNone(yield* readForWrite(store.findOwned(user.id, scriptId))))
          return yield* new ScriptNotFound({ id: scriptId });
        const characters = yield* readForWrite(store.listCharacters(user.id, scriptId));

        if (
          pair.first === pair.second ||
          ![pair.first, pair.second].every((id) => characters.some((c) => c.id === id))
        )
          return yield* new JinxInvalid({
            message: "Choose two distinct Characters from this Script.",
          });
        const canonical = jinxPair(pair.first, pair.second);
        const jinx = { first: canonical.first, second: canonical.second, explanation: "" };

        const saved = yield* store.insertJinx(
          user.id,
          scriptId,
          jinx,
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new JinxConflict({});

        return saved.value;
      }),
      updateJinx: Effect.fn("Scripts.updateJinx")(function* (scriptId, jinx) {
        const user = yield* CurrentUser;
        const pair = jinxPair(jinx.first, jinx.second);

        const saved = yield* store.updateJinx(
          user.id,
          scriptId,
          {
            first: pair.first,
            second: pair.second,
            explanation: jinx.explanation,
          },
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new JinxNotFound({});

        return saved.value;
      }),
      deleteJinx: Effect.fn("Scripts.deleteJinx")(function* (scriptId, pair) {
        const user = yield* CurrentUser;
        const canonical = jinxPair(pair.first, pair.second);

        if (
          !(yield* store.deleteJinx(user.id, scriptId, canonical, yield* Clock.currentTimeMillis))
        )
          return yield* new JinxNotFound({});

        return canonical;
      }),
      replaceCharacterOrder: Effect.fn("Scripts.replaceCharacterOrder")(
        function* (scriptId, order) {
          const user = yield* CurrentUser;
          const script = yield* readForWrite(store.findOwned(user.id, scriptId));

          if (Option.isNone(script)) return yield* new ScriptNotFound({ id: scriptId });

          const characters = yield* readForWrite(store.listCharacters(user.id, scriptId));

          const problem = characterOrderProblem(
            order,
            characters.map(({ id }) => id),
          );

          if (problem !== undefined) return yield* new CharacterOrderInvalid({ message: problem });

          const saved = yield* store.replaceCharacterOrder(
            user.id,
            scriptId,
            order,
            yield* Clock.currentTimeMillis,
          );

          if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

          return saved.value;
        },
      ),
      readNightOrders: Effect.fn("Scripts.readNightOrders")(function* (scriptId) {
        const user = yield* CurrentUser;
        const orders = yield* store.findNightOrders(user.id, scriptId);

        if (Option.isNone(orders)) return yield* new ScriptNotFound({ id: scriptId });

        return orders.value;
      }),
      replaceNightOrder: Effect.fn("Scripts.replaceNightOrder")(function* (scriptId, night, order) {
        const user = yield* CurrentUser;
        const script = yield* readForWrite(store.findOwned(user.id, scriptId));

        if (Option.isNone(script)) return yield* new ScriptNotFound({ id: scriptId });

        const characters = yield* readForWrite(store.listCharacters(user.id, scriptId));

        const problem = nightOrderProblem(
          night,
          order,
          characters.map(({ id }) => id),
        );

        if (problem !== undefined) return yield* new NightOrderInvalid({ night, message: problem });

        const saved = yield* store.replaceNightOrder(
          user.id,
          scriptId,
          night,
          order,
          yield* Clock.currentTimeMillis,
        );

        if (Option.isNone(saved)) return yield* new ScriptNotFound({ id: scriptId });

        return saved.value;
      }),
    });
  }),
);

// Both public and owner downloads enforce the same saved-content rules.
const serializeExport = Effect.fn("Scripts.serializeExport")(function* (
  source: ScriptExportSource,
  assetOrigin: string,
) {
  const problems = scriptExportProblems(source);

  if (problems.length) return yield* new ScriptExportInvalid({ problems });
  const document = botcDocument(source, assetOrigin);
  const schemaProblems = botcSchemaProblems(document);

  if (schemaProblems.length) return yield* new ScriptExportInvalid({ problems: schemaProblems });

  return {
    filename: `${scriptFileStem(source.script.name)}.json`,
    json: JSON.stringify(document, null, 2),
  };
});
