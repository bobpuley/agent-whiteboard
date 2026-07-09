// Shared core logic for render / step-frames-create / append / commit /
// workspace-validation — used identically by the REST handlers (app.ts) and
// the MCP tool handlers (mcp.ts) so the two transports can never drift (NF12).
import { cancelSlideshow } from "./slideshow.js";
import { broadcastReplace, broadcastStepFrames } from "./ws.js";
import { generateSnapshotId } from "./snapshot-writer.js";
import { assembleStepFramesPayload, persistContent } from "./persist.js";
import { validateFrame } from "./validate.js";
import { getCanvas, isStepSequence, seekStepFrame, setCanvas, setLastWorkspace, setStepFrames, stepCursor } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";
import type { Frame } from "./presentation.js";
import { appendFrame, commitBuilder, createBuilder } from "./step-frames-builder.js";
import type { AppendResult, CommitResult } from "./step-frames-builder.js";
import { getViewport } from "./viewport-cache.js";

// Re-exported so app.ts/mcp.ts don't need to know it actually lives in
// validate.ts — moved there (v0.28 Sprint 59) so snapshot-writer.ts can also
// depend on it without a render-core.ts <-> snapshot-writer.ts import cycle.
export { validateWorkspaceInput } from "./validate.js";
export type { WorkspaceValidation } from "./validate.js";

export interface RenderResult {
  ok: true;
  id?: string;
}

/**
 * Commits an already-validated render() payload: cancels any running
 * slideshow, stores the canvas state, broadcasts to the browser, updates
 * lastWorkspace, and writes the snapshot (F10 — a write failure must never
 * block rendering). Shared by POST /render and the MCP `render` tool.
 * render() is single-frame only (v0.26 Sprint 45) — multi-frame sequences are
 * built exclusively via init_step_frames()/append_frame()/commit_step_frames().
 */
