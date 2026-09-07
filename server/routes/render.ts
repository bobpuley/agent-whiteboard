import type { Hono } from "hono";
import { signalClick, signalDone, waitForClick, waitForDone } from "../interaction.js";
import type { ClickEvent } from "../interaction.js";
import { clearCanvas } from "../session.js";
import type { CanvasType } from "../session.js";
import { broadcast } from "../ws.js";
import { FRAME_TYPES, nodeActionsSchema, nodeToFrameSchema, validateFrame } from "../validate.js";
import { cancelSlideshow } from "../slideshow.js";
import {
  appendFrameAndBroadcast,
  commitRenderResult,
  commitStepFramesResult,
  initStepFramesResult,
  seekAndBroadcast,
  stepAndBroadcast,
  validateWorkspaceInput,
} from "../render-core.js";
import { setViewport } from "../viewport-cache.js";
import type { Viewport } from "../viewport-cache.js";
import { parsePort } from "../port.js";

export function registerRenderRoutes(app: Hono): void {
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
    return c.json(await stepAndBroadcast(body.direction));
  });

  app.post("/seek", async (c) => {
    const body = await c.req.json<{ frame?: unknown }>();
    if (typeof body.frame !== "number" || !Number.isInteger(body.frame)) {
      return c.json({ ok: false, error: "frame must be an integer" }, 400);
    }
    return c.json(await seekAndBroadcast(body.frame));
  });

  app.post("/clear", (c) => {
    cancelSlideshow({ persist: false }); // clear() must never produce a snapshot (F10)
    clearCanvas();
    broadcast({ action: "clear" });
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
    try {
      const channelPort = parsePort(process.env.CHANNEL_PORT, 3001, "CHANNEL_PORT");
      await fetch(`http://127.0.0.1:${channelPort}/user-done`, { method: "POST" });
    } catch {
      // Channel server not running, or CHANNEL_PORT misconfigured — ignore.
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
    await setViewport(body.id, body.frame, viewport);
    return c.json({ ok: true });
  });
}
