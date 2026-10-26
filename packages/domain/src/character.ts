import { Match, Schema } from "effect";

export const CharacterId = Schema.String.check(
  Schema.isPattern(/^[0-7][0-9a-hjkmnp-tv-z]{25}$/),
).pipe(Schema.brand("CharacterId"));

export type CharacterId = typeof CharacterId.Type;

// Every Team the model recognises. Fabled and Loric stay representable so later
// slices (such as import) can recognise them, but they cannot be authored yet.
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

export const CharacterDetails = Schema.Struct({
  name: CharacterName,
  ability: CharacterAbility,
  team: AuthoredTeam,
});

export interface CharacterDetails extends Schema.Schema.Type<typeof CharacterDetails> {}

// The Script Owner's view. The ID is assigned once and never changes on rename.
export const Character = Schema.Struct({
  id: CharacterId,
  ...CharacterDetails.fields,
});

export interface Character extends Schema.Schema.Type<typeof Character> {}

export const PublicCharacter = Schema.Struct({
  id: CharacterId,
  name: Schema.String,
  ability: Schema.String,
  team: AuthoredTeam,
});

export interface PublicCharacter extends Schema.Schema.Type<typeof PublicCharacter> {}

// Also returned when the Character's Script belongs to someone else.
export class CharacterNotFound extends Schema.TaggedError<
  CharacterNotFound,
  { readonly brand: unique symbol }
>()("CharacterNotFound", { id: CharacterId }) {}

// Limits the official Script schema enforces at export time.
export const NAME_EXPORT_LIMIT = 30;
export const ABILITY_EXPORT_LIMIT = 250;

const nameKey = (name: string) => name.trim().toLowerCase();

// Each returns the reason a field blocks export, if any. Drafts always save.
export const nameBlocker = (
  name: string,
  otherNames: ReadonlyArray<string>,
): string | undefined => {
  if (name.trim() === "") return "Enter a name.";

  if (name.length > NAME_EXPORT_LIMIT) return `Use ${NAME_EXPORT_LIMIT} characters or fewer.`;

  const key = nameKey(name);

  if (otherNames.some((other) => nameKey(other) === key))
    return "Another Character has this name. Names must be unique.";

  return undefined;
};

export const abilityBlocker = (ability: string): string | undefined => {
  if (ability.trim() === "") return "Enter an ability.";

  if (ability.length > ABILITY_EXPORT_LIMIT)
    return `Use ${ABILITY_EXPORT_LIMIT} characters or fewer.`;

  return undefined;
};

export interface ExportBlocker {
  readonly characterId: CharacterId;
  readonly field: "name" | "ability";
  readonly message: string;
}

export const exportBlockers = (
  characters: ReadonlyArray<Pick<Character, "id" | "name" | "ability">>,
): ReadonlyArray<ExportBlocker> =>
  characters.flatMap(({ id, name, ability }) => {
    const blockers: Array<ExportBlocker> = [];
    const otherNames = characters.flatMap((other) => (other.id === id ? [] : [other.name]));
    const nameMessage = nameBlocker(name, otherNames);
    const abilityMessage = abilityBlocker(ability);

    if (nameMessage !== undefined)
      blockers.push({ characterId: id, field: "name", message: nameMessage });

    if (abilityMessage !== undefined)
      blockers.push({ characterId: id, field: "ability", message: abilityMessage });

    return blockers;
  });

export type IconVariant = "regular" | "flipped" | "unaligned" | "good" | "evil";

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
