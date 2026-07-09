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
