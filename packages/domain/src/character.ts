import { textLength } from "./text.ts";
import { Match, Schema } from "effect";

// New Characters use ULIDs; imports retain valid BOTC IDs within their Script.
export const CharacterId = Schema.String.pipe(Schema.brand("CharacterId"));

export type CharacterId = typeof CharacterId.Type;

// Every Team the model recognizes. Fabled and Loric stay representable so later
// slices (such as import) can recognize them, but they cannot be authored yet.
export const Team = Schema.Literals([
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
  "fabled",
  "loric",
]);

export type Team = typeof Team.Type;

export const AuthoredTeam = Team.pick(["townsfolk", "outsider", "minion", "demon", "traveller"]);

export type AuthoredTeam = typeof AuthoredTeam.Type;

export type Alignment = "good" | "evil";

// Travellers have no Alignment until the game assigns one.
export const defaultAlignment = (team: AuthoredTeam): Alignment | undefined =>
  Match.value(team).pipe(
    Match.withReturnType<Alignment | undefined>(),
    Match.whenOr("townsfolk", "outsider", () => "good"),
    Match.whenOr("minion", "demon", () => "evil"),
    Match.when("traveller", () => undefined),
    Match.exhaustive,
  );

// Storage bounds only. They are looser than the export limits below so drafts
// that are too long to export are kept rather than truncated or rejected.
export const CharacterName = Schema.String.check(
  Schema.isMaxLength(100, { message: "Use 100 characters or fewer." }),
);

export const CharacterAbility = Schema.String.check(
  Schema.isMaxLength(1000, { message: "Use 1000 characters or fewer." }),
);

// Storyteller directions for each night, kept whether or not the Character is
// currently in that night's order.
export const NightInstructions = Schema.String.check(
  Schema.isMaxLength(2000, { message: "Use 2000 characters or fewer." }),
);

// Storage bounds deliberately exceed the export limits so invalid drafts can save.
export const ReminderTokens = Schema.Array(Schema.String.check(Schema.isMaxLength(100))).check(
  Schema.isMaxLength(100),
);

export const CharacterFlavor = Schema.String.check(Schema.isMaxLength(2000));

export const CharacterDetails = Schema.Struct({
  reminders: ReminderTokens,
  remindersGlobal: ReminderTokens,
  setup: Schema.Boolean,
  flavor: CharacterFlavor,
  name: CharacterName,
  ability: CharacterAbility,
  team: AuthoredTeam,
  firstNightInstructions: NightInstructions,
  otherNightInstructions: NightInstructions,
});

export interface CharacterDetails extends Schema.Schema.Type<typeof CharacterDetails> {}

export const IconVariant = Schema.Literals(["regular", "flipped", "unaligned", "good", "evil"]);

export type IconVariant = typeof IconVariant.Type;

// One published 400×400 image. Paths resolve against the asset origin, like generic icons.
export const ArtworkVariant = Schema.Struct({ variant: IconVariant, path: Schema.String });

export interface ArtworkVariant extends Schema.Schema.Type<typeof ArtworkVariant> {}

// The Looks offered after upload. Auto picks Solid for line art and ink, Pale lines for photos.
export const ArtworkLook = Schema.Literals(["auto", "solid", "shaded", "lines"]);

export type ArtworkLook = typeof ArtworkLook.Type;

// How the backdrop is removed: detected, the image's own transparency, light
// paper behind an ink drawing, or a flood in from the edges.
export const ArtworkCutout = Schema.Literals(["auto", "alpha", "light", "edge"]);

export type ArtworkCutout = typeof ArtworkCutout.Type;

// Solid fills the silhouette; Shaded keeps the art's own light and dark.
export const ArtworkColor = Schema.Literals(["solid", "shaded"]);

export type ArtworkColor = typeof ArtworkColor.Type;

const between = (minimum: number, maximum: number) =>
  Schema.Finite.check(Schema.isBetween({ minimum, maximum }));

// Saved per Character and replayed whenever the variants are re-rendered.
// Each Studio setting is absent until the owner changes it; absent means automatic.
export const ArtworkStyle = Schema.Struct({
  look: ArtworkLook,
  cutout: Schema.optionalKey(ArtworkCutout),
  tolerance: Schema.optionalKey(between(0, 0.3)),
  // Color and interior lines override the Look.
  color: Schema.optionalKey(ArtworkColor),
  detail: Schema.optionalKey(between(0, 1)),
  // Outsider cyan and Minion orange for those Teams' regular variants.
  teamShades: Schema.optionalKey(Schema.Boolean),
  texture: Schema.optionalKey(between(0, 1)),
  outline: Schema.optionalKey(between(0, 10)),
  shadow: Schema.optionalKey(between(0, 1)),
  shadowBlur: Schema.optionalKey(between(0, 30)),
  shadowY: Schema.optionalKey(between(-20, 30)),
  // Size is the art's longer side as a share of the icon; offsets are in icon pixels.
  size: Schema.optionalKey(between(0.3, 1)),
  offsetX: Schema.optionalKey(between(-120, 120)),
  offsetY: Schema.optionalKey(between(-120, 120)),
});

