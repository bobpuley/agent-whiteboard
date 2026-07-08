// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { homedir } from "os";
import { join, resolve, sep } from "path";
import { existsSync, readFileSync, readdirSync, rmSync, unlinkSync } from "fs";
import { Hono } from "hono";
import { signalClick, signalDone, waitForClick, waitForDone } from "./events.js";
import type { ClickEvent } from "./events.js";
import { clearCanvas, exportCanvas, getCanvas, getLastWorkspace, seekStepFrame, setCanvas, setLastWorkspace, setStepFrames, stepCursor } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";
import { broadcast, broadcastReplace, broadcastStepFrames } from "./ws.js";
import { FRAME_TYPES, hasMermaidKeyword, isValidWorkspaceName, KNOWN_TYPES, validatePayload } from "./validate.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import type { Slide } from "./slideshow.js";
import { findSnapshotById, findSnapshotByIdInWorkspace, listAllSnapshots, listSnapshots, loadSnapshotContent } from "./snapshot-reader.js";
import {
  appendFrameAndBroadcast,
  commitRenderResult,
  commitStepFramesResult,
  initStepFramesResult,
  validateWorkspaceInput,
} from "./render-core.js";
import { generateExportHtml } from "./export-html.js";
import type { ValidatedExportItem } from "./export-html.js";
import { deleteViewports, getViewport, setViewport } from "./viewport-cache.js";
import type { Viewport } from "./viewport-cache.js";

// Re-export for tests that reference MERMAID_KEYWORDS / isValidMermaid directly.
export { MERMAID_KEYWORDS } from "./validate.js";
export function isValidMermaid(payload: string): boolean {
  return hasMermaidKeyword(payload);
}

function isNodeActionsValid(v: unknown): v is Record<string, string[]> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as object).every(
    (arr) => Array.isArray(arr) && (arr as unknown[]).every((s) => typeof s === "string")
  );
}

