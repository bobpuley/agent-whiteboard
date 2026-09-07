import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { importZip } from "../import-zip.js";
import type { ImportMode } from "../import-zip.js";
import { getSnapshotsRoot } from "../paths.js";

// NF55 — a per-route override, larger than app.ts's global 10MB JSON cap
// (app.ts excludes this path from that global middleware so the two caps
// don't stack — the stricter one would otherwise always win).
export const IMPORT_MAX_BODY_SIZE_BYTES = 50 * 1024 * 1024;

export function registerImportRoutes(app: Hono): void {
  app.post("/import", bodyLimit({ maxSize: IMPORT_MAX_BODY_SIZE_BYTES }), async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "file is required" }, 400);
    }

    const mode: ImportMode = body["mode"] === "merge" ? "merge" : "create";
    const buffer = Buffer.from(await file.arrayBuffer());
    const root = getSnapshotsRoot();

    const result = await importZip(buffer, body["targetWorkspace"], mode, root);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400);
    }
    return c.json(result);
  });
}
