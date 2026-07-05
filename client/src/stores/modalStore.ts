// Delete/export modal orchestration (v0.16) — loads the workspace list on
// open and tracks which mode (delete/export) is active.
import { writable } from "svelte/store";
import type { WorkspaceGroup } from "../lib/snapshotTypes";
import { fetchAllSnapshots } from "../lib/fetchSnapshots.js";

export type ModalMode = "delete" | "export" | null;

export interface ModalViewState {
  mode: ModalMode;
  workspaces: WorkspaceGroup[];
  loadError: string | null;
}

function createModalStore() {
  const state = writable<ModalViewState>({ mode: null, workspaces: [], loadError: null });

  async function open(m: "delete" | "export") {
    const result = await fetchAllSnapshots();
    if (result.ok) {
      state.update((s) => ({ ...s, workspaces: result.workspaces, loadError: null, mode: m }));
    } else {
      state.update((s) => ({ ...s, workspaces: [], loadError: result.error, mode: m }));
    }
  }

  function close() {
    state.update((s) => ({ ...s, mode: null }));
  }

  return { subscribe: state.subscribe, open, close };
}

export const modalStore = createModalStore();
