import type { Hono } from "hono";
import { exportCanvas } from "../session.js";
import { findSnapshotById, findSnapshotByIdInWorkspace } from "../snapshot-reader.js";
import { validateWorkspaceInput } from "../render-core.js";
import { generateExportHtml } from "../export-html.js";
import type { ExportMode, ValidatedExportItem } from "../export-html.js";
import { getSnapshotsRoot } from "../paths.js";

export function registerExportRoutes(app: Hono): void {
  app.get("/export", async (c) => {
    const id = c.req.query("id");
    if (id !== undefined && id !== "") {
      const root = getSnapshotsRoot();
      const payload = await findSnapshotById(id, root);
      if (payload === null) {
        return c.json({ ok: false, error: "graph not found" }, 404);
      }
      return c.json({ ok: true, data: payload });
    }
    return c.json({ ok: true, data: exportCanvas() });
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

      const record = await findSnapshotByIdInWorkspace(validated.workspace, id, root);
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
}
