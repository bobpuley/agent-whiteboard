export interface SnapshotEntry {
  filename: string;
  timestamp: string;
  type: string;
  title?: string;
  // Absent only for pre-migration snapshots (see 04 §9, snapshot schema
  // migration, v0.26) — every snapshot written today always has one.
  id?: string;
}

export interface WorkspaceGroup {
  name: string;
  isCurrent: boolean;
  snapshots: SnapshotEntry[];
}

// Shared shape for the server's JSON error-result endpoints (NF39) — matches
// the ad hoc { ok, error? } cast fetchAllSnapshots already used inline.
export interface ApiResult {
  ok: boolean;
  error?: string;
}
