import { useAtomSet } from "@effect/atom-react";
import {
  jinxKey,
  type Jinx,
  type JinxPair,
  type CharacterId,
  type ScriptId,
} from "@alchemist/domain";
import { Cause, Exit, Result, Predicate } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { ScriptKeys, createJinx, updateJinx, deleteJinx } from "../api.ts";
import { createAutosave } from "../lib/autosave.ts";

export function useJinxes(scriptId: ScriptId, initial: ReadonlyArray<Jinx>, delayMs: number) {
  const update = useAtomSet(updateJinx, { mode: "promiseExit" });
  const updateRef = useRef(update);
  updateRef.current = update;
  const create = useAtomSet(createJinx, { mode: "promiseExit" });
  const remove = useAtomSet(deleteJinx, { mode: "promiseExit" });
  const [jinxes, setJinxes] = useState(initial);
  const latest = useRef(initial);
  const confirmed = useRef(new Map(initial.map((jinx) => [jinxKey(jinx), jinx.explanation])));

  const [autosave] = useState(() =>
    createAutosave<ReadonlyArray<Jinx>>(async (snapshot) => {
      for (const jinx of snapshot) {
        const key = jinxKey(jinx);

        if (
          !latest.current.some((candidate) => jinxKey(candidate) === key) ||
          confirmed.current.get(key) === jinx.explanation
        )
          continue;

        const exit = await updateRef.current({
          payload: {
            scriptId,
            first: jinx.first,
            second: jinx.second,
            explanation: jinx.explanation,
          },
          reactivityKeys: [ScriptKeys.owned],
        });

        if (Exit.isFailure(exit)) {
          if (latest.current.some((candidate) => jinxKey(candidate) === key)) return false;
          continue;
        }

        // A deletion can finish while an update is in flight.
        if (latest.current.some((candidate) => jinxKey(candidate) === key))
          confirmed.current.set(key, exit.value.explanation);
      }

      return true;
    }, delayMs),
  );

  const status = useSyncExternalStore(autosave.subscribe, autosave.status);

  const commit = (next: ReadonlyArray<Jinx>) => {
    latest.current = next;
    setJinxes(next);
  };

  return {
    jinxes,
    status,
    autosave,
    edit: (pair: JinxPair, explanation: string) => {
      commit(
        latest.current.map((jinx) =>
          jinxKey(jinx) === jinxKey(pair)
            ? { first: jinx.first, second: jinx.second, explanation }
            : jinx,
        ),
      );
      autosave.schedule(latest.current);
    },
    add: async (pair: JinxPair): Promise<string | undefined> => {
      const exit = await create({
        payload: { scriptId, first: pair.first, second: pair.second },
        reactivityKeys: [ScriptKeys.owned],
      });

      if (Exit.isFailure(exit)) {
        const error = Cause.findError(exit.cause);

        if (Result.isSuccess(error) && Predicate.isTagged(error.success, "JinxConflict"))
          return "These Characters already have a Jinx. Reopen this Script to load it.";

        return "Couldn’t add the Jinx. Reopen this Script to check for an existing Jinx, then try again.";
      }

      confirmed.current.set(jinxKey(exit.value), exit.value.explanation);
      commit([...latest.current, exit.value]);

      return undefined;
    },
    remove: async (pair: JinxPair) => {
      const exit = await remove({
        payload: { scriptId, first: pair.first, second: pair.second },
        reactivityKeys: [ScriptKeys.owned],
      });

      if (Exit.isFailure(exit)) return false;
      confirmed.current.delete(jinxKey(pair));
      commit(latest.current.filter((jinx) => jinxKey(jinx) !== jinxKey(pair)));

      return true;
    },
    deletedCharacter: (id: CharacterId) => {
      commit(latest.current.filter((jinx) => jinx.first !== id && jinx.second !== id));
      autosave.schedule(latest.current);
    },
  };
}
