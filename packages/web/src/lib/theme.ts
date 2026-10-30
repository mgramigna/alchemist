/*
 * Two-state color scheme: the system preference is the default, and a saved
 * override only exists while it differs from the system. Choosing the scheme
 * the system already prefers clears the override, so later system changes are
 * followed again. index.html applies the same rule before first paint.
 */
export type Theme = "light" | "dark";

export const themeStorageKey = "alchemist-theme";

export const darkSchemeQuery = "(prefers-color-scheme: dark)";

export interface ThemeEnvironment {
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly media: {
    readonly matches: boolean;
    readonly addEventListener: (type: "change", listener: () => void) => void;
  };
  readonly root: { readonly classList: Pick<DOMTokenList, "toggle"> };
}

export interface ThemeStore {
  readonly current: () => Theme;
  readonly set: (theme: Theme) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const isTheme = (value: string | null): value is Theme => value === "light" || value === "dark";

// Storage can throw when disabled (private modes, blocked cookies); fall back to the system.
const attempt = <A>(f: () => A, fallback: A): A => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

export const createThemeStore = ({ storage, media, root }: ThemeEnvironment): ThemeStore => {
  const listeners = new Set<() => void>();
  const system = (): Theme => (media.matches ? "dark" : "light");

  const current = (): Theme => {
    const saved = attempt(() => storage.getItem(themeStorageKey), null);

    return isTheme(saved) ? saved : system();
  };

  const apply = () => {
    root.classList.toggle("dark", current() === "dark");

    for (const listener of listeners) listener();
  };

  media.addEventListener("change", apply);
  apply();

  return {
    current,
    set: (theme) => {
      attempt(() => {
        if (theme === system()) storage.removeItem(themeStorageKey);
        else storage.setItem(themeStorageKey, theme);
      }, undefined);
      apply();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
};
