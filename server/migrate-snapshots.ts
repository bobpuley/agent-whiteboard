// One-time, deterministic, idempotent migration: upgrades snapshot files
// written under the old top-level `type`/`payload`/`options` schema to the
// unified `frames[]`/`cursor` schema (v0.26 Sprint 43, OQ5a in docs/02). No
// legacy dual-read path exists anywhere in the app — every reader
// (snapshot-reader.ts, app.ts, export-html.ts) only understands the new
// shape, so this script must run once against real data (Sprint 44, after a
// verified backup) before those readers see it.
//
// "Idempotent" here means "safe to re-run": an already-migrated file (one
// that already carries a `frames` array) is left untouched. It does not mean
// byte-identical output across repeated *first* runs — a legacy file missing
// an `id` gets a freshly generated UUID, which is unavoidably random on that
// one pass. Once migrated, every subsequent run is a no-op for that file.

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Frame } from "./presentation.js";
import type { SnapshotFile } from "./snapshot.js";
import { getSnapshotsRoot } from "./paths.js";

export type MigrateFileResult =
  | { kind: "migrated"; content: SnapshotFile }
  | { kind: "already-migrated" }
  | { kind: "error"; message: string };

/** Pure transform: parsed old- or new-schema JSON in, migration decision out. No I/O. */
export function migrateSnapshotFile(raw: unknown): MigrateFileResult {
  if (raw === null || typeof raw !== "object") {
    return { kind: "error", message: "not a JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  // Idempotency: the new schema's marker is a `frames` array — a file that
  // already has one is left alone, migrated or not by this script.
  if (Array.isArray(obj.frames)) {
    return { kind: "already-migrated" };
  }

  if (
    typeof obj.type !== "string" ||
    typeof obj.payload !== "string" ||
    typeof obj.timestamp !== "string" ||
    typeof obj.workspace !== "string"
  ) {
    return { kind: "error", message: "missing required legacy fields (type/payload/timestamp/workspace)" };
  }

  const options = (obj.options ?? {}) as { title?: unknown; node_to_frame?: unknown };
  const title = typeof options.title === "string" ? options.title : undefined;
  const nodeToFrame =
    options.node_to_frame !== null && typeof options.node_to_frame === "object"
      ? (options.node_to_frame as Record<string, number>)
      : undefined;
  const id = typeof obj.id === "string" ? obj.id : crypto.randomUUID();

  let frames: Frame[];
  let rawPayload: string | undefined;

  if (obj.type === "step-frames") {
    let spec: { frame_type?: unknown; frames?: unknown };
    try {
      spec = JSON.parse(obj.payload) as typeof spec;
    } catch {
      return { kind: "error", message: "step-frames payload is not valid JSON" };
    }
    if (typeof spec.frame_type !== "string" || !Array.isArray(spec.frames)) {
      return { kind: "error", message: "step-frames payload is missing frame_type/frames" };
    }
    const frameType = spec.frame_type;
    const rawFrames = spec.frames as Array<{ payload?: unknown; label?: unknown; type?: unknown }>;
    if (!rawFrames.every((f) => typeof f.payload === "string")) {
      return { kind: "error", message: "step-frames payload has a frame with a non-string payload" };
    }
    frames = rawFrames.map((f) => ({
      type: typeof f.type === "string" ? f.type : frameType,
      payload: f.payload as string,
      ...(typeof f.label === "string" ? { label: f.label } : {}),
    }));
    // A 1-frame step-frames sequence collapses into a plain single-frame
    // record — same "indistinguishable from a static render" policy already
    // applied to the WS contract (Sprint 42) and to fresh writes (snapshot.ts).
    if (frames.length > 1) rawPayload = obj.payload;
  } else {
    frames = [{ type: obj.type, payload: obj.payload }];
  }

  const content: SnapshotFile = {
    id,
    timestamp: obj.timestamp,
    workspace: obj.workspace,
    cursor: 0,
    frames,
    ...(title !== undefined ? { title } : {}),
    ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
    ...(rawPayload !== undefined ? { rawPayload } : {}),
  };

  return { kind: "migrated", content };
}

export interface MigrationSummary {
  migrated: number;
  alreadyMigrated: number;
  errors: Array<{ file: string; message: string }>;
}

/**
 * Scans every workspace subdirectory of `dir` (same traversal as
 * `listAllSnapshots()`) and migrates every `*_screen.json` file found.
 * `dryRun: true` computes the summary without writing anything to disk —
 * required by N5 (docs/02) before running against the real snapshots root.
 */
export function migrateDirectory(dir: string, options: { dryRun?: boolean } = {}): MigrationSummary {
  const { dryRun = false } = options;
  const summary: MigrationSummary = { migrated: 0, alreadyMigrated: 0, errors: [] };

  let workspaceDirs: string[];
  try {
    workspaceDirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return summary;
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
      const filePath = join(workspaceDir, filename);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(filePath, "utf-8"));
      } catch (err) {
        summary.errors.push({ file: filePath, message: err instanceof Error ? err.message : String(err) });
        continue;
      }

      const result = migrateSnapshotFile(raw);
      if (result.kind === "already-migrated") {
        summary.alreadyMigrated++;
      } else if (result.kind === "error") {
        summary.errors.push({ file: filePath, message: result.message });
      } else {
        summary.migrated++;
        if (!dryRun) {
          writeFileSync(filePath, JSON.stringify(result.content, null, 2), "utf-8");
        }
      }
    }
  }

  return summary;
}

// ── CLI entry point ──────────────────────────────────────────────────────
// Usage: tsx server/migrate-snapshots.ts [--dry-run] [--dir <path>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dirFlagIndex = args.indexOf("--dir");
  const dir =
    dirFlagIndex !== -1 && args[dirFlagIndex + 1] !== undefined
      ? args[dirFlagIndex + 1]
      : getSnapshotsRoot();

  console.log(`[migrate-snapshots] scanning ${dir}${dryRun ? " (dry run)" : ""}`);
  const summary = migrateDirectory(dir, { dryRun });
  console.log(
    `[migrate-snapshots] migrated: ${summary.migrated}, already-migrated: ${summary.alreadyMigrated}, errors: ${summary.errors.length}`
  );
  for (const err of summary.errors) {
    console.error(`[migrate-snapshots]   ${err.file}: ${err.message}`);
  }
  if (summary.errors.length > 0) process.exitCode = 1;
}
