// In-memory builder map for incremental step-frames creation (v0.8).
// Agents call init → append × N → commit instead of generating one large payload.

import { randomUUID } from "crypto";
import { validatePayload } from "./validate.js";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface BuilderFrame {
  payload: string;
  label?: string;
}

interface BuilderEntry {
  frame_type: string;
  workspace: string;
  title?: string;
  frames: BuilderFrame[];
  timer: ReturnType<typeof setTimeout>;
}

const builders = new Map<string, BuilderEntry>();

/** Create a new builder entry. Returns the assigned UUID. */
export function createBuilder(
  frame_type: string,
  workspace: string,
  title?: string
): string {
  const id = randomUUID();
  const timer = setTimeout(() => expireBuilder(id), TTL_MS);
  builders.set(id, { frame_type, workspace, title, frames: [], timer });
  return id;
}

export type AppendResult =
  | { ok: true; frame_count: number }
  | { ok: false; error: string };

/** Append a frame to an existing builder entry. Validates payload against frame_type. */
export async function appendFrame(
  id: string,
  payload: string,
  label?: string
): Promise<AppendResult> {
  const entry = builders.get(id);
  if (!entry) {
    return { ok: false, error: "step-frames session not found or expired" };
  }
  const validationError = await validatePayload(entry.frame_type, payload);
  if (validationError) {
    return { ok: false, error: validationError };
  }
  entry.frames.push({ payload, ...(label !== undefined ? { label } : {}) });
  // Reset TTL.
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => expireBuilder(id), TTL_MS);
  return { ok: true, frame_count: entry.frames.length };
}

export type CommitResult =
  | { ok: true; entry: BuilderEntry }
  | { ok: false; error: string };

/**
 * Commit the builder entry — returns the assembled entry for the caller to
 * render. Deletes the entry from the map.
 */
export function commitBuilder(id: string): CommitResult {
  const entry = builders.get(id);
  if (!entry) {
    return { ok: false, error: "step-frames session not found or expired" };
  }
  if (entry.frames.length === 0) {
    return { ok: false, error: "cannot commit empty step-frames sequence" };
  }
  clearTimeout(entry.timer);
  builders.delete(id);
  return { ok: true, entry };
}

/** Silently delete an expired builder entry (called by TTL timer). */
export function expireBuilder(id: string): void {
  const entry = builders.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    builders.delete(id);
  }
}

/** Return the size of the builder map — for testing only. */
export function builderCount(): number {
  return builders.size;
}

/** Clear all entries — for testing only. */
export function resetBuilders(): void {
  for (const entry of builders.values()) {
    clearTimeout(entry.timer);
  }
  builders.clear();
}
