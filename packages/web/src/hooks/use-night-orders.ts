import {
  NIGHTS,
  addBeforeDawn,
  removeEntry,
  setNightOrder,
  type CharacterId,
  type Night,
  type NightOrder,
  type NightOrders,
  type ScriptId,
} from "@alchemist/domain";
import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { useRef, useState, useSyncExternalStore } from "react";
import { ScriptKeys, replaceNightOrder } from "../api.ts";
import { createAutosave } from "../lib/autosave.ts";

const sameOrder = (a: NightOrder, b: NightOrder) =>
  a.length === b.length && a.every((entry, index) => entry === b[index]);

/**
 * The Workbench's working copy of both Night Orders. Changes apply locally at
 * once and autosave as whole-order replacements of each night that differs
 * from what the server last confirmed.
 */
export function useNightOrders(scriptId: ScriptId, initial: NightOrders, saveDelayMs: number) {
  const replace = useAtomSet(replaceNightOrder, { mode: "promiseExit" });
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const [orders, setOrders] = useState(initial);
  const latest = useRef(initial);
  const confirmed = useRef(initial);

  const [autosave] = useState(() =>
    createAutosave<NightOrders>(async (snapshot) => {
      for (const night of NIGHTS) {
        const order = snapshot[night];

        if (sameOrder(confirmed.current[night], order)) continue;

        const exit = await replaceRef.current({
          payload: { scriptId, night, order },
          reactivityKeys: [ScriptKeys.owned],
        });

        if (Exit.isFailure(exit)) {
          // A newer order (say, without a just-deleted Character) replaces this one.
          if (sameOrder(latest.current[night], order)) return false;

          continue;
        }

        confirmed.current = setNightOrder(confirmed.current, night, exit.value[night]);
      }

      return true;
    }, saveDelayMs),
  );

  const status = useSyncExternalStore(autosave.subscribe, autosave.status);

  const commit = (next: NightOrders) => {
    latest.current = next;
    setOrders(next);
    // Saves only nights that differ from the server, so a no-op costs nothing.
    autosave.schedule(next);
  };

  // Applies a change the server has already made to both copies.
  const applied = (change: (order: NightOrder, night: Night) => NightOrder) => {
    const apply = (current: NightOrders): NightOrders => ({
      firstNight: change(current.firstNight, "firstNight"),
      otherNight: change(current.otherNight, "otherNight"),
    });

    confirmed.current = apply(confirmed.current);
    commit(apply(latest.current));
  };

  return {
    orders,
    status,
    autosave,
    replace: (night: Night, order: NightOrder) =>
      commit(setNightOrder(latest.current, night, order)),
    /** Records that a new Character joined these nights when it was created. */
    created: (id: CharacterId, nights: ReadonlyArray<Night>) =>
      applied((order, night) => (nights.includes(night) ? addBeforeDawn(order, id) : order)),
    /** Records that deleting a Character removed it from both nights. */
    deleted: (id: CharacterId) => applied((order) => removeEntry(order, id)),
  };
}
