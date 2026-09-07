import { createRequire } from "module";
import archiver from "archiver";
import { findSnapshotFileByIdInWorkspace } from "./snapshot-reader.js";

export interface ExportZipItem {
  workspace: string;
  id: string;
}

export type GenerateExportZipResult =
  | { ok: true; zip: Buffer; downloadFilename: string }
  | { ok: false; error: string };

interface Manifest {
  formatVersion: number;
  workspace: string;
  exportedAt: string;
  appVersion: string;
  snapshots: string[];
}

/**
 * Reads own package.json version via createRequire (works whether this
 * module runs as server/export-zip.ts under tsx, one level below repo root,
 * or as the compiled dist/server/export-zip.js, two levels below).
 */
function getAppVersion(): string {
  const req = createRequire(import.meta.url);
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const pkg = req(rel) as { version?: string };
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "unknown";
}

function buildZipDownloadFilename(workspace: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const sanitized = workspace.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 24);
  return `${sanitized}-${ts}.zip`;
}

/**
 * Builds a downloadable zip (F36) of the given snapshots' raw JSON files
 * plus a generated manifest.json — no rendering/sanitization pass, unlike
 * generateExportHtml(). Every item must share the same workspace (the
 * manifest format is single-workspace); a mixed-workspace list is rejected
 * rather than silently exporting a subset. Ids that don't resolve to a file
 * on disk are silently skipped (matching /export-html's per-item leniency);
 * an all-miss request is rejected. Viewport-cache data is never included —
 * this only ever touches the snapshot JSON files themselves.
 */
export async function generateExportZip(items: ExportZipItem[], root: string): Promise<GenerateExportZipResult> {
  if (items.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }

  const workspace = items[0].workspace;
  if (items.some((item) => item.workspace !== workspace)) {
    return { ok: false, error: "all items must belong to the same workspace" };
  }

  const files: Array<{ filename: string; raw: string }> = [];
  for (const item of items) {
    const found = await findSnapshotFileByIdInWorkspace(workspace, item.id, root);
    if (found !== null) files.push(found);
  }

  if (files.length === 0) {
    return { ok: false, error: "no valid items to export" };
  }

  const manifest: Manifest = {
    formatVersion: 1,
    workspace,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    snapshots: files.map((f) => f.filename),
  };

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  for (const f of files) {
    archive.append(f.raw, { name: f.filename });
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  await archive.finalize();
  await done;

  return {
    ok: true,
    zip: Buffer.concat(chunks),
    downloadFilename: buildZipDownloadFilename(workspace),
  };
}
