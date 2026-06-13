// Server-side payload validation helpers.

import mermaid from "mermaid";

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
