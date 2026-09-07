import JSZip from "jszip";

// Mirrors server/export-zip.ts's Manifest shape (F36) — read client-side so
// the collision prompt (F38) can resolve a workspace name with no server
// round-trip.
export interface ImportManifest {
  formatVersion: number;
  workspace: string;
  exportedAt: string;
  appVersion: string;
  snapshots: string[];
}

export type ReadManifestResult =
  | { ok: true; manifest: ImportManifest }
  | { ok: false; error: string };

export async function readManifestFromZip(file: File): Promise<ReadManifestResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, error: "could not read this file as a zip" };
  }

  const entry = zip.file("manifest.json");
  if (!entry) {
    return { ok: false, error: "not a valid export — manifest.json is missing" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await entry.async("string")) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "manifest.json is not valid JSON" };
  }

  if (typeof parsed.workspace !== "string" || parsed.workspace.length === 0) {
    return { ok: false, error: "manifest.json is missing a workspace name" };
  }
  if (!Array.isArray(parsed.snapshots)) {
    return { ok: false, error: "manifest.json is missing the snapshots list" };
  }

  return {
    ok: true,
    manifest: {
      formatVersion: typeof parsed.formatVersion === "number" ? parsed.formatVersion : 1,
      workspace: parsed.workspace,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : "",
      snapshots: parsed.snapshots.filter((s): s is string => typeof s === "string"),
    },
  };
}
