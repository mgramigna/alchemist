import { Schema } from "effect";
import { CharacterId } from "./character.ts";

export const Night = Schema.Literals(["firstNight", "otherNight"]);

export type Night = typeof Night.Type;

// IDs match the official schema's `_meta` night order entries.
export const NightStep = Schema.Literals(["dusk", "minioninfo", "demoninfo", "dawn"]);

export type NightStep = typeof NightStep.Type;

// Either a standard step or a member Character of the same Script.
export const NightEntry = Schema.Union([NightStep, CharacterId]);

export type NightEntry = typeof NightEntry.Type;

// A complete order, not a partial override. The bound only limits payload size.
export const NightOrder = Schema.Array(NightEntry).check(Schema.isMaxLength(500));

export type NightOrder = typeof NightOrder.Type;

export const NightOrders = Schema.Struct({
  firstNight: NightOrder,
  otherNight: NightOrder,
});

export interface NightOrders extends Schema.Schema.Type<typeof NightOrders> {}

export const NIGHTS: ReadonlyArray<Night> = Night.literals;

// The standard steps each night always contains exactly once, in their default order.
export const NIGHT_STEPS: Record<Night, ReadonlyArray<NightStep>> = {
  firstNight: ["dusk", "minioninfo", "demoninfo", "dawn"],
  otherNight: ["dusk", "dawn"],
};

export const defaultNightOrders: NightOrders = {
  firstNight: NIGHT_STEPS.firstNight,
  otherNight: NIGHT_STEPS.otherNight,
};

export const setNightOrder = (
  orders: NightOrders,
  night: Night,
  order: NightOrder,
): NightOrders => ({
  firstNight: night === "firstNight" ? order : orders.firstNight,
  otherNight: night === "otherNight" ? order : orders.otherNight,
});

export const isNightStep = (entry: NightEntry): entry is NightStep => Schema.is(NightStep)(entry);

export class NightOrderInvalid extends Schema.TaggedError<
  NightOrderInvalid,
  { readonly brand: unique symbol }
>()("NightOrderInvalid", { night: Night, message: Schema.String }) {}

/** Why an order cannot be saved for a Script with these Characters, if anything. */
export const nightOrderProblem = (
  night: Night,
  order: ReadonlyArray<NightEntry>,
  characterIds: ReadonlyArray<CharacterId>,
): string | undefined => {
  const seen = new Set<NightEntry>();
  const steps = NIGHT_STEPS[night];

  for (const entry of order) {
    if (seen.has(entry)) return `“${entry}” appears more than once.`;
    seen.add(entry);

    if (isNightStep(entry) ? !steps.includes(entry) : !characterIds.includes(entry))
      return `“${entry}” is not part of this night.`;
  }

  const missing = steps.find((step) => !seen.has(step));

  return missing === undefined ? undefined : `“${missing}” is missing.`;
};

/** Adds a Character immediately before Dawn. An existing member stays where it is. */
export const addBeforeDawn = (
  order: ReadonlyArray<NightEntry>,
  id: CharacterId,
): ReadonlyArray<NightEntry> => {
  if (order.includes(id)) return order;

  const dawn = order.indexOf("dawn");
  const at = dawn === -1 ? order.length : dawn;

  return [...order.slice(0, at), id, ...order.slice(at)];
};

export const removeEntry = (
  order: ReadonlyArray<NightEntry>,
  entry: NightEntry,
): ReadonlyArray<NightEntry> => order.filter((candidate) => candidate !== entry);

/** Moves the entry at `from` so it ends up at index `to`. */
export const moveEntry = <A extends NightEntry>(
  order: ReadonlyArray<A>,
  from: number,
  to: number,
): ReadonlyArray<A> => {
  const entry = order[from];

  if (entry === undefined || to < 0 || to >= order.length || from === to) return order;

  const rest = order.filter((_, index) => index !== from);

  return [...rest.slice(0, to), entry, ...rest.slice(to)];
};

export interface NightPosition {
  /** 1-based, counting standard steps. */
  readonly position: number;
  readonly total: number;
  readonly after: NightEntry | undefined;
  readonly before: NightEntry | undefined;
}

export const nightPosition = (
  order: ReadonlyArray<NightEntry>,
  entry: NightEntry,
): NightPosition | undefined => {
  const index = order.indexOf(entry);

  if (index === -1) return undefined;

  return {
    position: index + 1,
    total: order.length,
    after: order[index - 1],
    before: order[index + 1],
  };
};