export function commitRenderResult(
  type: CanvasType,
  payload: string,
  workspace: string,
  title: string | undefined,
): RenderResult {
  cancelSlideshow();

  // Generate the id before broadcasting so the browser can key its viewport
  // report on it — a brand-new render() always mints a fresh id (F19/C3).
  const newId = generateSnapshotId();
  setCanvas(type, payload, title, newId);
  broadcastReplace({ type, payload, title, id: newId, cursor: 0, total: 1 });
  setLastWorkspace(workspace);
  const { id: snapshotId } = persistContent("render", {
    frames: [{ type, payload }],
    title,
    workspace,
    id: newId,
  });
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
 * Persist trigger: "transient" (server/persist.ts) — never touches disk;
 * only `commit_step_frames()` persists.
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
    broadcastStepFrames(frames, frame_type, frames.length - 1, id, title);
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
 * `nodeToFrame` (v0.26 Sprint 45): optional node ID → frame index map for
 * autonomous browser navigation (U4e) — this is its only entry point now that
 * one-shot render(type="step-frames", options.node_to_frame) no longer exists.
 */
export function commitStepFramesResult(id: string, nodeToFrame?: Record<string, number>): CommitStepFramesResult {
  const result: CommitResult = commitBuilder(id);
  if (!result.ok) return result;

  const { entry } = result;
  const { frame_type, workspace, title, frames } = entry;
  const assembledPayload = assembleStepFramesPayload(frame_type, frames);
  const resolvedFrames: Frame[] = frames.map((f) => ({
    type: f.type ?? frame_type,
    payload: f.payload,
    ...(f.label !== undefined ? { label: f.label } : {}),
  }));

  cancelSlideshow();
  const commitId = generateSnapshotId();
  setStepFrames(frames, frame_type, assembledPayload, title, nodeToFrame, commitId);
  setLastWorkspace(workspace);
  const { id: commitSnapshotId } = persistContent("commit_step_frames", {
    frames: resolvedFrames,
    rawPayload: assembledPayload,
    title,
    nodeToFrame,
    workspace,
    id: commitId,
  });
  // Final broadcast for consistency (handles clear() called between appends).
  broadcastStepFrames(frames, frame_type, 0, commitId, title, nodeToFrame);
  return { ok: true, ...(commitSnapshotId !== undefined ? { id: commitSnapshotId } : {}) };
}

export type ApplyLoadedSnapshotResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Commits an already-parsed history-load snapshot (NF25, v0.28 Sprint 58):
 * validates every frame, decides single-frame vs step-frames, updates
 * in-memory canvas state, broadcasts to the browser, and updates
 * lastWorkspace. Write-silent — persist trigger "never" (server/persist.ts),
 * same as step()/seek()/clear(). Shared entry point for POST /snapshots/load;
 * the handler is reduced to request-shape parsing + file loading.
 */
export async function applyLoadedSnapshotResult(
  frames: Frame[],
  workspace: string,
  title: string | undefined,
  nodeToFrame: Record<string, number> | undefined,
  snapshotId: string | undefined,
  rawPayload: string | undefined
): Promise<ApplyLoadedSnapshotResult> {
  for (const frame of frames) {
    const validationError = await validateFrame(frame);
    if (validationError) {
      return { ok: false, error: validationError };
    }
  }

  // History-load always redisplays from frame 0 (F10 — cursor is always 0 at
  // write time), so the viewport lookup is always for frame 0 (v0.26.1,
  // B19/FR21 — composite id:frameIndex key). Looked up under the snapshot's
  // own id, not a synthesized one — a synthesized id can never have a cache
  // entry anyway.
  const viewport = snapshotId !== undefined ? getViewport(snapshotId, 0) : undefined;
  // A concrete id is required on every broadcast (v0.26 Sprint 42) — pre-v0.11
  // snapshots may lack one (J1, `02`), so synthesize a fresh one here.
  const resolvedId = snapshotId ?? generateSnapshotId();

  if (frames.length > 1) {
    const stepFrames: StepFrame[] = frames.map((f) => ({ payload: f.payload, type: f.type, ...(f.label !== undefined ? { label: f.label } : {}) }));
    // rawPayload (v0.26 Sprint 43) carries the verbatim original step-frames
    // envelope — reconstruct only if a hand-edited/pre-migration file lacks it.
    const assembledRawPayload = rawPayload ?? assembleStepFramesPayload(frames[0].type, stepFrames);
    setStepFrames(stepFrames, frames[0].type, assembledRawPayload, title, nodeToFrame, resolvedId);
    broadcastReplace({
      type: frames[0].type,
      payload: frames[0].payload,
      frameLabel: frames[0].label,
      cursor: 0,
      total: frames.length,
      title,
      nodeToFrame,
      id: resolvedId,
      viewport,
    });
  } else {
    setCanvas(frames[0].type as CanvasType, frames[0].payload, title, resolvedId);
    broadcastReplace({ type: frames[0].type, payload: frames[0].payload, title, id: resolvedId, cursor: 0, total: 1, viewport });
  }

  setLastWorkspace(workspace);
  persistContent("history-load", { frames, title, nodeToFrame, workspace, id: resolvedId });
  return { ok: true };
}

export type StepSeekResult =
  | { ok: true; current_frame: number; total_frames: number }
  | { ok: false; error: string };

/**
 * Advances/rewinds the step cursor and broadcasts the resulting frame.
 * Shared by POST /step and the MCP `step` tool (NF19 — previously duplicated
 * verbatim between app.ts and mcp.ts, the one hot-path pair render-core.ts's
 * own NF12 header comment didn't yet cover).
 */
export function stepAndBroadcast(direction: "next" | "prev"): StepSeekResult {
  const result = stepCursor(direction);
  if (!result) {
    return { ok: false, error: "no step-frames sequence is loaded" };
  }
  const state = getCanvas();
  if (isStepSequence(state)) {
    const { frames, title, id } = state.presentation;
    // Same id as when this sequence was created — tells the browser this is
    // a continuation, not a new diagram (F19/C3). Each frame now re-fits or
    // restores its own saved viewport independently (v0.26.1, bug B19/FR21) —
    // no longer "must not re-fit" for the whole sequence.
    const resolvedId = id ?? generateSnapshotId();
    const viewport = getViewport(resolvedId, result.currentFrame);
    broadcastStepFrames(frames, state.frameType, result.currentFrame, resolvedId, title, state.nodeToFrame, viewport);
  }
  return { ok: true, current_frame: result.currentFrame, total_frames: result.totalFrames };
}

/**
 * Jumps the step cursor to an arbitrary frame index and broadcasts it.
 * Shared by POST /seek and the MCP `seek` tool (NF19, see `stepAndBroadcast`).
 */
export function seekAndBroadcast(frame: number): StepSeekResult {
  const state = getCanvas();
  if (!isStepSequence(state)) {
    return { ok: false, error: "no step-frames sequence is loaded" };
  }
  const { frames, title, id } = state.presentation;
  const total = frames.length;
  if (frame < 0 || frame >= total) {
    return { ok: false, error: `frame out of range: must be 0–${total - 1}` };
  }
  seekStepFrame(frame);
  const f = frames[frame];
  const resolvedId = id ?? generateSnapshotId();
  broadcastReplace({
    type: f.type,
    payload: f.payload,
    frameLabel: f.label,
    cursor: frame,
    total,
    title,
    nodeToFrame: state.nodeToFrame,
    id: resolvedId,
    // Per-frame restore (v0.26.1, bug B19/FR21) — each frame of a sequence
    // re-fits or restores independently instead of sharing one viewport.
    viewport: getViewport(resolvedId, frame),
  });
  return { ok: true, current_frame: frame, total_frames: total };
}
