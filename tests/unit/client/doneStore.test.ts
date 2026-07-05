import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { doneStore } from "../../../client/src/stores/doneStore.js";

describe("doneStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dispatch(set_done_armed) toggles armed", () => {
    doneStore.dispatch({ action: "set_done_armed", armed: true });
    expect(get(doneStore).armed).toBe(true);

    doneStore.dispatch({ action: "set_done_armed", armed: false });
    expect(get(doneStore).armed).toBe(false);
  });

  it("dispatch ignores non-set_done_armed commands", () => {
    doneStore.dispatch({ action: "set_done_armed", armed: true });
    doneStore.dispatch({ action: "clear" });
    expect(get(doneStore).armed).toBe(true);
  });

  it("handleDone success: sets sent true, then clears after 2s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const promise = doneStore.handleDone();
    await promise;

    expect(fetch).toHaveBeenCalledWith("/user-done", { method: "POST" });
    expect(get(doneStore).sent).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(get(doneStore).sent).toBe(false);
  });

  it("handleDone is a no-op while already sent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await doneStore.handleDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await doneStore.handleDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
  });

  it("handleDone failure (non-ok response): sets error true, then clears after 2s, leaves sent false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await doneStore.handleDone();

    expect(get(doneStore).error).toBe(true);
    expect(get(doneStore).sent).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(get(doneStore).error).toBe(false);
  });

  it("handleDone failure (rejected fetch): sets error true and allows retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await doneStore.handleDone();

    expect(get(doneStore).error).toBe(true);
    expect(get(doneStore).sent).toBe(false);
  });
});
