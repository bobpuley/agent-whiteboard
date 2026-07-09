import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Frame } from "./presentation.js";
import { getSnapshotsRoot } from "./paths.js";

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
