import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { join, resolve, sep } from "path";
import type { Frame } from "./presentation.js";
import { getSnapshotsRoot } from "./paths.js";
import { readSnapshotIdSafe } from "./snapshot-reader.js";
import { isValidSnapshotFilename, validateWorkspaceInput } from "./validate.js";
import { deleteViewports } from "./viewport-cache.js";

export interface RenderOptions {
  title?: string;
  node_to_frame?: Record<string, number>;
  workspace: string;
}

/**
 * On-disk snapshot schema (v0.26 Sprint 43 — unified `frames[]` schema,
 * replacing the old top-level `type`/`payload`/`options` triple). Every
 * snapshot is a `Presentation`-shaped record: a one-shot render is a
 * single-element `frames` array; a step-frames sequence is the full
 * multi-element array with each frame's already-resolved effective type
 * (`frame.type ?? frame_type`). `cursor` is always 0 at write time — history
 * load always redisplays a sequence from its first frame, so there is
 * nothing else to preserve.
 *
 * `rawPayload`, present only when `frames.length > 1`, mirrors
 * `session.ts`'s `CanvasState.rawPayload`: the verbatim original step-frames
 * envelope JSON (`{ frame_type, frames }`), kept solely so `export(id)` can
 * return byte-identical content instead of a reconstructed approximation. A
 * committed 1-frame step-frames sequence has no `rawPayload` — per the same
 * policy applied to the WS contract in Sprint 42, it's indistinguishable
 * from a one-shot render.
 */
export interface SnapshotFile {
  id: string;
  timestamp: string;
  workspace: string;
  cursor: number;
  frames: Frame[];
  title?: string;
  nodeToFrame?: Record<string, number>;
  rawPayload?: string;
}

/** Generate a snapshot id up front, before the write happens — lets callers
 * broadcast the id to the browser (e.g. for viewport-cache keying) without
 * waiting on the (synchronous, but logically separate) disk write. */
export function generateSnapshotId(): string {
  return crypto.randomUUID();
}

export function saveSnapshot(
  frames: Frame[],
  options: RenderOptions,
  rawPayload?: string,
  id?: string
): string | undefined {
  try {
    const { workspace } = options;
    const root = getSnapshotsRoot();
    const dir = join(root, workspace);
    mkdirSync(dir, { recursive: true });

    const now = new Date();
    const usedId = id ?? crypto.randomUUID();
    // Include the (already-unique) id so two writes in the same second never collide.
    const filename = `${formatTimestamp(now)}_${usedId}_screen.json`;

    const content: SnapshotFile = {
      id: usedId,
      timestamp: now.toISOString(),
      workspace,
      cursor: 0,
      frames,
      ...(options.title !== undefined ? { title: options.title } : {}),
      ...(options.node_to_frame !== undefined ? { nodeToFrame: options.node_to_frame } : {}),
      ...(rawPayload !== undefined ? { rawPayload } : {}),
    };

    writeFileSync(join(dir, filename), JSON.stringify(content, null, 2), "utf-8");
    return usedId;
  } catch (err) {
    console.error(
      "[agent-whiteboard] snapshot write failed:",
      err instanceof Error ? err.message : String(err)
    );
    return undefined;
  }
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export type WorkspaceForDeleteResult =
  | { ok: true; workspace: string }
  | { ok: false; error: string; status: 400 | 404 };

/**
 * Workspace validation for the delete endpoints (NF26, v0.28 Sprint 59):
 * builds on the shared `validateWorkspaceInput()` (render-core.ts) and adds
 * the two checks specific to deleting an existing directory — containment
 * (belt-and-suspenders against a resolved path escaping the snapshots root,
 * e.g. workspace ".", B6) and existence (404 if the workspace was never
 * created or was already deleted).
 */
export function validateWorkspaceForDelete(workspace: unknown, root: string): WorkspaceForDeleteResult {
  const validated = validateWorkspaceInput(workspace);
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }
  const dir = join(root, validated.workspace);
  if (!resolve(dir).startsWith(resolve(root) + sep)) {
    return { ok: false, error: "invalid workspace: path traversal not allowed", status: 400 };
  }
  if (!existsSync(dir)) {
    return { ok: false, error: "workspace not found", status: 404 };
  }
  return { ok: true, workspace: validated.workspace };
}

export type DeleteFilesResult = { ok: true; deleted: number } | { ok: false; error: string };

/**
 * Deletes the given snapshot filenames from `workspace` and cleans up their
 * viewport-cache entries (C3, `02`). Missing files are silently skipped.
 * Shared by POST /snapshots/delete-files (NF26, v0.28 Sprint 59).
 */
export function deleteSnapshotFiles(workspace: string, root: string, filenames: string[]): DeleteFilesResult {
  for (const f of filenames) {
    if (!isValidSnapshotFilename(f)) {
      return { ok: false, error: `invalid filename: ${f}` };
    }
  }

  const workspaceDir = join(root, workspace);
  let deleted = 0;
  const deletedIds: string[] = [];
  for (const f of filenames) {
    const fullPath = join(workspaceDir, f);
    const id = readSnapshotIdSafe(fullPath);
    try {
      unlinkSync(fullPath);
      deleted++;
      if (id !== undefined) deletedIds.push(id);
    } catch {
      // Missing files are silently skipped.
    }
  }
  deleteViewports(deletedIds);
  return { ok: true, deleted };
}

/**
 * Removes an entire workspace directory and cleans up viewport-cache entries
 * for every snapshot that lived in it (C3, `02`). Shared by
 * POST /snapshots/delete-workspace (NF26, v0.28 Sprint 59).
 */
export function deleteWorkspace(workspace: string, root: string): void {
  const workspaceDir = join(root, workspace);
  let idsToClean: string[] = [];
  try {
    idsToClean = readdirSync(workspaceDir)
      .filter((f) => f.endsWith("_screen.json"))
      .map((f) => readSnapshotIdSafe(join(workspaceDir, f)))
      .filter((id): id is string => id !== undefined);
  } catch {
    // Workspace directory unreadable/absent — nothing to clean up.
  }

  rmSync(workspaceDir, { recursive: true, force: true });
  deleteViewports(idsToClean);
}