export interface ArtworkStyle extends Schema.Schema.Type<typeof ArtworkStyle> {}

// What anyone may see: immutable variants and the Team they were styled for.
export const PublishedArtwork = Schema.Struct({
  team: AuthoredTeam,
  variants: Schema.Array(ArtworkVariant),
});

export interface PublishedArtwork extends Schema.Schema.Type<typeof PublishedArtwork> {}

// The owner's view adds the style and the private source it was rendered from.
// Imported artwork is the supplied images, unstyled: one variant per imported
// slot, with generic icons in slots that could not be copied. Its source is the
// first copied image, the starting point for an explicit restyle.
export const CharacterArtwork = Schema.Struct({
  ...PublishedArtwork.fields,
  sourceId: Schema.String,
  style: ArtworkStyle,
  imported: Schema.optionalKey(Schema.Literal(true)),
});

export interface CharacterArtwork extends Schema.Schema.Type<typeof CharacterArtwork> {}

// The Script Owner's view. The ID is assigned once and never changes on rename.
// Artwork is absent until uploaded; generic icons stand in meanwhile.
export const Character = Schema.Struct({
  id: CharacterId,
  ...CharacterDetails.fields,
  artwork: Schema.optionalKey(CharacterArtwork),
});

export interface Character extends Schema.Schema.Type<typeof Character> {}

// What anyone with the share link sees: the sheet content, never private sources.
export const PublicCharacter = Schema.Struct({
  id: CharacterId,
  name: Schema.String,
  ability: Schema.String,
  team: AuthoredTeam,
  firstNightInstructions: Schema.String,
  otherNightInstructions: Schema.String,
  artwork: Schema.optionalKey(PublishedArtwork),
});

export type InstructionsField = "firstNightInstructions" | "otherNightInstructions";

export interface PublicCharacter extends Schema.Schema.Type<typeof PublicCharacter> {}

// Also returned when the Character's Script belongs to someone else.
export class CharacterNotFound extends Schema.TaggedError<
  CharacterNotFound,
  { readonly brand: unique symbol }
>()("CharacterNotFound", { id: CharacterId }) {}

// Limits the official Script schema enforces at export time.
export const NAME_EXPORT_LIMIT = 30;
export const ABILITY_EXPORT_LIMIT = 250;
export const INSTRUCTIONS_EXPORT_LIMIT = 500;

const nameKey = (name: string) => name.trim().toLowerCase();

// Each returns the reason a field blocks export, if any. Drafts always save.
export const nameBlocker = (
  name: string,
  otherNames: ReadonlyArray<string>,
): string | undefined => {
  if (name.trim() === "") return "Enter a name.";

  if (textLength(name) > NAME_EXPORT_LIMIT) return `Use ${NAME_EXPORT_LIMIT} characters or fewer.`;

  const key = nameKey(name);

  if (otherNames.some((other) => nameKey(other) === key))
    return "Another Character has this name. Names must be unique.";

  return undefined;
};

export const abilityBlocker = (ability: string): string | undefined => {
  if (ability.trim() === "") return "Enter an ability.";

  if (textLength(ability) > ABILITY_EXPORT_LIMIT)
    return `Use ${ABILITY_EXPORT_LIMIT} characters or fewer.`;

  return undefined;
};

// Blank instructions are allowed: the entry still appears in the night order.
export const instructionsBlocker = (instructions: string): string | undefined =>
  textLength(instructions) > INSTRUCTIONS_EXPORT_LIMIT
    ? `Use ${INSTRUCTIONS_EXPORT_LIMIT} characters or fewer.`
    : undefined;

export const REMINDER_COUNT_LIMIT = 20;
export const REMINDER_LABEL_LIMIT = { reminders: 30, remindersGlobal: 25 } as const;
export const FLAVOR_EXPORT_LIMIT = 500;

export type ReminderField = keyof typeof REMINDER_LABEL_LIMIT;

export const reminderLabelBlocker = (label: string, field: ReminderField): string | undefined =>
  label.trim() === ""
    ? "Enter a token label."
    : textLength(label) > REMINDER_LABEL_LIMIT[field]
      ? `Use ${REMINDER_LABEL_LIMIT[field]} characters or fewer.`
      : undefined;

