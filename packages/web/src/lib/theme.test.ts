import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createThemeStore, themeStorageKey, type Theme } from "./theme.ts";

const environment = (system: Theme, saved?: string) => {
  const items = new Map<string, string>(saved === undefined ? [] : [[themeStorageKey, saved]]);
  const changes: Array<() => void> = [];
  const classes = new Set<string>();

  const media = {
    matches: system === "dark",
    addEventListener: (_: "change", listener: () => void) => void changes.push(listener),
  };

  return {
    items,
    classes,
    // Simulates the visitor changing their system preference.
    prefer: (theme: Theme) => {
      media.matches = theme === "dark";

      for (const listener of changes) listener();
    },
    env: {
      storage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      },
      media,
      root: {
        classList: {
          toggle: (token: string, force?: boolean) => {
            if (force) classes.add(token);
            else classes.delete(token);

            return classes.has(token);
          },
        },
      },
    },
  };
};

test("follows the system preference, including later changes, when nothing is saved", () => {
  const { env, classes, prefer } = environment("dark");
  const store = createThemeStore(env);
  expect(store.current()).toBe("dark");
  expect(classes.has("dark")).toBe(true);
  prefer("light");
  expect(store.current()).toBe("light");
  expect(classes.has("dark")).toBe(false);
});

test("an override that differs from the system is saved and outlasts system changes", () => {
  const { env, items, classes, prefer } = environment("light");
  const store = createThemeStore(env);
  store.set("dark");
  expect(items.get(themeStorageKey)).toBe("dark");
  expect(classes.has("dark")).toBe(true);
  prefer("dark");
  prefer("light");
  expect(store.current()).toBe("dark");
  expect(createThemeStore(env).current()).toBe("dark");
});

test("choosing the system's own scheme clears the override so the system is followed again", () => {
  const { env, items, prefer } = environment("light", "dark");
  const store = createThemeStore(env);
  expect(store.current()).toBe("dark");
  store.set("light");
  expect(items.has(themeStorageKey)).toBe(false);
  prefer("dark");
  expect(store.current()).toBe("dark");
});

test("notifies subscribers on every change until they unsubscribe", () => {
  const { env, prefer } = environment("light");
  const store = createThemeStore(env);
  const seen: Theme[] = [];
  const unsubscribe = store.subscribe(() => seen.push(store.current()));
  store.set("dark");
  prefer("dark");
  unsubscribe();
  store.set("light");
  expect(seen).toEqual(["dark", "dark"]);
});

test("ignores unknown saved values and unavailable storage", () => {
  expect(createThemeStore(environment("dark", "sepia").env).current()).toBe("dark");

  const { env, classes } = environment("dark");

  const fail = () => {
    throw new Error("Storage is disabled");
  };

  const store = createThemeStore({
    ...env,
    storage: { getItem: fail, setItem: fail, removeItem: fail },
  });

  expect(store.current()).toBe("dark");
  store.set("light");
  expect(classes.has("dark")).toBe(true);
});

// index.html repeats the rule inline so the first paint is already in the right scheme.
const firstPaintScript = (() => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

  if (script === undefined) throw new Error("index.html has no inline theme script");

  return script;
})();

test.each([
  { system: "light", saved: undefined },
  { system: "dark", saved: undefined },
  { system: "light", saved: "dark" },
  { system: "dark", saved: "light" },
  { system: "dark", saved: "sepia" },
] as const)("index.html paints what the store resolves: %o", ({ system, saved }) => {
  const { env, classes } = environment(system, saved);
  const expected = createThemeStore(env).current();
  classes.clear();

  // oxlint-disable-next-line typescript/no-implied-eval
  new Function("localStorage", "matchMedia", "document", firstPaintScript)(
    env.storage,
    () => env.media,
    { documentElement: env.root },
  );

  expect(classes.has("dark")).toBe(expected === "dark");
});
