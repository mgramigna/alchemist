import { expect, test } from "vitest";
import {
  CharacterId,
  addBeforeDawn,
  defaultNightOrders,
  moveEntry,
  nightOrderProblem,
  nightPosition,
  removeEntry,
} from "../src/index.ts";

const id = (n: number) => CharacterId.make(`01k8ae1000000000000000000${n}`);

test("a Character joins immediately before Dawn, once, and can sit after Dawn", () => {
  const joined = addBeforeDawn(defaultNightOrders.firstNight, id(1));
  expect(joined).toEqual(["dusk", "minioninfo", "demoninfo", id(1), "dawn"]);
  expect(addBeforeDawn(joined, id(1))).toBe(joined);

  const afterDawn = moveEntry(joined, 3, 4);
  expect(afterDawn).toEqual(["dusk", "minioninfo", "demoninfo", "dawn", id(1)]);
  expect(addBeforeDawn(afterDawn, id(2))).toEqual([
    "dusk",
    "minioninfo",
    "demoninfo",
    id(2),
    "dawn",
    id(1),
  ]);
});

test("moving and removing entries, including standard steps", () => {
  const order = ["dusk", id(1), id(2), "dawn"] as const;
  expect(moveEntry(order, 0, 2)).toEqual([id(1), id(2), "dusk", "dawn"]);
  expect(moveEntry(order, 2, 1)).toEqual(["dusk", id(2), id(1), "dawn"]);
  // Out-of-range moves leave the order unchanged.
  expect(moveEntry(order, 0, -1)).toBe(order);
  expect(moveEntry(order, 3, 4)).toBe(order);
  expect(removeEntry(order, id(1))).toEqual(["dusk", id(2), "dawn"]);
});

test("position and neighbors count standard steps", () => {
  const order = ["dusk", id(1), "dawn"] as const;
  expect(nightPosition(order, id(1))).toEqual({
    position: 2,
    total: 3,
    after: "dusk",
    before: "dawn",
  });
  expect(nightPosition(order, "dusk")).toEqual({
    position: 1,
    total: 3,
    after: undefined,
    before: id(1),
  });
  expect(nightPosition(order, id(2))).toBeUndefined();
});

test("an order needs each standard step of its night once and only this Script's Characters once", () => {
  const members = [id(1), id(2)];
  expect(nightOrderProblem("firstNight", defaultNightOrders.firstNight, members)).toBeUndefined();
  expect(nightOrderProblem("otherNight", ["dawn", id(2), "dusk", id(1)], members)).toBeUndefined();

  expect(nightOrderProblem("otherNight", ["dusk"], members)).toBe("“dawn” is missing.");
  expect(nightOrderProblem("otherNight", ["dusk", "dawn", "dusk"], members)).toBe(
    "“dusk” appears more than once.",
  );
  expect(nightOrderProblem("otherNight", ["dusk", "minioninfo", "dawn"], members)).toBe(
    "“minioninfo” is not part of this night.",
  );
  expect(nightOrderProblem("otherNight", ["dusk", id(1), id(1), "dawn"], members)).toBe(
    `“${id(1)}” appears more than once.`,
  );
  expect(nightOrderProblem("otherNight", ["dusk", id(3), "dawn"], members)).toBe(
    `“${id(3)}” is not part of this night.`,
  );
});
