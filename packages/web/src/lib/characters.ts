import {
  AuthoredTeam,
  type Character,
  type CharacterArtwork,
  type CharacterDetails,
  type CharacterId,
  type IconVariant,
  type PublicCharacter,
} from "@alchemist/domain";

const TEAM_LABELS: Record<AuthoredTeam, { readonly one: string; readonly many: string }> = {
  townsfolk: { one: "Townsfolk", many: "Townsfolk" },
  outsider: { one: "Outsider", many: "Outsiders" },
  minion: { one: "Minion", many: "Minions" },
  demon: { one: "Demon", many: "Demons" },
  traveller: { one: "Traveller", many: "Travellers" },
};

export const teamLabel = (team: AuthoredTeam) => TEAM_LABELS[team].one;

export const teamPluralLabel = (team: AuthoredTeam) => TEAM_LABELS[team].many;

export const ICON_VARIANT_LABELS: Record<IconVariant, string> = {
  regular: "Regular",
  flipped: "Flipped",
  unaligned: "Unaligned",
  good: "Good",
  evil: "Evil",
};

export const characterTitle = ({ name, team }: Pick<Character, "name" | "team">) =>
  name.trim() || `Unnamed ${teamLabel(team)}`;

/** Characters of each authored Team, in creation order. */
export const groupByTeam = <C extends Pick<PublicCharacter, "team">>(
  characters: ReadonlyArray<C>,
) =>
  AuthoredTeam.literals.map((team) => ({
    team,
    characters: characters.filter((character) => character.team === team),
  }));

export const sameDetails = (a: CharacterDetails, b: CharacterDetails) =>
  a.name === b.name &&
  a.ability === b.ability &&
  a.team === b.team &&
  a.setup === b.setup &&
  a.flavor === b.flavor &&
  a.artworkCredit === b.artworkCredit &&
  a.reminders.length === b.reminders.length &&
  a.reminders.every((label, i) => label === b.reminders[i]) &&
  a.remindersGlobal.length === b.remindersGlobal.length &&
  a.remindersGlobal.every((label, i) => label === b.remindersGlobal[i]) &&
  a.firstNightInstructions === b.firstNightInstructions &&
  a.otherNightInstructions === b.otherNightInstructions;

export const withArtwork = (
  characters: ReadonlyArray<Character>,
  id: CharacterId,
  artwork: CharacterArtwork | undefined,
): ReadonlyArray<Character> =>
  characters.map((character) => {
    if (character.id !== id) return character;
    const { artwork: _previous, ...rest } = character;

    return artwork === undefined ? rest : { ...rest, artwork };
  });

export const replaceCharacter = (
  characters: ReadonlyArray<Character>,
  id: CharacterId,
  details: CharacterDetails,
): ReadonlyArray<Character> =>
  characters.map((character) =>
    character.id === id
      ? {
          // Keeps artwork, which changes only through its own mutations.
          ...character,
          name: details.name,
          ability: details.ability,
          team: details.team,
          firstNightInstructions: details.firstNightInstructions,
          otherNightInstructions: details.otherNightInstructions,
          reminders: details.reminders,
          remindersGlobal: details.remindersGlobal,
          setup: details.setup,
          flavor: details.flavor,
          artworkCredit: details.artworkCredit,
        }
      : character,
  );
