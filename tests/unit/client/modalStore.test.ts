import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const fetchAllSnapshotsMock = vi.fn();

vi.mock("../../../client/src/lib/fetchSnapshots.js", () => ({
  fetchAllSnapshots: () => fetchAllSnapshotsMock(),
}));

import { modalStore } from "../../../client/src/stores/modalStore.js";

describe("modalStore", () => {
  afterEach(() => {
    fetchAllSnapshotsMock.mockReset();
    modalStore.close();
  });

  it("starts closed with no workspaces and no error", () => {
    expect(get(modalStore).mode).toBeNull();
    expect(get(modalStore).workspaces).toEqual([]);
    expect(get(modalStore).loadError).toBeNull();
  });

  it("open() on success loads workspaces, clears error, and sets mode", async () => {
    const workspaces = [{ name: "ws1", isCurrent: true, snapshots: [] }];
    fetchAllSnapshotsMock.mockResolvedValue({ ok: true, workspaces });

    await modalStore.open("delete");

    const state = get(modalStore);
    expect(state.mode).toBe("delete");
    expect(state.workspaces).toEqual(workspaces);
    expect(state.loadError).toBeNull();
  });

  it("open() on failure clears workspaces and sets loadError but still sets mode", async () => {
    fetchAllSnapshotsMock.mockResolvedValue({ ok: false, error: "boom" });

    await modalStore.open("export");

    const state = get(modalStore);
    expect(state.mode).toBe("export");
    expect(state.workspaces).toEqual([]);
    expect(state.loadError).toBe("boom");
  });

  it("close() resets mode to null", async () => {
    fetchAllSnapshotsMock.mockResolvedValue({ ok: true, workspaces: [] });
    await modalStore.open("delete");

    modalStore.close();

    expect(get(modalStore).mode).toBeNull();
  });
});