/** Best-effort read of a snapshot file's `id` field, for viewport-cache cleanup on delete. */
function readSnapshotIdSafe(fullPath: string): string | undefined {
  try {
    const raw = readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

// Defense-in-depth only (see M3 in docs/02_assumptions-and-risks.md) — SVG/HTML
// payloads are already sanitized client-side via DOMPurify before render, and
// server-side for HTML exports. 'unsafe-inline' on script/style is required
// because the self-contained HTML export embeds the full mermaid.js bundle
// and generated CSS inline (F17 in docs/03) — a nonce/hash scheme would be
// more restrictive but isn't worth the complexity for a backstop control.
const CSP_HEADER =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; " +
  "frame-ancestors 'none'";

export function createApp(): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("Content-Security-Policy", CSP_HEADER);
  });

  app.post("/render", async (c) => {
    const body = await c.req.json<{ type?: string; payload?: string; options?: { title?: string; node_to_frame?: Record<string, number>; workspace?: string } }>();

    const workspaceResult = validateWorkspaceInput(body.options?.workspace);
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;

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

    const validationError = await validatePayload(type, payload);
    if (validationError) {
      return c.json({ ok: false, error: validationError });
    }

    const result = commitRenderResult(type, payload, workspace, title, nodeToFrame);
    return c.json(result);
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
      // Same id as when this sequence was created — tells the browser this is
      // a continuation, not a new diagram, so it must not re-fit (F19/C3).
      broadcastStepFrames(state.frames, state.frameType, result.currentFrame, state.title, state.id);
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
    broadcastReplace({
      type: frame.type ?? state.frameType,
      payload: frame.payload,
      frameLabel: frame.label,
      stepFrames: true,
      currentFrame: body.frame,
      totalFrames: total,
      title: state.title,
      nodeToFrame: state.nodeToFrame,
      id: state.id,
    });
    return c.json({ ok: true, current_frame: body.frame, total_frames: total });
  });

  app.post("/clear", (c) => {
    cancelSlideshow({ persist: false }); // clear() must never produce a snapshot (F10)
    clearCanvas();
    broadcast({ action: "clear" });
    return c.json({ ok: true });
  });

  // ── Slideshow (Phase 2 — Sprint 9) ───────────────────────────────────────────

  app.post("/slideshow", async (c) => {
    const body = await c.req.json<{ slides?: unknown; delay_ms?: unknown; workspace?: unknown }>();

    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      return c.json({ ok: false, error: "slides must be a non-empty array" }, 400);
    }
    if (typeof body.delay_ms !== "number" || body.delay_ms <= 0) {
      return c.json({ ok: false, error: "delay_ms must be a positive number" }, 400);
    }
    const workspaceResult = validateWorkspaceInput(body.workspace);
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;

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

    startSlideshow(validatedSlides, body.delay_ms, workspace);
    return c.json({ ok: true });
  });

  app.post("/slideshow/stop", (c) => {
    cancelSlideshow();
    return c.json({ ok: true });
  });

  // ── Incremental step-frames builder (v0.8) ───────────────────────────────────

  app.post("/step-frames/init", async (c) => {
    const body = await c.req.json<{ frame_type?: unknown; workspace?: unknown; title?: unknown }>();

    if (typeof body.frame_type !== "string" || !(FRAME_TYPES as readonly string[]).includes(body.frame_type)) {
      return c.json({
        ok: false,
        error: `frame_type must be one of: ${FRAME_TYPES.join(", ")}`,
      }, 400);
    }
    const workspaceResult = validateWorkspaceInput(body.workspace);
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;
    const title = typeof body.title === "string" ? body.title : undefined;
    const { id } = initStepFramesResult(body.frame_type, workspace, title);
    return c.json({ ok: true, id });
  });

  app.post("/step-frames/:id/frame", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ payload?: unknown; label?: unknown; type?: unknown }>();

    if (typeof body.payload !== "string") {
      return c.json({ ok: false, error: "payload must be a string" }, 400);
    }
    const label = typeof body.label === "string" ? body.label : undefined;
    const type = typeof body.type === "string" ? body.type : undefined;
    const result = await appendFrameAndBroadcast(id, body.payload, label, type);
    if (!result.ok) {
      return c.json(result, result.error.includes("not found or expired") ? 404 : 400);
    }
    return c.json({ ok: true, frame_count: result.frame_count });
  });

  app.post("/step-frames/:id/commit", (c) => {
    const id = c.req.param("id");
    const result = commitStepFramesResult(id);
    if (!result.ok) {
      return c.json(result, result.error.includes("not found or expired") ? 404 : 400);
    }
    return c.json(result);
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
    const id = c.req.query("id");
    if (id !== undefined && id !== "") {
      const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
      const payload = findSnapshotById(id, root);
      if (payload === null) {
        return c.json({ ok: false, error: "graph not found" }, 404);
      }
      return c.json({ ok: true, data: payload });
    }
    return c.json({ ok: true, data: exportCanvas() });
  });

  // ── History navigator (v0.4 — Sprint 17) ──────────────────────────────────────

  app.get("/snapshots", (c) => {
    const queryWorkspace = c.req.query("workspace");
    let workspace: string;
    if (queryWorkspace !== undefined) {
      if (queryWorkspace.length === 0) {
        return c.json({ ok: false, error: "workspace must be a non-empty string" }, 400);
      }
      if (!isValidWorkspaceName(queryWorkspace)) {
        return c.json({ ok: false, error: "invalid workspace: path traversal not allowed" }, 400);
      }
      workspace = queryWorkspace;
    } else {
      workspace = getLastWorkspace();
    }
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
    const snapshots = listSnapshots(workspace, root);
    return c.json({ ok: true, snapshots });
  });

  // ── Sprint 18 — GET /snapshots/all (v0.5) ────────────────────────────────────

  app.get("/snapshots/all", (c) => {
    const workspace = getLastWorkspace();
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

    const currentWorkspace = getLastWorkspace();
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");

    // Optional workspace override (v0.5 cross-workspace load).
    let workspace: string;
    if (body.workspace !== undefined) {
      if (typeof body.workspace !== "string" || body.workspace.length === 0) {
        return c.json({ ok: false, error: "workspace must be a non-empty string" }, 400);
      }
      const ws = body.workspace;
      if (!isValidWorkspaceName(ws)) {
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

    let snapshot: { id?: unknown; type?: unknown; payload?: unknown; options?: { title?: string; node_to_frame?: Record<string, number> } };
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
    // Pre-v0.11 snapshots may lack an id (J1, `02`) — not addressable by the
    // viewport cache; the browser falls back to treating it as unseen (auto-fit).
    const snapshotId = typeof snapshot.id === "string" ? snapshot.id : undefined;
    const viewport = snapshotId !== undefined ? getViewport(snapshotId) : undefined;

    const validationError = await validatePayload(type, payload);
    if (validationError) {
      return c.json({ ok: false, error: validationError });
    }

    // Broadcast to browser and update in-memory state — write-silent (no saveSnapshot).
    const title = options?.title;
    const nodeToFrame = options?.node_to_frame;

    if (type === "step-frames") {
      const spec = JSON.parse(payload) as { frame_type: string; frames: StepFrame[] };
      setStepFrames(spec.frames, spec.frame_type, payload, title, nodeToFrame, snapshotId);
      broadcastReplace({
        type: spec.frames[0].type ?? spec.frame_type,
        payload: spec.frames[0].payload,
        frameLabel: spec.frames[0].label,
        stepFrames: true,
        currentFrame: 0,
        totalFrames: spec.frames.length,
        title,
        nodeToFrame,
        id: snapshotId,
        viewport,
      });
    } else {
      setCanvas(type as CanvasType, payload, title, snapshotId);
      broadcastReplace({ type, payload, title, id: snapshotId, viewport });
    }

    setLastWorkspace(workspace);
    return c.json({ ok: true });
  });

  // ── Mermaid viewport persistence (v0.19, F19/C3) ────────────────────────────

  app.post("/viewport", async (c) => {
    const body = await c.req.json<{ id?: unknown; scale?: unknown; positionX?: unknown; positionY?: unknown }>();
    if (typeof body.id !== "string" || body.id.length === 0) {
      return c.json({ ok: false, error: "id must be a non-empty string" }, 400);
    }
    const { scale, positionX, positionY } = body;
    if (typeof scale !== "number" || !Number.isFinite(scale)) {
      return c.json({ ok: false, error: "scale must be a finite number" }, 400);
    }
    if (typeof positionX !== "number" || !Number.isFinite(positionX)) {
      return c.json({ ok: false, error: "positionX must be a finite number" }, 400);
    }
    if (typeof positionY !== "number" || !Number.isFinite(positionY)) {
      return c.json({ ok: false, error: "positionY must be a finite number" }, 400);
    }
    const viewport: Viewport = { scale, positionX, positionY };
    setViewport(body.id, viewport);
    return c.json({ ok: true });
  });

  // ── Snapshot delete endpoints (v0.12) ─────────────────────────────────────

  function resolveSnapshotRoot(): string {
    return process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
  }

  function validateWorkspaceForDelete(workspace: unknown, root: string): { workspace: string } | { error: string; status: number } {
    if (typeof workspace !== "string" || workspace.length === 0) {
      return { error: "workspace must be a non-empty string", status: 400 };
    }
    if (!isValidWorkspaceName(workspace)) {
      return { error: "invalid workspace: path traversal not allowed", status: 400 };
    }
    const dir = join(root, workspace);
    // Belt-and-suspenders containment check: reject anything that resolves
    // outside (or exactly onto) the snapshots root — e.g. workspace ".".
    if (!resolve(dir).startsWith(resolve(root) + sep)) {
      return { error: "invalid workspace: path traversal not allowed", status: 400 };
    }
    if (!existsSync(dir)) {
      return { error: "workspace not found", status: 404 };
    }
    return { workspace };
  }

  app.post("/snapshots/delete-files", async (c) => {
    const body = await c.req.json<{ workspace?: unknown; filenames?: unknown }>();
    const root = resolveSnapshotRoot();
    const validated = validateWorkspaceForDelete(body.workspace, root);
    if ("error" in validated) {
      return c.json({ ok: false, error: validated.error }, validated.status as 400 | 404);
    }
    const { workspace } = validated;

    if (!Array.isArray(body.filenames) || body.filenames.length === 0) {
      return c.json({ ok: false, error: "filenames must be a non-empty array" }, 400);
    }
    const filenames = body.filenames as unknown[];
    for (const f of filenames) {
      if (typeof f !== "string") {
        return c.json({ ok: false, error: "each filename must be a string" }, 400);
      }
      if (!/^[^/]+_screen\.json$/.test(f) || f.includes("..")) {
        return c.json({ ok: false, error: `invalid filename: ${f}` }, 400);
      }
    }

    const workspaceDir = join(root, workspace);
    let deleted = 0;
    const deletedIds: string[] = [];
    for (const f of filenames as string[]) {
      const fullPath = join(workspaceDir, f);
      const id = readSnapshotIdSafe(fullPath);
      try {
        unlinkSync(fullPath);
        deleted++;
        if (id !== undefined) deletedIds.push(id);
      } catch {
        // Missing files are silently skipped.
      }
    }
    // Clean up any viewport-cache entries so deleted snapshots don't leave
    // orphaned rows behind (C3, `02`).
    deleteViewports(deletedIds);
    return c.json({ ok: true, deleted });
  });

  app.post("/snapshots/delete-workspace", async (c) => {
    const body = await c.req.json<{ workspace?: unknown }>();
    const root = resolveSnapshotRoot();
    const validated = validateWorkspaceForDelete(body.workspace, root);
    if ("error" in validated) {
      return c.json({ ok: false, error: validated.error }, validated.status as 400 | 404);
    }
    const { workspace } = validated;

    const workspaceDir = join(root, workspace);
    let idsToClean: string[] = [];
    try {
      idsToClean = readdirSync(workspaceDir)
        .filter((f) => f.endsWith("_screen.json"))
        .map((f) => readSnapshotIdSafe(join(workspaceDir, f)))
        .filter((id): id is string => id !== undefined);
    } catch {
      // Workspace directory unreadable/absent — nothing to clean up.
    }

    rmSync(workspaceDir, { recursive: true, force: true });
    if (getLastWorkspace() === workspace) {
      setLastWorkspace("");
    }
    // Clean up viewport-cache entries for every snapshot that lived in this
    // workspace (C3, `02`).
    deleteViewports(idsToClean);
    return c.json({ ok: true });
  });

  // ── HTML Export (v0.13) ────────────────────────────────────────────────────

  app.post("/export-html", async (c) => {
    const body = await c.req.json<{ items?: unknown }>();
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ ok: false, error: "items must be a non-empty array" }, 400);
    }

    const root = resolveSnapshotRoot();
    const validItems: ValidatedExportItem[] = [];

    for (const item of body.items as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const { workspace, filename, id } = item as Record<string, unknown>;

      if (typeof workspace !== "string") continue;
      if (!isValidWorkspaceName(workspace)) continue;

      if (typeof filename === "string") {
        if (!/^[^/]+_screen\.json$/.test(filename) || filename.includes("..")) continue;

        const raw = loadSnapshotContent(workspace, root, filename);
        if (raw === null) continue;

        let record: { type?: unknown; payload?: unknown; timestamp?: unknown; options?: { title?: string } };
        try {
          record = JSON.parse(raw) as typeof record;
        } catch {
          continue;
        }

        if (typeof record.type !== "string" || typeof record.payload !== "string" || typeof record.timestamp !== "string") continue;

        validItems.push({
          workspace,
          filename,
          record: {
            type: record.type,
            payload: record.payload,
            timestamp: record.timestamp,
            options: record.options,
          },
        });
      } else if (typeof id === "string") {
        const record = findSnapshotByIdInWorkspace(workspace, id, root);
        if (record === null) continue;

        validItems.push({ workspace, id, record });
      }
    }

    if (validItems.length === 0) {
      return c.json({ ok: false, error: "no valid items to export" }, 400);
    }

    const { html, downloadFilename } = await generateExportHtml(validItems);

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      },
    });
  });

  return app;
}
