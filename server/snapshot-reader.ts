import { readdirSync, readFileSync } from "fs";
import { join } from "path";

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
