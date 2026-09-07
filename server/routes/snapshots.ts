import type { Hono } from "hono";
import { getLastWorkspace, setLastWorkspace } from "../session.js";
import { isValidSnapshotFilename, nodeToFrameSchema } from "../validate.js";
import { isFrameArray, listAllSnapshots, listSnapshots, loadSnapshotContent } from "../snapshot-reader.js";
import { deleteSnapshotFiles, deleteWorkspace, validateWorkspaceForDelete } from "../snapshot-writer.js";
import { applyLoadedSnapshotResult, validateWorkspaceInput } from "../render-core.js";
import { getSnapshotsRoot } from "../paths.js";

export function registerSnapshotRoutes(app: Hono): void {
  // ── History navigator (v0.4 — Sprint 17) ──────────────────────────────────────

  app.get("/snapshots", async (c) => {
    // Workspace is mandatory, no lastWorkspace fallback — matches MCP's
    // list_snapshots exactly (F3/NF20; same validateWorkspaceInput() both
    // transports already use for render()/slideshow()).
    const workspaceResult = validateWorkspaceInput(c.req.query("workspace"));
    if (!workspaceResult.ok) {
      return c.json({ ok: false, error: workspaceResult.error }, 400);
    }
    const { workspace } = workspaceResult;
    const root = getSnapshotsRoot();
    const snapshots = await listSnapshots(workspace, root);
    return c.json({ ok: true, snapshots });
  });

  // ── Sprint 18 — GET /snapshots/all (v0.5) ────────────────────────────────────

  app.get("/snapshots/all", async (c) => {
    const workspace = getLastWorkspace();
    const root = getSnapshotsRoot();
    const workspaces = await listAllSnapshots(root, workspace);
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

    const raw = await loadSnapshotContent(workspace, root, filename);
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
    const parsedNodeToFrame = nodeToFrameSchema.safeParse(snapshot.nodeToFrame);
    const nodeToFrame = parsedNodeToFrame.success ? parsedNodeToFrame.data : undefined;
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

  // ── Snapshot delete endpoints (v0.12) ─────────────────────────────────────

  app.post("/snapshots/delete-files", async (c) => {
    const body = await c.req.json<{ workspace?: unknown; filenames?: unknown }>();
    const root = getSnapshotsRoot();
    const validated = await validateWorkspaceForDelete(body.workspace, root);
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

    const result = await deleteSnapshotFiles(workspace, root, filenames as string[]);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400);
    }
    return c.json({ ok: true, deleted: result.deleted });
  });

  app.post("/snapshots/delete-workspace", async (c) => {
    const body = await c.req.json<{ workspace?: unknown }>();
    const root = getSnapshotsRoot();
    const validated = await validateWorkspaceForDelete(body.workspace, root);
    if (!validated.ok) {
      return c.json({ ok: false, error: validated.error }, validated.status);
    }
    const { workspace } = validated;

    await deleteWorkspace(workspace, root);
    if (getLastWorkspace() === workspace) {
      setLastWorkspace("");
    }
    return c.json({ ok: true });
  });
}
