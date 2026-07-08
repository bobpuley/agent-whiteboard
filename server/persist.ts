// Persist-trigger vocabulary + the one shared finalize/persist write path
// (v0.25). Consolidates the near-duplicate saveSnapshot()-plus-backstop logic
// that used to live independently in render-core.ts (commitRenderResult,
// commitStepFramesResult) and slideshow.ts (finalizeSlideshow). See
// docs/04_architecture.md §9.3 D2 and §9.4 (FR20/B15 — slideshow silently
// never persisted because persistence was opt-in, not a required decision).

import { saveSnapshot } from "./snapshot.js";
import type { CanvasType, StepFrame } from "./session.js";
import type { Frame } from "./presentation.js";

/**
 * Every command path that can produce persistable content must declare one
 * of these — there is no "just don't call saveSnapshot" opt-out.
 *  - immediate:   render() / one-shot step-frames — write happens as part of commit
 *  - on-finalize: commit_step_frames() / slideshow-end — write happens once, at finalization
 *  - transient:   append_frame() — broadcasts to the browser but never touches disk
 *  - never:       step / seek / clear / history-load — nothing new to persist
 */
export type PersistTrigger = "immediate" | "on-finalize" | "transient" | "never";

/**
 * Source of truth for "which trigger does this command use" — the registry
 * `getPersistTrigger()` enforces. Adding a new command without registering an
 * entry here throws loudly instead of silently never persisting (the
 * historical FR20/B15 bug: slideshow() had no entry anywhere and simply
 * never called saveSnapshot()).
 */
const COMMAND_PERSIST_TRIGGERS: Readonly<Record<string, PersistTrigger>> = {
  render: "immediate",
  append_frame: "transient",
  commit_step_frames: "on-finalize",
  "slideshow-end": "on-finalize",
  step: "never",
  seek: "never",
  clear: "never",
  "history-load": "never",
};

/** Returns the declared trigger for a command, or throws if none is registered. */
export function getPersistTrigger(command: string): PersistTrigger {
  const trigger = COMMAND_PERSIST_TRIGGERS[command];
  if (trigger === undefined) {
    throw new Error(
      `persist: no trigger declared for command "${command}" — every command path must register one of immediate | on-finalize | transient | never in server/persist.ts before it can persist anything`
    );
  }
  return trigger;
}

export interface PersistableContent {
  type: CanvasType | "step-frames";
  payload: string;
  title?: string;
  nodeToFrame?: Record<string, number>;
  workspace: string;
  /** Pre-generated snapshot id, if the caller already minted one for broadcast purposes. */
  id?: string;
}

export interface PersistResult {
  id?: string;
}

/**
 * Converts the caller-facing `type`/`payload` shape (still a `step-frames`
 * envelope string for a sequence, per `render-core.ts`/`slideshow.ts`'s
 * construction) into the unified `frames[]`/`rawPayload` shape `saveSnapshot()`
 * writes to disk (v0.26 Sprint 43). `rawPayload` is kept only when there's
 * more than one frame — a 1-frame step-frames sequence collapses into a plain
 * single-frame record, same policy as the WS contract (Sprint 42).
 */
function toFrames(content: PersistableContent): { frames: Frame[]; rawPayload?: string } {
  if (content.type !== "step-frames") {
    return { frames: [{ type: content.type, payload: content.payload }] };
  }
  const spec = JSON.parse(content.payload) as {
    frame_type: string;
    frames: Array<{ payload: string; label?: string; type?: string }>;
  };
  const frames: Frame[] = spec.frames.map((f) => ({
    type: f.type ?? spec.frame_type,
    payload: f.payload,
    ...(f.label !== undefined ? { label: f.label } : {}),
  }));
  return frames.length > 1 ? { frames, rawPayload: content.payload } : { frames };
}

/**
 * The one shared write path. Looks up `command`'s declared trigger:
 * `immediate`/`on-finalize` write now; `transient`/`never` are deliberate
 * no-ops. F10's "a write failure must never block rendering" backstop lives
 * here once — `saveSnapshot()` already catches its own errors internally,
 * this try/catch is a deliberate caller-level guarantee on top of that.
 */
export function persistContent(command: string, content: PersistableContent): PersistResult {
  const trigger = getPersistTrigger(command);
  if (trigger === "transient" || trigger === "never") return {};

  try {
    const { frames, rawPayload } = toFrames(content);
    const id = saveSnapshot(
      frames,
      { title: content.title, node_to_frame: content.nodeToFrame, workspace: content.workspace },
      rawPayload,
      content.id
    );
    return { id };
  } catch {
    return {};
  }
}

/** Assembles the step-frames JSON payload shape shared by commit/finalize paths. */
export function assembleStepFramesPayload(frameType: string, frames: StepFrame[]): string {
  return JSON.stringify({ frame_type: frameType, frames });
}
