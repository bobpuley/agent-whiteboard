export interface SnapshotEntry {
  filename: string;
  timestamp: string;
  type: string;
  title?: string;
}

export interface WorkspaceGroup {
  name: string;
  isCurrent: boolean;
  snapshots: SnapshotEntry[];
}
