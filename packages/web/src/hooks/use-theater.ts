import { useEffect, useRef, useState } from "react";

const IDLE_MS = 3000;

/** True after a few seconds without input, so only the Script stays on the TV. */
export function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);

    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };

    const events = ["pointermove", "pointerdown", "keydown"];

    events.forEach((event) => window.addEventListener(event, wake));

    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, wake));
      setIdle(false);
    };
  }, [enabled]);

  return idle;
}

/**
 * Keeps a cast phone from sleeping mid-game. Browsers drop the lock when the page is
 * hidden, so it is retaken on return. Best effort: it needs HTTPS and can be refused.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    let active = true;

    const acquire = async () => {
      if (requesting || (lock !== null && !lock.released)) return;

      requesting = true;

      try {
        const next = await navigator.wakeLock.request("screen");

        if (active) lock = next;
        else await next.release();
      } catch {
        // Refused, for example on low battery. The screen just sleeps as usual.
      } finally {
        requesting = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock?.release();
    };
  }, [enabled]);
}

/**
 * Asks for fullscreen, which only works inside a user gesture. iPhone Safari has no
 * page fullscreen, so Theater Mode's own overlay is what guarantees "only the Script".
 */
export const requestFullscreen = () => {
  if (document.fullscreenEnabled && document.fullscreenElement === null)
    void document.documentElement.requestFullscreen().catch(() => undefined);
};

/**
 * Whether the page is fullscreen. Leaving fullscreen by Esc or the browser's own UI
 * also calls onLeave, and closing Theater Mode any other way leaves fullscreen too.
 */
export function useFullscreen(enabled: boolean, onLeave: () => void) {
  const [fullscreen, setFullscreen] = useState(false);
  const leave = useRef(onLeave);

  leave.current = onLeave;

  useEffect(() => {
    if (!enabled) return;

    const onChange = () => {
      const now = document.fullscreenElement !== null;

      setFullscreen(now);

      if (!now) leave.current();
    };

    setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);

      if (document.fullscreenElement !== null)
        void document.exitFullscreen().catch(() => undefined);
    };
  }, [enabled]);

  return fullscreen;
}
