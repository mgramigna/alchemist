import { useSyncExternalStore } from "react";
import { createThemeStore, darkSchemeQuery } from "../lib/theme.ts";

export const themeStore = createThemeStore({
  storage: window.localStorage,
  media: window.matchMedia(darkSchemeQuery),
  root: document.documentElement,
});

export const useTheme = () => useSyncExternalStore(themeStore.subscribe, themeStore.current);