export const reminderCountBlocker = (tokens: ReadonlyArray<string>): string | undefined =>
  tokens.length > REMINDER_COUNT_LIMIT ? `Use ${REMINDER_COUNT_LIMIT} tokens or fewer.` : undefined;

export const flavorBlocker = (flavor: string): string | undefined =>
  textLength(flavor) > FLAVOR_EXPORT_LIMIT
    ? `Use ${FLAVOR_EXPORT_LIMIT} characters or fewer.`
    : undefined;

export interface ExportBlocker {
  readonly characterId: CharacterId;
  readonly field:
    | "name"
    | "ability"
    | InstructionsField
    | ReminderField
    | "flavor"
    | "jinx"
    | "artwork";
  readonly tokenIndex?: number;
  readonly otherCharacterId?: CharacterId;
  readonly message: string;
}

export const exportBlockers = (
  characters: ReadonlyArray<
    Pick<Character, "id" | "name" | "ability" | InstructionsField | ReminderField | "flavor"> &
      Partial<Pick<Character, "team" | "artwork">>
  >,
): ReadonlyArray<ExportBlocker> =>
  characters.flatMap(({ id, name, ability, ...details }) => {
    const blockers: Array<ExportBlocker> = [];
    const otherNames = characters.flatMap((other) => (other.id === id ? [] : [other.name]));
    const nameMessage = nameBlocker(name, otherNames);
    const abilityMessage = abilityBlocker(ability);

    if (nameMessage !== undefined)
      blockers.push({ characterId: id, field: "name", message: nameMessage });

    if (abilityMessage !== undefined)
      blockers.push({ characterId: id, field: "ability", message: abilityMessage });

    for (const field of ["firstNightInstructions", "otherNightInstructions"] as const) {
      const message = instructionsBlocker(details[field]);

      if (message !== undefined) blockers.push({ characterId: id, field, message });
    }

    for (const field of ["reminders", "remindersGlobal"] as const) {
      const tokens = details[field];
      const count = reminderCountBlocker(tokens);

      if (count) blockers.push({ characterId: id, field, message: count });
      tokens.forEach((label, tokenIndex) => {
        const message = reminderLabelBlocker(label, field);

        if (message) blockers.push({ characterId: id, field, tokenIndex, message });
      });
    }

    const flavorMessage = flavorBlocker(details.flavor);

    if (flavorMessage) blockers.push({ characterId: id, field: "flavor", message: flavorMessage });

    if (details.team !== undefined && isStale({ team: details.team, artwork: details.artwork }))
      blockers.push({
        characterId: id,
        field: "artwork",
        message: "Artwork is still styled for its previous Team. Restyle it or use generic icons.",
      });

    return blockers;
  });

export interface GenericIcon {
  readonly variant: IconVariant;
  readonly path: string;
}

// Published under an immutable, versioned path. A changed design ships as a new
// version so URLs in earlier exports keep their meaning.
const icon = (team: AuthoredTeam, variant: IconVariant, alignment: Alignment | undefined) => ({
  variant,
  path: `/icons/generic/v1/${team}-${alignment ?? "unaligned"}.svg`,
});

const opposite = (alignment: Alignment): Alignment => (alignment === "good" ? "evil" : "good");

// Regular then flipped, or unaligned/Good/Evil for Travellers: the order exports use.
export const genericIcons = (team: AuthoredTeam): ReadonlyArray<GenericIcon> => {
  const alignment = defaultAlignment(team);

  return alignment === undefined
    ? [icon(team, "unaligned", undefined), icon(team, "good", "good"), icon(team, "evil", "evil")]
    : [icon(team, "regular", alignment), icon(team, "flipped", opposite(alignment))];
};

interface Iconed {
  readonly team: AuthoredTeam;
  readonly artwork?: PublishedArtwork | undefined;
}

// Variants styled for an earlier Team wait for a restyle rather than show wrong alignments.
export const isStale = ({ team, artwork }: Iconed) =>
  artwork !== undefined && artwork.team !== team;

/** The generic icon standing in for an imported slot, cycling through the Team's variants. */
export const genericIconAt = (team: AuthoredTeam, index: number): GenericIcon => {
  const icons = genericIcons(team);

  return icons[index % icons.length] ?? icons[0] ?? icon(team, "regular", undefined);
};

/** Published artwork styled for the current Team, otherwise the generic icons, in export order. */
export const characterIcons = (character: Iconed): ReadonlyArray<GenericIcon> =>
  character.artwork !== undefined && !isStale(character)
    ? character.artwork.variants
    : genericIcons(character.team);
