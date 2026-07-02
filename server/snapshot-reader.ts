import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface WorkspaceGroup {
  name: string;
  isCurrent: boolean;
  snapshots: SnapshotEntry[];
}

export interface SnapshotEntry {
  id?: string;
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
        id?: unknown;
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

      if (typeof parsed.id === "string") {
        entry.id = parsed.id;
      }

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

/**
 * Scan all workspace subdirectories under `dir` for a snapshot whose `id` field matches.
 * Returns the snapshot's `payload` string if found, or null if no match.
 * Old snapshots without an `id` field are silently skipped.
 */
export function findSnapshotById(id: string, dir: string): string | null {
  let workspaceDirs: string[];
  try {
    workspaceDirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  for (const workspace of workspaceDirs) {
    const workspaceDir = join(dir, workspace);
    let files: string[];
    try {
      files = readdirSync(workspaceDir).filter((f) => f.endsWith("_screen.json"));
    } catch {
      continue;
    }

    for (const filename of files) {
      try {
        const raw = readFileSync(join(workspaceDir, filename), "utf-8");
        const parsed = JSON.parse(raw) as { id?: unknown; payload?: unknown };
        if (parsed.id === id && typeof parsed.payload === "string") {
          return parsed.payload;
        }
      } catch {
        // Skip unreadable or malformed files.
      }
    }
  }

  return null;
}

export interface SnapshotRecord {
  type: string;
  payload: string;
  timestamp: string;
  options?: { title?: string };
}

/**
 * Scan a single workspace directory for a snapshot whose `id` field matches.
 * Returns the full parsed record (type, payload, timestamp, options) needed by
 * the export pipeline, or null if no match (or the workspace directory is absent).
 * Old snapshots without an `id` field are silently skipped.
 */
export function findSnapshotByIdInWorkspace(workspace: string, id: string, dir: string): SnapshotRecord | null {
  const workspaceDir = join(dir, workspace);

  let files: string[];
  try {
    files = readdirSync(workspaceDir).filter((f) => f.endsWith("_screen.json"));
  } catch {
    return null;
  }

  for (const filename of files) {
    try {
      const raw = readFileSync(join(workspaceDir, filename), "utf-8");
      const parsed = JSON.parse(raw) as {
        id?: unknown;
        type?: unknown;
        payload?: unknown;
        timestamp?: unknown;
        options?: { title?: unknown };
      };
      if (
        parsed.id === id &&
        typeof parsed.type === "string" &&
        typeof parsed.payload === "string" &&
        typeof parsed.timestamp === "string"
      ) {
        const record: SnapshotRecord = {
          type: parsed.type,
          payload: parsed.payload,
          timestamp: parsed.timestamp,
        };
        if (typeof parsed.options?.title === "string") {
          record.options = { title: parsed.options.title };
        }
        return record;
      }
    } catch {
      // Skip unreadable or malformed files.
    }
  }

  return null;
}
