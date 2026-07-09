import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Frame } from "./presentation.js";

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

interface ParsedSnapshotFile {
  id?: unknown;
  timestamp?: unknown;
  workspace?: unknown;
  frames?: unknown;
  title?: unknown;
  nodeToFrame?: unknown;
  rawPayload?: unknown;
}

/** Shared "is this a valid Frame[]" predicate (F6/NF23) — the one implementation checking non-empty array + per-element shape. */
export function isFrameArray(value: unknown): value is Frame[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (f) =>
        f !== null &&
        typeof f === "object" &&
        typeof (f as Frame).type === "string" &&
        typeof (f as Frame).payload === "string"
    )
  );
}

/**
 * Display "type badge" for a snapshot's frame list (v0.26 Sprint 43 — the
 * unified schema has no top-level `type` field anymore). A multi-frame
 * sequence badges as "step-frames", same literal value the old schema's
 * `type` field held for one; a single frame badges as its own resolved type
 * — this reproduces the exact old badge values for every real case,
 * including the "1-frame step-frames === plain render" policy already
 * applied to the WS contract (Sprint 42) and `rawPayload` (this schema).
 */
export function badgeType(frames: Frame[]): string {
  return frames.length > 1 ? "step-frames" : frames[0].type;
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
      const parsed = JSON.parse(raw) as ParsedSnapshotFile;

      if (typeof parsed.timestamp !== "string" || !isFrameArray(parsed.frames)) {
        console.error(`[agent-whiteboard] snapshot-reader: skipping malformed file: ${filename}`);
        continue;
      }

      const entry: SnapshotEntry = {
        filename,
        timestamp: parsed.timestamp,
        type: badgeType(parsed.frames),
      };

      if (typeof parsed.id === "string") {
        entry.id = parsed.id;
      }

      if (typeof parsed.title === "string" && parsed.title.length > 0) {
        entry.title = parsed.title;
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
 * Returns the snapshot's original re-renderable payload string if found, or null if no
 * match. `rawPayload` (the verbatim step-frames envelope) wins when present — this
 * mirrors `session.ts`'s `exportCanvas()`: `rawPayload ?? frames[0].payload`.
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
        const parsed = JSON.parse(raw) as ParsedSnapshotFile;
        if (parsed.id === id && isFrameArray(parsed.frames)) {
          return typeof parsed.rawPayload === "string" ? parsed.rawPayload : parsed.frames[0].payload;
        }
      } catch (err) {
        console.error(
          `[agent-whiteboard] snapshot-reader: skipping unreadable file ${filename}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  return null;
}

export interface SnapshotRecord {
  frames: Frame[];
  timestamp: string;
  title?: string;
  nodeToFrame?: Record<string, number>;
}

/**
 * Scan a single workspace directory for a snapshot whose `id` field matches.
 * Returns the full parsed record (frames, timestamp, title?, nodeToFrame?)
 * needed by the export pipeline, or null if no match (or the workspace
 * directory is absent). Old snapshots without an `id` field are silently
 * skipped.
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
      const parsed = JSON.parse(raw) as ParsedSnapshotFile;
      if (parsed.id === id && typeof parsed.timestamp === "string" && isFrameArray(parsed.frames)) {
        const record: SnapshotRecord = {
          frames: parsed.frames,
          timestamp: parsed.timestamp,
        };
        if (typeof parsed.title === "string") {
          record.title = parsed.title;
        }
        if (parsed.nodeToFrame !== null && typeof parsed.nodeToFrame === "object") {
          record.nodeToFrame = parsed.nodeToFrame as Record<string, number>;
        }
        return record;
      }
    } catch (err) {
      console.error(
        `[agent-whiteboard] snapshot-reader: skipping unreadable file ${filename}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return null;
}
