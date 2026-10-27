import {
  isNightStep,
  nightPosition,
  type Character,
  type CharacterId,
  type InstructionsField,
  type Night,
  type NightEntry,
  type NightOrder,
  type NightStep,
} from "@alchemist/domain";
import { characterTitle } from "./characters.ts";

export const NIGHT_LABELS: Record<Night, string> = {
  firstNight: "First Night",
  otherNight: "Other Nights",
};

export const STEP_LABELS: Record<NightStep, string> = {
  dusk: "Dusk",
  minioninfo: "Minion Info",
  demoninfo: "Demon Info",
  dawn: "Dawn",
};

// What the Storyteller does at each standard step.
export const STEP_DESCRIPTIONS: Record<NightStep, string> = {
  dusk: "Check that all eyes are closed.",
  minioninfo: "Minions learn who the Demon is and who the other Minions are.",
  demoninfo: "The Demon learns who the Minions are and three good Characters not in play.",
  dawn: "Wait a few seconds, then call for eyes open.",
};

export const INSTRUCTIONS_FIELD: Record<Night, InstructionsField> = {
  firstNight: "firstNightInstructions",
  otherNight: "otherNightInstructions",
};

export const entryTitle = (entry: NightEntry, characters: ReadonlyArray<Character>) => {
  if (isNightStep(entry)) return STEP_LABELS[entry];

  const character = characters.find(({ id }) => id === entry);

  return character ? characterTitle(character) : "Unknown Character";
};

/** "#7 of 9 · after Cartographer, before Dawn" for a member of a night. */
export const positionSummary = (
  order: NightOrder,
  id: CharacterId,
  characters: ReadonlyArray<Character>,
) => {
  const position = nightPosition(order, id);

  if (position === undefined) return undefined;

  const neighbors = [
    position.after === undefined ? "first" : `after ${entryTitle(position.after, characters)}`,
    position.before === undefined ? "last" : `before ${entryTitle(position.before, characters)}`,
  ];

  return `#${position.position} of ${position.total} · ${neighbors.join(", ")}`;
};
