// Persist-trigger vocabulary + the one shared finalize/persist write path
// (v0.25). Consolidates the near-duplicate saveSnapshot()-plus-backstop logic
// that used to live independently in render-core.ts (commitRenderResult,
// commitStepFramesResult) and slideshow.ts (finalizeSlideshow). See
// docs/04_architecture.md §9.3 D2 and §9.4 (FR20/B15 — slideshow silently
// never persisted because persistence was opt-in, not a required decision).

import { saveSnapshot } from "./snapshot.js";
import type { StepFrame } from "./session.js";
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
  /** Already-resolved frames (every frame's effective type baked in — no envelope string to unpack). */
  frames: Frame[];
  /** Verbatim step-frames envelope JSON, for export()'s byte-identical round-trip (F16/V2). Only meaningful when frames.length > 1 — collapsed to undefined otherwise, same policy as the WS contract (Sprint 42). */
  rawPayload?: string;
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
    const rawPayload = content.frames.length > 1 ? content.rawPayload : undefined;
    const id = saveSnapshot(
      content.frames,
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
