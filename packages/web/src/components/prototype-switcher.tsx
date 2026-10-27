// PROTOTYPE (#69): throwaway variant switcher for UI prototypes. Do not merge to main.
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/** Reads the current variant from `?<param>=`, defaulting to the first key. */
export function usePrototypeVariant<K extends string>(param: string, keys: ReadonlyArray<K>): K {
  const value = new URLSearchParams(useLocation().searchStr).get(param);

  return keys.find((key) => key === value) ?? keys[0]!;
}

/**
 * A floating pill that cycles `?<param>=` through the variants. Arrow keys
 * cycle too, unless a control is focused or something else handled the key.
 */
export function PrototypeSwitcher<K extends string>({
  param,
  variants,
  current,
}: {
  readonly param: string;
  readonly variants: ReadonlyArray<readonly [K, string]>;
  readonly current: K;
}) {
  const navigate = useNavigate();
  const { pathname, searchStr } = useLocation();

  const index = Math.max(
    0,
    variants.findIndex(([key]) => key === current),
  );

  const go = (delta: number) => {
    const [key] = variants[(index + delta + variants.length) % variants.length]!;
    const params = new URLSearchParams(searchStr);

    params.set(param, key);
    void navigate({ href: `${pathname}?${params}`, replace: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable], [role=tab], [role=slider], [role=img]",
        )
      )
        return;

      go(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!import.meta.env.DEV) return null;

  const [key, name] = variants[index]!;

  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1.5 py-1 text-sm text-white shadow-xl ring-2 ring-primary">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="rounded-full p-1.5 hover:bg-white/20"
      >
        <CaretLeftIcon />
      </button>
      <span className="min-w-44 text-center font-mono tabular-nums">
        {key} ({name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="rounded-full p-1.5 hover:bg-white/20"
      >
        <CaretRightIcon />
      </button>
    </div>
  );
}
