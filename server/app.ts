// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { Hono } from "hono";
import { signalClick, signalDone, waitForClick, waitForDone } from "./interaction.js";
import type { ClickEvent } from "./interaction.js";
import { clearCanvas, exportCanvas, getLastWorkspace, setLastWorkspace } from "./session.js";
import type { CanvasType } from "./session.js";
import { broadcast } from "./ws.js";
import { FRAME_TYPES, hasMermaidKeyword, isValidSnapshotFilename, nodeActionsSchema, nodeToFrameSchema, validateFrame } from "./validate.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import type { Slide } from "./slideshow.js";
import { findSnapshotById, findSnapshotByIdInWorkspace, isFrameArray, listAllSnapshots, listSnapshots, loadSnapshotContent } from "./snapshot-reader.js";
import { deleteSnapshotFiles, deleteWorkspace, validateWorkspaceForDelete } from "./snapshot-writer.js";
import {
  applyLoadedSnapshotResult,
  appendFrameAndBroadcast,
  commitRenderResult,
  commitStepFramesResult,
  initStepFramesResult,
  seekAndBroadcast,
  stepAndBroadcast,
  validateWorkspaceInput,
} from "./render-core.js";
import { generateExportHtml } from "./export-html.js";
import type { ExportMode, ValidatedExportItem } from "./export-html.js";
import { setViewport } from "./viewport-cache.js";
import type { Viewport } from "./viewport-cache.js";
import { getSnapshotsRoot } from "./paths.js";

