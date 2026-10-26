import { Schema } from "effect";
import {
  ArtworkStyle,
  AuthoredTeam,
  CharacterId,
  IconVariant,
  genericIcons,
  type AuthoredTeam as Team,
} from "./character.ts";

/** Every published Character variant is a square PNG of this size. */
export const ICON_SIZE = 400;

export const SOURCE_BYTE_LIMIT = 10 * 1024 * 1024;
export const VARIANT_BYTE_LIMIT = 2 * 1024 * 1024;

/** Original formats accepted for upload. SVG is refused: it can carry script. */
export const SOURCE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...new TextEncoder().encode(text)];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The image type the bytes actually contain, regardless of what the browser claimed. */
export const sniffImageType = (bytes: Uint8Array): SourceType | undefined => {
  if (startsWith(bytes, PNG)) return "image/png";

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";

  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";

  return undefined;
};

/** Width and height from a PNG's IHDR chunk, which the format requires to come first. */
export const pngDimensions = (bytes: Uint8Array) => {
  if (!startsWith(bytes, PNG) || !startsWith(bytes, ascii("IHDR"), 12) || bytes.length < 24)
    return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const megabytes = (bytes: number) => `${bytes / 1024 / 1024} MB`;

export const sourceProblem = (bytes: Uint8Array): string | undefined => {
  if (bytes.length === 0) return "Choose an image file.";

  if (bytes.length > SOURCE_BYTE_LIMIT)
    return `Use an image of ${megabytes(SOURCE_BYTE_LIMIT)} or less.`;

  if (sniffImageType(bytes) === undefined) return "Use a PNG, JPEG, WebP or GIF image.";

  return undefined;
};

export interface RenderedVariant {
  readonly variant: IconVariant;
  readonly image: Uint8Array;
}

/** Variants must be the Team's full set, in export order, each a 400×400 PNG. */
export const variantsProblem = (
  team: Team,
  variants: ReadonlyArray<RenderedVariant>,
): string | undefined => {
  const expected = genericIcons(team).map(({ variant }) => variant);

  if (
    variants.length !== expected.length ||
    variants.some(({ variant }, index) => variant !== expected[index])
  )
    return `Styled artwork must include the ${expected.join(", ")} variants.`;

  for (const { image } of variants) {
    if (image.length > VARIANT_BYTE_LIMIT)
      return `Each styled variant must be ${megabytes(VARIANT_BYTE_LIMIT)} or less.`;
    const size = pngDimensions(image);

    if (size?.width !== ICON_SIZE || size.height !== ICON_SIZE)
      return `Each styled variant must be a ${ICON_SIZE}×${ICON_SIZE} PNG.`;
  }

  return undefined;
};

const Variants = Schema.Array(Schema.Struct({ variant: IconVariant, image: Schema.Uint8Array }))
  // Travellers have the most variants.
  .check(Schema.isMaxLength(3));

/** A new original and the variants the browser styled from it. */
export const ArtworkUpload = Schema.Struct({
  source: Schema.Uint8Array,
  style: ArtworkStyle,
  team: AuthoredTeam,
  variants: Variants,
});

export interface ArtworkUpload extends Schema.Schema.Type<typeof ArtworkUpload> {}

/** Variants re-rendered from the retained original, which must still be current. */
export const ArtworkRestyle = Schema.Struct({
  sourceId: Schema.String,
  style: ArtworkStyle,
  team: AuthoredTeam,
  variants: Variants,
});

export interface ArtworkRestyle extends Schema.Schema.Type<typeof ArtworkRestyle> {}

export const ArtworkSource = Schema.Struct({
  sourceId: Schema.String,
  contentType: Schema.Literals(SOURCE_TYPES),
  bytes: Schema.Uint8Array,
});

export interface ArtworkSource extends Schema.Schema.Type<typeof ArtworkSource> {}

export class ArtworkInvalid extends Schema.TaggedError<
  ArtworkInvalid,
  { readonly brand: unique symbol }
>()("ArtworkInvalid", { message: Schema.String }) {}

// The current original changed (or was removed) since the browser read it.
export class ArtworkConflict extends Schema.TaggedError<
  ArtworkConflict,
  { readonly brand: unique symbol }
>()("ArtworkConflict", {}) {}

// Also returned for another owner's Character, like CharacterNotFound.
export class ArtworkNotFound extends Schema.TaggedError<
  ArtworkNotFound,
  { readonly brand: unique symbol }
>()("ArtworkNotFound", { id: CharacterId }) {}
