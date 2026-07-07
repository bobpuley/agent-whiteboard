// Shared core logic for render / step-frames-create / append / commit /
// workspace-validation — used identically by the REST handlers (app.ts) and
// the MCP tool handlers (mcp.ts) so the two transports can never drift (NF12).
import { cancelSlideshow } from "./slideshow.js";
import { broadcastReplace, broadcastStepFrames } from "./ws.js";
import { generateSnapshotId, saveSnapshot } from "./snapshot.js";
import { isValidWorkspaceName } from "./validate.js";
import { setCanvas, setLastWorkspace, setStepFrames } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";
import { appendFrame, commitBuilder, createBuilder } from "./step-frames-builder.js";
import type { AppendResult, CommitResult } from "./step-frames-builder.js";

export type WorkspaceValidation =
  | { ok: true; workspace: string }
  | { ok: false; error: string };

/**
 * Validates the `workspace` field required by render(), init_step_frames(),
 * list_snapshots(), and export_html() — same rule and error text everywhere
 * (F14/F15/F18 in docs/03).
 */
export function validateWorkspaceInput(workspace: unknown): WorkspaceValidation {
  if (!workspace) {
    return { ok: false, error: "workspace is required" };
  }
  const ws = workspace as string;
  if (!isValidWorkspaceName(ws)) {
    return {
      ok: false,
      error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
    };
  }
  return { ok: true, workspace: ws };
}

export interface RenderResult {
  ok: true;
  id?: string;
}

/**
 * Commits an already-validated render() payload: cancels any running
 * slideshow, stores the canvas state (step-frames or single-type), broadcasts
 * to the browser, updates lastWorkspace, and writes the snapshot (F10 — a
 * write failure must never block rendering). Shared by POST /render and the
 * MCP `render` tool.
 */
export function commitRenderResult(
  type: CanvasType | "step-frames",
  payload: string,
  workspace: string,
  title: string | undefined,
  nodeToFrame: Record<string, number> | undefined,
): RenderResult {
  cancelSlideshow();

  if (type === "step-frames") {
    const spec = JSON.parse(payload) as { frame_type: string; frames: StepFrame[] };
    const frames = spec.frames;
    // Generate the id before broadcasting so the browser can key its viewport
    // report on it — a brand-new render() always mints a fresh id (F19/C3).
    const newId = generateSnapshotId();
    setStepFrames(frames, spec.frame_type, payload, title, nodeToFrame, newId);
    broadcastReplace({
      type: frames[0].type ?? spec.frame_type,
      payload: frames[0].payload,
      frameLabel: frames[0].label,
      stepFrames: true,
      currentFrame: 0,
      totalFrames: frames.length,
      title,
      nodeToFrame,
      id: newId,
    });
    setLastWorkspace(workspace);
    // F10: a write failure must never block rendering. saveSnapshot() already
    // catches its own errors, but this try/catch is a deliberate caller-level
    // backstop for that guarantee.
    let snapshotId: string | undefined;
    try {
      snapshotId = saveSnapshot("step-frames", payload, { title, node_to_frame: nodeToFrame, workspace }, newId);
    } catch { /* non-fatal, see F10 */ }
    return { ok: true, ...(snapshotId !== undefined ? { id: snapshotId } : {}) };
  }

  // svg, html, katex, mermaid, vega-lite
  const newId = generateSnapshotId();
  setCanvas(type as CanvasType, payload, title, newId);
  broadcastReplace({ type, payload, title, id: newId });
  setLastWorkspace(workspace);
  // F10 backstop — see comment above.
  let snapshotId: string | undefined;
  try {
    snapshotId = saveSnapshot(type as CanvasType, payload, { title, workspace }, newId);
  } catch { /* non-fatal, see F10 */ }
  return { ok: true, ...(snapshotId !== undefined ? { id: snapshotId } : {}) };
}

/**
 * Creates an incremental step-frames builder entry and pushes the 0-frame
 * placeholder to the browser. Callers validate `frameType`/`workspace`
 * beforehand (REST via a runtime check, MCP via its zod schema). Shared by
 * POST /step-frames/init and the MCP `init_step_frames` tool.
 */
export function initStepFramesResult(
  frameType: string,
  workspace: string,
  title: string | undefined,
): { id: string } {
  const id = createBuilder(frameType, workspace, title);
  broadcastReplace({ type: "step-frames-placeholder", frameCount: 0, title });
  return { id };
}

/**
 * Appends a frame to an in-progress step-frames builder and, if accepted,
 * pushes the accumulated partial sequence to the browser (live preview,
 * v0.9). Shared by POST /step-frames/:id/frame and the MCP `append_frame` tool.
 */
export async function appendFrameAndBroadcast(
  id: string,
  payload: string,
  label?: string,
  type?: string,
): Promise<AppendResult> {
  const result = await appendFrame(id, payload, label, type);
  if (result.ok) {
    // Live preview: push the accumulated partial sequence to the browser.
    // Reuse the builder id so the browser fits-to-view once on the first
    // frame and treats subsequent appends as a continuation (F19/C3) — this
    // is distinct from the final snapshot id minted at commit time.
    const { frames, frame_type, title } = result;
    broadcastStepFrames(frames, frame_type, frames.length - 1, title, id);
  }
  return result;
}

export type CommitStepFramesResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/**
 * Finalises an in-progress step-frames builder entry: assembles the full
 * JSON, cancels any running slideshow, updates in-memory canvas state,
 * writes the snapshot (F10 backstop), and sends a final broadcast (handles
 * clear() called between appends). Shared by POST /step-frames/:id/commit
 * and the MCP `commit_step_frames` tool.
 */
export function commitStepFramesResult(id: string): CommitStepFramesResult {
  const result: CommitResult = commitBuilder(id);
  if (!result.ok) return result;

  const { entry } = result;
  const { frame_type, workspace, title, frames } = entry;
  const assembledPayload = JSON.stringify({ frame_type, frames });

  cancelSlideshow();
  const commitId = generateSnapshotId();
  setStepFrames(frames, frame_type, assembledPayload, title, undefined, commitId);
  setLastWorkspace(workspace);
  // F10 backstop — see comment near the other saveSnapshot() calls above.
  let commitSnapshotId: string | undefined;
  try {
    commitSnapshotId = saveSnapshot("step-frames", assembledPayload, { title, workspace }, commitId);
  } catch { /* non-fatal, see F10 */ }
  // Final broadcast for consistency (handles clear() called between appends).
  broadcastStepFrames(frames, frame_type, 0, title, commitId);
  return { ok: true, ...(commitSnapshotId !== undefined ? { id: commitSnapshotId } : {}) };
}
