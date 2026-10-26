import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAutosave } from "./autosave.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const deferredSaves = () => {
  const calls: Array<{ readonly value: string; readonly resolve: (ok: boolean) => void }> = [];

  const save = (value: string) =>
    new Promise<boolean>((resolve) => {
      calls.push({ value, resolve });
    });

  return { calls, save };
};

test("debounces edits into one save of the latest value", async () => {
  const { calls, save } = deferredSaves();
  const autosave = createAutosave(save, 500);
  autosave.schedule("a");
  await vi.advanceTimersByTimeAsync(300);
  autosave.schedule("ab");
  await vi.advanceTimersByTimeAsync(499);
  expect(calls).toEqual([]);
  expect(autosave.status()).toBe("pending");
  await vi.advanceTimersByTimeAsync(1);
  expect(calls.map((call) => call.value)).toEqual(["ab"]);
  calls[0]?.resolve(true);
  await vi.runAllTimersAsync();
  expect(autosave.status()).toBe("saved");
});

test("never overlaps saves: edits during a slow save are written afterwards, in order", async () => {
  const { calls, save } = deferredSaves();
  const autosave = createAutosave(save, 100);
  autosave.schedule("first");
  await vi.advanceTimersByTimeAsync(100);
  autosave.schedule("second");
  autosave.schedule("third");
  await vi.advanceTimersByTimeAsync(1_000);
  expect(calls.map((call) => call.value)).toEqual(["first"]);
  calls[0]?.resolve(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(calls.map((call) => call.value)).toEqual(["first", "third"]);
  expect(autosave.status()).toBe("pending");
  calls[1]?.resolve(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(autosave.status()).toBe("saved");
});

test("a failed save keeps the value until retry, and notifies status changes", async () => {
  const { calls, save } = deferredSaves();
  const autosave = createAutosave(save, 100);
  const statuses: string[] = [];
  autosave.subscribe(() => statuses.push(autosave.status()));
  autosave.schedule("draft");
  await vi.advanceTimersByTimeAsync(100);
  calls[0]?.resolve(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(autosave.status()).toBe("failed");
  expect(calls).toHaveLength(1);
  autosave.retry();
  expect(calls.map((call) => call.value)).toEqual(["draft", "draft"]);
  calls[1]?.resolve(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(statuses).toEqual(["pending", "failed", "pending", "saved"]);
});

test("a rejected save counts as a failure and a newer edit replaces the failed value", async () => {
  const values: string[] = [];
  let fail = true;

  const autosave = createAutosave(async (value: string) => {
    values.push(value);

    if (fail) throw new Error("offline");

    return true;
  }, 100);

  autosave.schedule("old");
  await vi.advanceTimersByTimeAsync(100);
  expect(autosave.status()).toBe("failed");
  fail = false;
  autosave.schedule("new");
  await vi.advanceTimersByTimeAsync(100);
  expect(values).toEqual(["old", "new"]);
  expect(autosave.status()).toBe("saved");
});
