import type {
  AuthoredTeam,
  Character,
  CharacterDetails,
  CharacterId,
  Night,
  ScriptId,
} from "@alchemist/domain";
import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { ScriptKeys, createCharacter, deleteCharacter, updateCharacter } from "../api.ts";
import { createAutosave } from "../lib/autosave.ts";
import { replaceCharacter, sameDetails } from "../lib/characters.ts";

/**
 * The Workbench's working copy of a Script's Characters. Edits apply locally at
 * once and autosave in the background; each save sends only Characters that
 * differ from what the server last confirmed, so edits to several Characters
 * never overwrite each other. Adding and deleting wait for the server.
 */
export function useCharacters(
  scriptId: ScriptId,
  initial: ReadonlyArray<Character>,
  saveDelayMs: number,
) {
  const update = useAtomSet(updateCharacter, { mode: "promiseExit" });
  const updateRef = useRef(update);
  updateRef.current = update;
  const create = useAtomSet(createCharacter, { mode: "promiseExit" });
  const remove = useAtomSet(deleteCharacter, { mode: "promiseExit" });

  const [characters, setCharacters] = useState(initial);
  const latest = useRef(initial);
  const confirmed = useRef(new Map(initial.map((character) => [character.id, character])));

  const [autosave] = useState(() =>
    createAutosave<ReadonlyArray<Character>>(async (snapshot) => {
      for (const character of snapshot) {
        const saved = confirmed.current.get(character.id);

        if (saved === undefined || sameDetails(saved, character)) continue;

        const exit = await updateRef.current({
          payload: {
            scriptId,
            id: character.id,
            name: character.name,
            ability: character.ability,
            team: character.team,
            firstNightInstructions: character.firstNightInstructions,
            otherNightInstructions: character.otherNightInstructions,
            reminders: character.reminders,
            remindersGlobal: character.remindersGlobal,
            setup: character.setup,
            flavor: character.flavor,
          },
          reactivityKeys: [ScriptKeys.owned],
        });

        if (Exit.isFailure(exit)) {
          // A Character deleted while its edit was in flight has nothing left to save.
          if (latest.current.some(({ id }) => id === character.id)) return false;

          continue;
        }

        confirmed.current.set(character.id, character);
      }

      return true;
    }, saveDelayMs),
  );

  const status = useSyncExternalStore(autosave.subscribe, autosave.status);

  const commit = (next: ReadonlyArray<Character>) => {
    latest.current = next;
    setCharacters(next);
  };

  return {
    characters,
    status,
    autosave,
    edit: (id: CharacterId, details: CharacterDetails) => {
      commit(replaceCharacter(latest.current, id, details));
      autosave.schedule(latest.current);
    },
    /**
     * Resolves to the new Character, or undefined if the server refused. The
     * server also adds it to each chosen night, immediately before Dawn.
     */
    add: async (team: AuthoredTeam, nights: ReadonlyArray<Night>) => {
      const exit = await create({
        payload: { scriptId, team, nights },
        reactivityKeys: [ScriptKeys.owned],
      });

      if (Exit.isFailure(exit)) return undefined;
      confirmed.current.set(exit.value.id, exit.value);
      commit([...latest.current, exit.value]);

      return exit.value;
    },
    /** Resolves to whether the Character is gone. */
    remove: async (id: CharacterId) => {
      const exit = await remove({
        payload: { scriptId, id },
        reactivityKeys: [ScriptKeys.owned],
      });

      if (Exit.isFailure(exit)) return false;
      confirmed.current.delete(id);
      commit(latest.current.filter((character) => character.id !== id));

      return true;
    },
  };
}
