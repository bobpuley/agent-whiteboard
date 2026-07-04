import type { WorkspaceGroup } from "./snapshotTypes";

export type FetchSnapshotsResult =
  | { ok: true; workspaces: WorkspaceGroup[] }
  | { ok: false; error: string };

// Shared GET /snapshots/all wrapper — both App.svelte (delete/export modal)
// and HistoryPanel.svelte call this so a failure is handled identically and
// surfaced to the user at every call site instead of silently falling back
// to an empty list (B13).
export async function fetchAllSnapshots(): Promise<FetchSnapshotsResult> {
  try {
    const res = await fetch("/snapshots/all");
    const data = (await res.json()) as { ok: boolean; workspaces?: WorkspaceGroup[]; error?: string };
    if (data.ok && data.workspaces) {
      return { ok: true, workspaces: data.workspaces };
    }
    return { ok: false, error: data.error ?? "Failed to load snapshots" };
  } catch {
    return { ok: false, error: "Network error loading snapshots" };
  }
}
