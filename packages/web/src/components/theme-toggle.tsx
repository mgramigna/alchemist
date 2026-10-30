import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { themeStore, useTheme } from "../hooks/use-theme.ts";
import { Button } from "./ui/button.tsx";

/** Offers only the opposite scheme; choosing the system's own scheme follows the system again. */
export function ThemeToggle() {
  const next = useTheme() === "dark" ? "light" : "dark";
  const Icon = next === "dark" ? MoonIcon : SunIcon;

  return (
    <Button variant="ghost" size="icon-lg" onClick={() => themeStore.set(next)}>
      <Icon aria-hidden="true" weight="fill" />
      <span className="sr-only">Use {next} theme</span>
    </Button>
  );
}
