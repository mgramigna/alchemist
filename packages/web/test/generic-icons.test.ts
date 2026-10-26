import { AuthoredTeam, genericIcons } from "@alchemist/domain";
import { existsSync } from "node:fs";
import { expect, test } from "vitest";

const publicDir = new URL("../public/", import.meta.url);

test("every authored Team's generic icon variants are published as static assets", () => {
  const paths = AuthoredTeam.literals.flatMap((team) => genericIcons(team).map(({ path }) => path));

  expect(paths).toHaveLength(11);
  expect(paths.filter((path) => !existsSync(new URL(`.${path}`, publicDir)))).toEqual([]);
});
