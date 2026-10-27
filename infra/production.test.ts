import { AlchemyContext } from "alchemy/AlchemyContext";
import { ConfigProvider, Effect } from "effect";
import { expect, test } from "vitest";
import { productionDomains } from "./production.ts";

const context = { dev: false, adopt: false, dotAlchemy: ".alchemy" };

const origins = {
  APP_ORIGIN: "https://alchemist.town",
  ASSET_ORIGIN: "https://assets.alchemist.town",
};

const configured = (values: Record<string, string>) =>
  productionDomains.pipe(
    Effect.provideService(AlchemyContext, context),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values))),
  );

test("production configuration resolves distinct app and asset hostnames", async () => {
  expect(await Effect.runPromise(configured(origins))).toEqual({
    app: "alchemist.town",
    assets: "assets.alchemist.town",
  });
});

test("local and runtime resource reconstruction require no production configuration", async () => {
  expect(await Effect.runPromise(productionDomains)).toBeUndefined();
  expect(
    await Effect.runPromise(
      productionDomains.pipe(Effect.provideService(AlchemyContext, { ...context, dev: true })),
    ),
  ).toBeUndefined();
});

test.each([
  "http://alchemist.town",
  "https://alchemist.town/",
  "https://alchemist.town/path",
  "https://alchemist.town:8443",
  "not-an-origin",
  origins.ASSET_ORIGIN,
])("production rejects an unsafe application origin: %s", async (APP_ORIGIN) => {
  const exit = await Effect.runPromiseExit(configured({ ...origins, APP_ORIGIN }));
  expect(exit._tag).toBe("Failure");
});

test("production fails rather than falling back to the application origin for assets", async () => {
  const exit = await Effect.runPromiseExit(configured({ APP_ORIGIN: origins.APP_ORIGIN }));
  expect(exit._tag).toBe("Failure");
});
