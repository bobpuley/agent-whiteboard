// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { homedir } from "os";
import { basename, join } from "path";
import { Hono } from "hono";
import { signalClick, signalDone, waitForClick, waitForDone } from "./events.js";
import type { ClickEvent } from "./events.js";
import { clearCanvas, exportCanvas, getCanvas, seekStepFrame, setCanvas, setStepFrames, stepCursor } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";
import { broadcast } from "./ws.js";
import { hasMermaidKeyword, isValidWorkspaceName, parseMermaid } from "./validate.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import type { Slide } from "./slideshow.js";
import { saveSnapshot } from "./snapshot.js";
import { listAllSnapshots, listSnapshots, loadSnapshotContent } from "./snapshot-reader.js";

// Re-export for tests that reference MERMAID_KEYWORDS / isValidMermaid directly.
export { MERMAID_KEYWORDS } from "./validate.js";
export function isValidMermaid(payload: string): boolean {
  return hasMermaidKeyword(payload);
}

const KNOWN_TYPES: readonly (CanvasType | "step-frames")[] = [
  "mermaid", "svg", "html", "katex", "vega-lite", "step-frames",
];

/**
 * Validate a single slide/render payload.
 * Returns null on success; returns an error string on failure.
 * Async because Mermaid parse is async.
 */
async function validatePayload(type: string, payload: string): Promise<string | null> {
  if (!KNOWN_TYPES.includes(type as CanvasType)) {
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
  }
  return null;
}

function isNodeActionsValid(v: unknown): v is Record<string, string[]> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as object).every(
    (arr) => Array.isArray(arr) && (arr as unknown[]).every((s) => typeof s === "string")
  );
}

