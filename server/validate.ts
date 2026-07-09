// Server-side payload validation helpers.

import mermaid from "mermaid";
import { z } from "zod";
import type { Frame } from "./presentation.js";

/**
 * Shared shape schemas for `node_actions` (wait_click) and `node_to_frame`
 * (commit_step_frames) — the single implementation both MCP's zod
 * inputSchema and REST's request-body validation parse against (F7/NF24),
 * replacing REST's previously hand-written type guards.
 */
export const nodeActionsSchema = z.record(z.string(), z.array(z.string()));
export const nodeToFrameSchema = z.record(z.string(), z.number());

// Initialise once — no DOM side effects in parse-only mode.
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

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
 * Validates a snapshot filename for path safety (NF28, v0.28 Sprint 61):
 * must end with `_screen.json` and contain no `/` or `..`. The one
 * implementation shared by POST /snapshots/load and
 * snapshot-writer.ts's delete-files logic — previously copy-pasted in both.
 */
export function isValidSnapshotFilename(filename: string): boolean {
  return /^[^/]+_screen\.json$/.test(filename) && !filename.includes("..");
}

export type WorkspaceValidation =
  | { ok: true; workspace: string }
  | { ok: false; error: string };

/**
 * Validates the `workspace` field required by render(), init_step_frames(),
 * list_snapshots(), and export_html() — same rule and error text everywhere
 * (F14/F15/F18 in docs/03). Lives here (not render-core.ts) so both
 * render-core.ts and snapshot-writer.ts can depend on it without a cycle
 * (NF26, v0.28 Sprint 59) — render-core.ts re-exports it for its existing
 * callers (app.ts, mcp.ts).
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

/** Content types a single Frame can carry — the only content types anywhere in the MCP payload contract (v0.26 Sprint 45; "step-frames" no longer exists as a top-level type). */
export const FRAME_TYPES = ["mermaid", "svg", "html", "katex", "vega-lite"] as const;

export type FrameType = typeof FRAME_TYPES[number];

/**
 * Validate one Frame — the single atomic-content validator (U2, v0.26).
 * Every command path that accepts frame content (render(), each slide of
 * slideshow(), the incremental append_frame() builder) funnels each frame
 * through this same function; there is no second implementation.
 * Returns null on success; an error string on failure. Async because Mermaid
 * parse is async.
 */
export async function validateFrame(frame: Pick<Frame, "type" | "payload">): Promise<string | null> {
  const { type, payload } = frame;
  if (!(FRAME_TYPES as readonly string[]).includes(type)) {
    return `type must be one of: ${FRAME_TYPES.join(", ")}`;
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
  }
  return null;
}
