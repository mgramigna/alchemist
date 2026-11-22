import type { Character, CharacterId } from "@alchemist/domain";

/** Letters and digits only, without accents or case, so "the_imp.PNG" matches "The Imp". */
export const nameKey = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

const withoutExtension = (fileName: string) => fileName.replace(/\.[^.]*$/, "");

export type BulkImageState =
  | { readonly kind: "ready" }
  | { readonly kind: "publishing" }
  | { readonly kind: "published" }
  | { readonly kind: "failed"; readonly message: string };

/** An image chosen for bulk upload. It lives only in the browser until published. */
export interface BulkImage {
  readonly key: string;
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  // Why the image can't be published at all, such as an unsupported format.
  readonly problem: string | undefined;
  readonly characterId: CharacterId | null;
  readonly state: BulkImageState;
}

/**
 * Assigns each new image to the Character it is named after, when exactly one
 * Character has that name and no other image is assigned to it. Earlier images win.
 */
export const autoAssign = (
  images: ReadonlyArray<BulkImage>,
  added: ReadonlyArray<BulkImage>,
  characters: ReadonlyArray<Pick<Character, "id" | "name">>,
): ReadonlyArray<BulkImage> => {
  const taken = new Set(images.flatMap(({ characterId }) => characterId ?? []));

  return added.map((image) => {
    if (image.problem !== undefined || image.characterId !== null) return image;
    const key = nameKey(withoutExtension(image.name));
    const matches = characters.filter(({ name }) => key !== "" && nameKey(name) === key);
    const match = matches.length === 1 ? matches[0] : undefined;

    if (match === undefined || taken.has(match.id)) return image;
    taken.add(match.id);

    return { ...image, characterId: match.id };
  });
};

/** Assigns an image to a Character, or unassigns it with null. Published images stay put. */
export const assign = (
  images: ReadonlyArray<BulkImage>,
  key: string,
  characterId: CharacterId | null,
): ReadonlyArray<BulkImage> =>
  images.map((image) =>
    image.key !== key || image.state.kind === "published" || image.state.kind === "publishing"
      ? image
      : { ...image, characterId, state: { kind: "ready" } },
  );

/** Whether an image is assigned to a Character that still exists. */
export const assignedTo = (
  image: BulkImage,
  characters: ReadonlyArray<Pick<Character, "id">>,
): CharacterId | null =>
  image.characterId !== null && characters.some(({ id }) => id === image.characterId)
    ? image.characterId
    : null;

/** Images that Publish would send: assigned, valid, and not yet published. */
export const publishable = (
  images: ReadonlyArray<BulkImage>,
  characters: ReadonlyArray<Pick<Character, "id">>,
) =>
  images.filter(
    (image) =>
      image.problem === undefined &&
      assignedTo(image, characters) !== null &&
      (image.state.kind === "ready" || image.state.kind === "failed"),
  );

export const setState = (
  images: ReadonlyArray<BulkImage>,
  key: string,
  state: BulkImageState,
): ReadonlyArray<BulkImage> =>
  images.map((image) => (image.key === key ? { ...image, state } : image));
