import type { Hono } from "hono";
import type { CanvasType } from "../session.js";
import { FRAME_TYPES, validateFrame } from "../validate.js";
import { cancelSlideshow, startSlideshow } from "../slideshow.js";
import type { Slide } from "../slideshow.js";
import { validateWorkspaceInput } from "../render-core.js";

export function registerSlideshowRoutes(app: Hono): void {
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
}
