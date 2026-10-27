import { AlchemyContext } from "alchemy/AlchemyContext";
import { Config, Effect, Option } from "effect";

// Resource props are also reconstructed at runtime, without deployment context.
export const productionDomains = Effect.gen(function* () {
  const context = yield* Effect.serviceOption(AlchemyContext);

  if (Option.isNone(context) || context.value.dev) return undefined;

  const appOrigin = yield* Config.String("APP_ORIGIN");
  const assetOrigin = yield* Config.String("ASSET_ORIGIN");
  const app = yield* httpsOrigin(appOrigin);
  const assets = yield* httpsOrigin(assetOrigin);

  if (app === assets) return yield* Effect.die("App and asset domains must be distinct.");

  return { app, assets };
});

const httpsOrigin = (value: string) =>
  Effect.try(() => new URL(value)).pipe(
    Effect.orDie,
    Effect.flatMap((url) =>
      url.protocol === "https:" && url.port === "" && url.origin === value
        ? Effect.succeed(url.hostname)
        : Effect.die("Production origins must be HTTPS origins without paths or trailing slashes."),
    ),
  );