// Re-export for tests that reference MERMAID_KEYWORDS / isValidMermaid directly.
export { MERMAID_KEYWORDS } from "./validate.js";
export function isValidMermaid(payload: string): boolean {
  return hasMermaidKeyword(payload);
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
    const body = await c.req.json<{ type?: string; payload?: string; options?: { title?: string; workspace?: string } }>();

    const workspaceResult = validateWorkspaceInput(body.options?.workspace);
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;

    if (typeof body.payload !== "string") {
      return c.json({ ok: false, error: "payload must be a string" }, 400);
    }

    if (!(FRAME_TYPES as readonly string[]).includes(body.type as string)) {
      return c.json(
        { ok: false, error: `type must be one of: ${FRAME_TYPES.join(", ")}` },
        400
      );
    }

    const type = body.type as CanvasType;
    const { payload } = body;
    const title = body.options?.title;

    const validationError = await validateFrame({ type, payload });
    if (validationError) {
      return c.json({ ok: false, error: validationError });
    }

    const result = commitRenderResult(type, payload, workspace, title);
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
    return c.json(stepAndBroadcast(body.direction));
  });

  app.post("/seek", async (c) => {
    const body = await c.req.json<{ frame?: unknown }>();
    if (typeof body.frame !== "number" || !Number.isInteger(body.frame)) {
      return c.json({ ok: false, error: "frame must be an integer" }, 400);
    }
    return c.json(seekAndBroadcast(body.frame));
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
      if (!(FRAME_TYPES as readonly string[]).includes(s.type)) {
        return c.json({ ok: false, error: `slide[${i}]: type must be one of: ${FRAME_TYPES.join(", ")}` }, 400);
      }
      if (s.title !== undefined && typeof s.title !== "string") {
        return c.json({ ok: false, error: `slide[${i}]: "title" must be a string` }, 400);
      }
      const err = await validateFrame({ type: s.type, payload: s.payload });
      if (err) {
        return c.json({ ok: false, error: `slide[${i}]: ${err}` });
      }
      validatedSlides.push({
        type: s.type as CanvasType,
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

  app.post("/step-frames/:id/commit", async (c) => {
    const id = c.req.param("id");
    let nodeToFrame: Record<string, number> | undefined;
    try {
      const body = await c.req.json<{ node_to_frame?: unknown }>();
      if (body.node_to_frame !== undefined) {
        const parsed = nodeToFrameSchema.safeParse(body.node_to_frame);
        if (!parsed.success) {
          return c.json({ ok: false, error: "node_to_frame must be a map of node ID → frame index" }, 400);
        }
        nodeToFrame = parsed.data;
      }
    } catch {
      // No body or non-JSON body — commit with no node_to_frame.
    }
    const result = commitStepFramesResult(id, nodeToFrame);
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
        const parsed = nodeActionsSchema.safeParse(body.node_actions);
        if (!parsed.success) {
          return c.json(
            { ok: false, error: "node_actions must be a map of node ID → string[]" },
            400
          );
        }
        nodeActions = parsed.data;
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
      const root = getSnapshotsRoot();
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
    // Workspace is mandatory, no lastWorkspace fallback — matches MCP's
    // list_snapshots exactly (F3/NF20; same validateWorkspaceInput() both
    // transports already use for render()/slideshow()).
    const workspaceResult = validateWorkspaceInput(c.req.query("workspace"));
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;
    const root = getSnapshotsRoot();
    const snapshots = listSnapshots(workspace, root);
    return c.json({ ok: true, snapshots });
  });

  // ── Sprint 18 — GET /snapshots/all (v0.5) ────────────────────────────────────

  app.get("/snapshots/all", (c) => {
    const workspace = getLastWorkspace();
    const root = getSnapshotsRoot();
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
    if (!isValidSnapshotFilename(filename)) {
      return c.json({ ok: false, error: "invalid filename: path traversal not allowed" });
    }

    const currentWorkspace = getLastWorkspace();
    const root = getSnapshotsRoot();

    // Optional workspace override (v0.5 cross-workspace load).
    let workspace: string;
    if (body.workspace !== undefined) {
      const validated = validateWorkspaceInput(body.workspace);
      if (!validated.ok) {
        return c.json({ ok: false, error: "invalid workspace: path traversal not allowed" }, 400);
      }
      workspace = validated.workspace;
    } else {
      workspace = currentWorkspace;
    }

    const raw = loadSnapshotContent(workspace, root, filename);
    if (raw === null) {
      return c.json({ ok: false, error: `snapshot not found: ${filename}` });
    }

    let snapshot: {
      id?: unknown;
      frames?: unknown;
      title?: unknown;
      nodeToFrame?: unknown;
      rawPayload?: unknown;
    };
    try {
      snapshot = JSON.parse(raw) as typeof snapshot;
    } catch {
      return c.json({ ok: false, error: "snapshot file is malformed JSON" });
    }

    if (!isFrameArray(snapshot.frames)) {
      return c.json({ ok: false, error: "snapshot file is missing required fields" });
    }
    const frames = snapshot.frames;
    const title = typeof snapshot.title === "string" ? snapshot.title : undefined;
    const nodeToFrame =
      snapshot.nodeToFrame !== null && typeof snapshot.nodeToFrame === "object"
        ? (snapshot.nodeToFrame as Record<string, number>)
        : undefined;
    // Pre-v0.11 snapshots may lack an id (J1, `02`) — not addressable by the
    // viewport cache; the browser falls back to treating it as unseen (auto-fit).
    const snapshotId = typeof snapshot.id === "string" ? snapshot.id : undefined;
    const rawPayload = typeof snapshot.rawPayload === "string" ? snapshot.rawPayload : undefined;

    const result = await applyLoadedSnapshotResult(frames, workspace, title, nodeToFrame, snapshotId, rawPayload);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error });
    }

    return c.json({ ok: true });
  });

  // ── Mermaid viewport persistence (v0.19, F19/C3) ────────────────────────────

  app.post("/viewport", async (c) => {
    const body = await c.req.json<{ id?: unknown; frame?: unknown; scale?: unknown; positionX?: unknown; positionY?: unknown }>();
    if (typeof body.id !== "string" || body.id.length === 0) {
      return c.json({ ok: false, error: "id must be a non-empty string" }, 400);
    }
    // frame (v0.26.1, bug B19/FR21): the cache key is now id:frameIndex, so each
    // frame of a sequence persists its own manual viewport independently.
    if (typeof body.frame !== "number" || !Number.isInteger(body.frame) || body.frame < 0) {
      return c.json({ ok: false, error: "frame must be a non-negative integer" }, 400);
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
    setViewport(body.id, body.frame, viewport);
    return c.json({ ok: true });
  });

  // ── Snapshot delete endpoints (v0.12) ─────────────────────────────────────

  app.post("/snapshots/delete-files", async (c) => {
    const body = await c.req.json<{ workspace?: unknown; filenames?: unknown }>();
    const root = getSnapshotsRoot();
    const validated = validateWorkspaceForDelete(body.workspace, root);
    if (!validated.ok) {
      return c.json({ ok: false, error: validated.error }, validated.status);
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
    }

    const result = deleteSnapshotFiles(workspace, root, filenames as string[]);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400);
    }
    return c.json({ ok: true, deleted: result.deleted });
  });

  app.post("/snapshots/delete-workspace", async (c) => {
    const body = await c.req.json<{ workspace?: unknown }>();
    const root = getSnapshotsRoot();
    const validated = validateWorkspaceForDelete(body.workspace, root);
    if (!validated.ok) {
      return c.json({ ok: false, error: validated.error }, validated.status);
    }
    const { workspace } = validated;

    deleteWorkspace(workspace, root);
    if (getLastWorkspace() === workspace) {
      setLastWorkspace("");
    }
    return c.json({ ok: true });
  });

  // ── HTML Export (v0.13) ────────────────────────────────────────────────────

  app.post("/export-html", async (c) => {
    const body = await c.req.json<{ items?: unknown; mode?: unknown }>();
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ ok: false, error: "items must be a non-empty array" }, 400);
    }
    // Default cdn (v0.32, F23): offline (fully embedded, today's pre-v0.32
    // behavior) is opt-in via mode: "offline"; any other value falls back to cdn.
    const mode: ExportMode = body.mode === "offline" ? "offline" : "cdn";

    const root = getSnapshotsRoot();
    const validItems: ValidatedExportItem[] = [];

    for (const item of body.items as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const { workspace, id } = item as Record<string, unknown>;

      if (typeof workspace !== "string") continue;
      const validated = validateWorkspaceInput(workspace);
      if (!validated.ok) continue;
      if (typeof id !== "string") continue;

      const record = findSnapshotByIdInWorkspace(validated.workspace, id, root);
      if (record === null) continue;

      validItems.push({ workspace: validated.workspace, id, record });
    }

    if (validItems.length === 0) {
      return c.json({ ok: false, error: "no valid items to export" }, 400);
    }

    const { html, downloadFilename } = await generateExportHtml(validItems, mode);

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
