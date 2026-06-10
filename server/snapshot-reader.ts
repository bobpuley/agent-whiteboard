import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface WorkspaceGroup {
  name: string;
  isCurrent: boolean;
  snapshots: SnapshotEntry[];
}

export interface SnapshotEntry {
  filename: string;
  timestamp: string;
  type: string;
  title?: string;
}

export function listSnapshots(workspace: string, dir: string): SnapshotEntry[] {
  const workspaceDir = join(dir, workspace);

  let files: string[];
  try {
    files = readdirSync(workspaceDir).filter((f) => f.endsWith("_screen.json"));
  } catch {
    return [];
  }

  const entries: SnapshotEntry[] = [];

  for (const filename of files) {
    try {
      const raw = readFileSync(join(workspaceDir, filename), "utf-8");
      const parsed = JSON.parse(raw) as {
        timestamp?: unknown;
        type?: unknown;
        options?: { title?: unknown };
      };

      if (typeof parsed.timestamp !== "string" || typeof parsed.type !== "string") {
        console.error(`[agent-whiteboard] snapshot-reader: skipping malformed file: ${filename}`);
        continue;
      }

      const entry: SnapshotEntry = {
        filename,
        timestamp: parsed.timestamp,
        type: parsed.type,
      };

      const title = parsed.options?.title;
      if (typeof title === "string" && title.length > 0) {
        entry.title = title;
      }

      entries.push(entry);
    } catch (err) {
      console.error(
        `[agent-whiteboard] snapshot-reader: skipping unreadable file ${filename}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Sort newest-first by timestamp string (ISO 8601 sorts lexicographically).
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return entries;
}

/**
 * Scan every workspace subdirectory under `dir` and return their snapshots grouped.
 * Workspaces with no readable snapshots are omitted from the result.
 */
export function listAllSnapshots(dir: string, currentWorkspace: string): WorkspaceGroup[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const groups: WorkspaceGroup[] = [];

  for (const name of entries) {
    const snapshots = listSnapshots(name, dir);
    if (snapshots.length === 0) continue;
    groups.push({ name, isCurrent: name === currentWorkspace, snapshots });
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));

  return groups;
}

/**
 * Read the raw content of a single snapshot file.
 * Returns null if the file does not exist or cannot be read.
 */
export function loadSnapshotContent(workspace: string, dir: string, filename: string): string | null {
  try {
    return readFileSync(join(dir, workspace, filename), "utf-8");
  } catch {
    return null;
  }
}
