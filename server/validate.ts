// Server-side payload validation helpers.

import mermaid from "mermaid";
import type { StepFrame } from "./session.js";

// Initialise once — no DOM side effects in parse-only mode.
mermaid.initialize({ startOnLoad: false });

/**
 * Layer 1: fast prefix check.
 * Returns false if the payload does not begin with a known Mermaid keyword.
 */
export const MERMAID_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
] as const;

export function hasMermaidKeyword(payload: string): boolean {
  const first = payload.trimStart().split(/\s/)[0];
  return (MERMAID_KEYWORDS as readonly string[]).includes(first);
}

/**
 * Layer 2: full parse via Mermaid.js.
 * Throws with a human-readable message if the syntax is invalid.
 *
 * Some diagram types (classDiagram, gantt, pie, mindmap) call DOMPurify
 * internally, which requires a DOM context unavailable in Node.js.
 * Those errors are swallowed — the keyword-prefix check (Layer 1) remains
 * the safety net for those types. Genuine parse errors are always re-thrown.
 */
export async function parseMermaid(payload: string): Promise<void> {
  try {
    await mermaid.parse(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish Node.js environment limitations (DOMPurify, DOM APIs missing)
    // from genuine Mermaid syntax parse errors.
    if (isNodeEnvLimitation(msg)) return; // can't validate in Node — skip
    throw err; // real parse error — bubble up to caller
  }
}

/**
 * Validates a workspace name for snapshot routing.
 * Accepts alphanumeric characters, dashes, underscores, dots, and spaces.
 * Rejects path separators, null bytes, and the bare ".." sequence.
 */
export function isValidWorkspaceName(name: string): boolean {
  if (!name || name === "..") return false;
  return /^[a-zA-Z0-9_\-. ]+$/.test(name);
}

/**
 * Returns true if the error originates from a missing DOM API in Node.js,
 * not from invalid Mermaid syntax.
 */
function isNodeEnvLimitation(msg: string): boolean {
  return (
    msg.includes("DOMPurify") ||
    msg.includes("is not a function") ||
    msg.includes("document is not defined") ||
    msg.includes("window is not defined")
  );
}

export const KNOWN_TYPES = [
  "mermaid", "svg", "html", "katex", "vega-lite", "step-frames",
] as const;

export type KnownType = typeof KNOWN_TYPES[number];

/**
 * Validate a single render payload.
 * Returns null on success; returns an error string on failure.
 * Async because Mermaid parse is async.
 */
export async function validatePayload(type: string, payload: string): Promise<string | null> {
  if (!(KNOWN_TYPES as readonly string[]).includes(type)) {
    return `type must be one of: ${KNOWN_TYPES.join(", ")}`;
  }
  if (type === "mermaid") {
    if (!hasMermaidKeyword(payload)) {
      return (
        "invalid payload: mermaid source must begin with a diagram keyword " +
        "(e.g. 'graph TD', 'sequenceDiagram', 'classDiagram', ...)"
      );
    }
    try {
      await parseMermaid(payload);
    } catch (err) {
      return `invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (type === "vega-lite") {
    try {
      JSON.parse(payload);
    } catch {
      return "invalid payload: vega-lite payload must be valid JSON";
    }
  } else if (type === "step-frames") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return "invalid payload: step-frames payload must be valid JSON";
    }
    const spec = parsed as { frame_type?: string; frames?: unknown[] };
    if (
      typeof spec.frame_type !== "string" ||
      !Array.isArray(spec.frames) ||
      spec.frames.length === 0
    ) {
      return 'invalid payload: step-frames must have "frame_type" (string) and "frames" (non-empty array)';
    }
    const frames = spec.frames as StepFrame[];
    if (frames.some((f) => typeof f.payload !== "string")) {
      return 'invalid payload: each frame must have a "payload" string';
    }
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const frameError = await validatePayload(frame.type ?? spec.frame_type, frame.payload);
      if (frameError) {
        return `frame[${i}]: ${frameError}`;
      }
    }
  }
  return null;
}
