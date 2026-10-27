import { CurrentUser } from "@alchemist/domain/rpc";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, ManagedRuntime } from "effect";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { AppConfig, handleRequest } from "../../src/app.ts";
import { Auth } from "../../src/auth.ts";
import { r2ArtworkStorage } from "../../src/artwork-storage.ts";
import { imageFetcherFixture } from "./images.ts";
import { D1ScriptStore } from "../../src/d1.ts";
import { Scripts, ScriptsLive } from "../../src/scripts.ts";

export const sharingApplication = async (origin: string) => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-07-01",
    d1Databases: ["DB"],
    r2Buckets: ["SOURCES", "PUBLISHED"],
  });

  const db = await mf.getD1Database("DB");
  const migrations = new URL("../../migrations/", import.meta.url);

  for (const filename of (await readdir(migrations)).sort()) {
    const sql = await readFile(new URL(filename, migrations), "utf8");

    for (const statement of sql.split(";")) if (statement.trim()) await db.prepare(statement).run();
  }

  await db.prepare("INSERT INTO users (id, display_name) VALUES ('owner', 'Owner')").run();
  const owner = { id: "owner", displayName: "Owner" };

  const storage = r2ArtworkStorage(
    await mf.getR2Bucket("SOURCES"),
    await mf.getR2Bucket("PUBLISHED"),
  );

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      ScriptsLive.pipe(
        Layer.provide(D1ScriptStore.pipe(Layer.provide(D1Client.layer({ db })))),
        Layer.provideMerge(storage),
        Layer.provide(imageFetcherFixture().layer),
      ),
      Layer.mock(Auth, {
        current: (token) => Effect.succeed(token === "owner-session" ? owner : null),
      }),
      Layer.succeed(AppConfig, { origin }),
    ),
  );

  const created = await runtime.runPromise(
    Effect.gen(function* () {
      const scripts = yield* Scripts;
      const script = yield* scripts.create();

      for (let i = 0; i < 4; i++) {
        const c = yield* scripts.createCharacter(script.id, "townsfolk", []);
        yield* scripts.updateCharacter(script.id, c.id, {
          ...c,
          name: `Character ${i}`,
          ability: "You learn a number.",
        });
      }

      return script;
    }).pipe(Effect.provideService(CurrentUser, owner)),
  );

  return {
    id: created.id,
    request: (request: Request) => runtime.runPromise(handleRequest(request)),
    invalidate: async () => {
      await db
        .prepare("UPDATE characters SET ability = '' WHERE script_id = ?")
        .bind(created.id)
        .run();
    },
    overflow: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const scripts = yield* Scripts;

          for (let i = 4; i < 65; i++) {
            const c = yield* scripts.createCharacter(created.id, "townsfolk", []);
            yield* scripts.updateCharacter(created.id, c.id, {
              ...c,
              name: `Character ${i}`,
              ability: "Long text ".repeat(24),
            });
          }
        }).pipe(Effect.provideService(CurrentUser, owner)),
      ),
    deleteScript: async () => {
      await db.batch([
        db.prepare("DELETE FROM night_order_entries WHERE script_id = ?").bind(created.id),
        db.prepare("DELETE FROM jinxes WHERE script_id = ?").bind(created.id),
        db.prepare("DELETE FROM characters WHERE script_id = ?").bind(created.id),
        db.prepare("DELETE FROM script_imports WHERE script_id = ?").bind(created.id),
        db.prepare("DELETE FROM scripts WHERE id = ?").bind(created.id),
      ]);
    },
    dispose: async () => {
      await runtime.dispose();
      await mf.dispose();
    },
  };
};
