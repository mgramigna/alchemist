import { CharacterId } from "@alchemist/domain";
import { expect, test } from "vitest";
import {
  assign,
  assignedTo,
  autoAssign,
  nameKey,
  publishable,
  setState,
  type BulkImage,
} from "./bulk-icons.ts";

const id = (value: string) => CharacterId.make(value);

const characters = [
  { id: id("imp"), name: "Imp" },
  { id: id("lamp"), name: "Lamp Lighter" },
  { id: id("lady"), name: "Señora" },
  { id: id("twin-a"), name: "Twin" },
  { id: id("twin-b"), name: "twin" },
  { id: id("blank"), name: "" },
];

const image = (name: string, overrides: Partial<BulkImage> = {}): BulkImage => ({
  key: name,
  name,
  bytes: new Uint8Array(),
  problem: undefined,
  characterId: null,
  state: { kind: "ready" },
  ...overrides,
});

test("names match ignoring case, accents, spacing and punctuation", () => {
  expect(nameKey("The_Imp")).toBe(nameKey("the imp"));
  expect(nameKey("lamp-lighter")).toBe(nameKey("Lamp Lighter"));
  expect(nameKey("senora")).toBe(nameKey("Señora"));
  expect(nameKey("  ")).toBe("");
});

test("new images are assigned to the one Character they are named after", () => {
  const added = autoAssign(
    [],
    [
      image("IMP.png"),
      image("lamp_lighter.webp"),
      image("senora.jpg"),
      image("twin.png"),
      image("unknown.png"),
      image(".png"),
      image("imp.gif", { problem: "Use a PNG, JPEG, WebP or GIF image." }),
    ],
    characters,
  );

  expect(added.map(({ characterId }) => characterId)).toEqual([
    "imp",
    "lamp",
    "lady",
    // Two Characters share the name, so neither is guessed.
    null,
    null,
    // An empty file name never matches an unnamed Character.
    null,
    // Images with a problem are never assigned.
    null,
  ]);
});

test("a Character already given an image, earlier in the batch or before, isn't matched again", () => {
  const existing = [image("first.png", { characterId: id("imp") })];
  const added = autoAssign(existing, [image("imp.png"), image("lamp lighter.png")], characters);
  expect(added.map(({ characterId }) => characterId)).toEqual([null, "lamp"]);

  const repeated = autoAssign([], [image("imp.png"), image("Imp.jpg")], characters);
  expect(repeated.map(({ characterId }) => characterId)).toEqual(["imp", null]);
});

test("reassigning resets a failure, but published and publishing images keep their Character", () => {
  const images = [
    image("a.png", { state: { kind: "failed", message: "No" } }),
    image("b.png", { characterId: id("imp"), state: { kind: "published" } }),
    image("c.png", { characterId: id("lamp"), state: { kind: "publishing" } }),
  ];

  const changed = ["a.png", "b.png", "c.png"].reduce<ReadonlyArray<BulkImage>>(
    (current, key) => assign(current, key, id("lady")),
    images,
  );

  expect(changed.map(({ characterId, state }) => [characterId, state.kind])).toEqual([
    ["lady", "ready"],
    ["imp", "published"],
    ["lamp", "publishing"],
  ]);
});

test("Publish sends valid, assigned, unpublished images whose Character still exists", () => {
  const images = [
    image("ready.png", { characterId: id("imp") }),
    image("retry.png", { characterId: id("lamp"), state: { kind: "failed", message: "No" } }),
    image("unassigned.png"),
    image("deleted.png", { characterId: id("gone") }),
    image("done.png", { characterId: id("lady"), state: { kind: "published" } }),
    image("bad.png", { characterId: id("twin-a"), problem: "Too big" }),
  ];

  expect(publishable(images, characters).map(({ key }) => key)).toEqual(["ready.png", "retry.png"]);
  expect(assignedTo(image("deleted.png", { characterId: id("gone") }), characters)).toBeNull();
  expect(setState(images, "ready.png", { kind: "published" })[0]?.state).toEqual({
    kind: "published",
  });
});
