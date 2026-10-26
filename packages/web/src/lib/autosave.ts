export type SaveStatus = "saved" | "pending" | "failed";

export interface Autosave<A> {
  /** Records the latest value and saves it after the debounce delay. */
  readonly schedule: (value: A) => void;
  /** Saves any unsaved value now, including one whose save failed. */
  readonly retry: () => void;
  readonly status: () => SaveStatus;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Debounced, ordered saving. At most one save runs at a time; values changed
 * while it runs are saved afterwards, so a slow write can never overwrite a
 * newer one. A failed value is kept until a retry or a newer value replaces it.
 * A save scheduled before its owner unmounts still runs, so leaving a page
 * after confirming the unsaved-changes warning does not drop the last edit.
 */
export function createAutosave<A>(
  save: (value: A) => Promise<boolean>,
  delayMs: number,
): Autosave<A> {
  let status: SaveStatus = "saved";
  let unsaved: { readonly value: A } | null = null;
  let saving = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const setStatus = (next: SaveStatus) => {
    if (next === status) return;
    status = next;

    for (const listener of listeners) listener();
  };

  const flush = async () => {
    clearTimeout(timer);

    if (saving || unsaved === null) return;
    const current = unsaved;
    unsaved = null;
    saving = true;
    const ok = await save(current.value).catch(() => false);
    saving = false;

    if (!ok) {
      // A newer edit supersedes the failed one; either way, wait for a retry or another edit.
      unsaved ??= current;
      setStatus("failed");

      return;
    }

    if (unsaved === null) setStatus("saved");
    else void flush();
  };

  return {
    schedule: (value) => {
      unsaved = { value };
      setStatus("pending");
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    retry: () => {
      if (unsaved === null) return;
      setStatus("pending");
      void flush();
    },
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}