export function createApp(): Hono {
  const app = new Hono();

  app.post("/render", async (c) => {
    const body = await c.req.json<{ type?: string; payload?: string; options?: { title?: string; node_to_frame?: Record<string, number>; workspace?: string } }>();

    if (typeof body.payload !== "string") {
      return c.json({ ok: false, error: "payload must be a string" }, 400);
    }

    if (!KNOWN_TYPES.includes(body.type as CanvasType)) {
      return c.json(
        { ok: false, error: `type must be one of: ${KNOWN_TYPES.join(", ")}` },
        400
      );
    }

    const type = body.type as CanvasType | "step-frames";
    const { payload } = body;
    const title = body.options?.title;
    const nodeToFrame = body.options?.node_to_frame;
    const workspaceOverride = body.options?.workspace;

    if (workspaceOverride !== undefined && !isValidWorkspaceName(workspaceOverride)) {
      return c.json({
        ok: false,
        error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
      }, 400);
    }

    const validationError = await validatePayload(type, payload);
    if (validationError) {
      return c.json({ ok: false, error: validationError });
    }

    // Cancel any running slideshow — render takes canvas ownership.
    cancelSlideshow();

    if (type === "step-frames") {
      const spec = JSON.parse(payload) as { frame_type: string; frames: StepFrame[] };
      const frames = spec.frames;
      setStepFrames(frames, spec.frame_type, payload, title, nodeToFrame);
      broadcast({
        action: "replace",
        type: spec.frame_type,
        payload: frames[0].payload,
        frameLabel: frames[0].label,
        stepFrames: true,
        currentFrame: 0,
        totalFrames: frames.length,
        ...(title !== undefined ? { title } : {}),
        ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
      });
      try { saveSnapshot("step-frames", payload, { title, node_to_frame: nodeToFrame, workspace: workspaceOverride }); } catch { /* non-fatal */ }
      return c.json({ ok: true });
    }

    // svg, html, katex, mermaid, vega-lite
    setCanvas(type as CanvasType, payload, title);
    broadcast({ action: "replace", type, payload, ...(title !== undefined ? { title } : {}) });
    try { saveSnapshot(type, payload, { title, workspace: workspaceOverride }); } catch { /* non-fatal */ }
    return c.json({ ok: true });
  });

  app.post("/step", async (c) => {
    const body = await c.req.json<{ direction?: string }>();
    if (body.direction !== "next" && body.direction !== "prev") {
      return c.json(
        { ok: false, error: 'direction must be "next" or "prev"' },
        400
      );
    }
    const result = stepCursor(body.direction);
    if (!result) {
      return c.json({
        ok: false,
        error: "no step-frames sequence is loaded",
      });
    }
    // Push new frame to browser.
    const state = getCanvas();
    if (state.type === "step-frames") {
      const frame = state.frames[result.currentFrame];
      broadcast({
        action: "replace",
        type: state.frameType,
        payload: frame.payload,
        frameLabel: frame.label,
        stepFrames: true,
        currentFrame: result.currentFrame,
        totalFrames: result.totalFrames,
        ...(state.title !== undefined ? { title: state.title } : {}),
      });
    }
    return c.json({ ok: true, current_frame: result.currentFrame, total_frames: result.totalFrames });
  });

  app.post("/seek", async (c) => {
    const body = await c.req.json<{ frame?: unknown }>();
    if (typeof body.frame !== "number" || !Number.isInteger(body.frame)) {
      return c.json({ ok: false, error: "frame must be an integer" }, 400);
    }
    const state = getCanvas();
    if (state.type !== "step-frames") {
      return c.json({ ok: false, error: "no step-frames sequence is loaded" });
    }
    const total = state.frames.length;
    if (body.frame < 0 || body.frame >= total) {
      return c.json({ ok: false, error: `frame out of range: must be 0–${total - 1}` });
    }
    seekStepFrame(body.frame);
    const frame = state.frames[body.frame];
    broadcast({
      action: "replace",
      type: state.frameType,
      payload: frame.payload,
      frameLabel: frame.label,
      stepFrames: true,
      currentFrame: body.frame,
      totalFrames: total,
      ...(state.title !== undefined ? { title: state.title } : {}),
      ...(state.nodeToFrame !== undefined ? { nodeToFrame: state.nodeToFrame } : {}),
    });
    return c.json({ ok: true, current_frame: body.frame, total_frames: total });
  });

  app.post("/clear", (c) => {
    cancelSlideshow();
    clearCanvas();
    broadcast({ action: "clear" });
    return c.json({ ok: true });
  });

  // ── Slideshow (Phase 2 — Sprint 9) ───────────────────────────────────────────

  app.post("/slideshow", async (c) => {
    const body = await c.req.json<{ slides?: unknown; delay_ms?: unknown }>();

    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      return c.json({ ok: false, error: "slides must be a non-empty array" }, 400);
    }
    if (typeof body.delay_ms !== "number" || body.delay_ms <= 0) {
      return c.json({ ok: false, error: "delay_ms must be a positive number" }, 400);
    }

    const rawSlides = body.slides as { type?: unknown; payload?: unknown; title?: unknown }[];

    // Validate each slide — same rules as POST /render.
    const validatedSlides: Slide[] = [];
    for (let i = 0; i < rawSlides.length; i++) {
      const s = rawSlides[i];
      if (typeof s.type !== "string" || typeof s.payload !== "string") {
        return c.json({
          ok: false,
          error: `slide[${i}]: "type" and "payload" must be strings`,
        }, 400);
      }
      if (s.title !== undefined && typeof s.title !== "string") {
        return c.json({ ok: false, error: `slide[${i}]: "title" must be a string` }, 400);
      }
      const err = await validatePayload(s.type, s.payload);
      if (err) {
        return c.json({ ok: false, error: `slide[${i}]: ${err}` });
      }
      validatedSlides.push({
        type: s.type,
        payload: s.payload,
        ...(s.title !== undefined ? { title: s.title as string } : {}),
      });
    }

    startSlideshow(validatedSlides, body.delay_ms);
    return c.json({ ok: true });
  });

  app.post("/slideshow/stop", (c) => {
    cancelSlideshow();
    return c.json({ ok: true });
  });

  // ── User events — bidirectionality (Sprint 10 experiment) ───────────────────

  app.post("/user-done", async (c) => {
    signalDone(); // wake any pending wait_done() MCP tool calls
    // Also forward to channel relay if Claude Code was started with the channels flag.
    const channelPort = Number(process.env.CHANNEL_PORT ?? 3001);
    try {
      await fetch(`http://127.0.0.1:${channelPort}/user-done`, { method: "POST" });
    } catch {
      // Channel server not running — ignore.
    }
    return c.json({ ok: true });
  });

  app.post("/wait-done", async (c) => {
    await waitForDone();
    return c.json({ ok: true });
  });

  // ── Node / edge click events (Phase 2 — Sprint 12) ───────────────────────────

  app.post("/node-click", async (c) => {
    const body = await c.req.json<{ type?: string; id?: string; label?: string; action?: string }>();
    if (body.type !== "node" && body.type !== "edge") {
      return c.json({ ok: false, error: 'type must be "node" or "edge"' }, 400);
    }
    const event: ClickEvent = {
      type: body.type,
      id: body.id ?? "",
      label: body.label ?? "",
      action: body.action ?? null,
    };
    signalClick(event); // no-op if no wait_click() is pending
    return c.json({ ok: true });
  });

  app.post("/wait-click", async (c) => {
    let nodeActions: Record<string, string[]> = {};
    try {
      const body = await c.req.json<{ node_actions?: unknown }>();
      if (body.node_actions !== undefined) {
        if (!isNodeActionsValid(body.node_actions)) {
          return c.json(
            { ok: false, error: "node_actions must be a map of node ID → string[]" },
            400
          );
        }
        nodeActions = body.node_actions as Record<string, string[]>;
      }
    } catch {
      // No body or non-JSON body — treat as plain click (node_actions stays {}).
    }
    broadcast({ action: "set_node_actions", node_actions: nodeActions, enabled: true });
    const event = await waitForClick();
    broadcast({ action: "set_node_actions", enabled: false });
    return c.json({ ok: true, ...event });
  });

  app.get("/export", (c) => {
    return c.json({ ok: true, data: exportCanvas() });
  });

  // ── History navigator (v0.4 — Sprint 17) ──────────────────────────────────────

  app.get("/snapshots", (c) => {
    const workspace = process.env.WHITEBOARD_WORKSPACE ?? basename(process.cwd());
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
    const snapshots = listSnapshots(workspace, root);
    return c.json({ ok: true, snapshots });
  });

  // ── Sprint 18 — GET /snapshots/all (v0.5) ────────────────────────────────────

  app.get("/snapshots/all", (c) => {
    const workspace = process.env.WHITEBOARD_WORKSPACE ?? basename(process.cwd());
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
    const workspaces = listAllSnapshots(root, workspace);
    return c.json({ ok: true, workspaces });
  });

  app.post("/snapshots/load", async (c) => {
    const body = await c.req.json<{ filename?: unknown; workspace?: unknown }>();
    const filename = body.filename;

    if (typeof filename !== "string") {
      return c.json({ ok: false, error: "filename must be a string" }, 400);
    }

    // Path safety: filename must end with _screen.json and contain no / or ..
    if (!/^[^/]+_screen\.json$/.test(filename) || filename.includes("..")) {
      return c.json({ ok: false, error: "invalid filename: path traversal not allowed" });
    }

    const currentWorkspace = process.env.WHITEBOARD_WORKSPACE ?? basename(process.cwd());
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");

    // Optional workspace override (v0.5 cross-workspace load).
    let workspace: string;
    if (body.workspace !== undefined) {
      if (typeof body.workspace !== "string" || body.workspace.length === 0) {
        return c.json({ ok: false, error: "workspace must be a non-empty string" }, 400);
      }
      const ws = body.workspace;
      // Safety: no path separators, no null bytes, not bare ".."
      if (ws.includes("/") || ws.includes("\\") || ws.includes("\0") || ws === "..") {
        return c.json({ ok: false, error: "invalid workspace: path traversal not allowed" });
      }
      workspace = ws;
    } else {
      workspace = currentWorkspace;
    }

    const raw = loadSnapshotContent(workspace, root, filename);
    if (raw === null) {
      return c.json({ ok: false, error: `snapshot not found: ${filename}` });
    }

    let snapshot: { type?: unknown; payload?: unknown; options?: { title?: string; node_to_frame?: Record<string, number> } };
    try {
      snapshot = JSON.parse(raw) as typeof snapshot;
    } catch {
      return c.json({ ok: false, error: "snapshot file is malformed JSON" });
    }

    if (typeof snapshot.type !== "string" || typeof snapshot.payload !== "string") {
      return c.json({ ok: false, error: "snapshot file is missing required fields" });
    }

    const type = snapshot.type;
    const payload = snapshot.payload;
    const options = snapshot.options;

    const validationError = await validatePayload(type, payload);
    if (validationError) {
      return c.json({ ok: false, error: validationError });
    }

    // Broadcast to browser and update in-memory state — write-silent (no saveSnapshot).
    const title = options?.title;
    const nodeToFrame = options?.node_to_frame;

    if (type === "step-frames") {
      const spec = JSON.parse(payload) as { frame_type: string; frames: StepFrame[] };
      setStepFrames(spec.frames, spec.frame_type, payload, title, nodeToFrame);
      broadcast({
        action: "replace",
        type: spec.frame_type,
        payload: spec.frames[0].payload,
        frameLabel: spec.frames[0].label,
        stepFrames: true,
        currentFrame: 0,
        totalFrames: spec.frames.length,
        ...(title !== undefined ? { title } : {}),
        ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
      });
    } else {
      setCanvas(type as CanvasType, payload, title);
      broadcast({ action: "replace", type, payload, ...(title !== undefined ? { title } : {}) });
    }

    return c.json({ ok: true });
  });

  return app;
}
