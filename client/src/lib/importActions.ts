// F38/F39 — uploads a selected import zip to the server's POST /import
// (multipart/form-data), mirroring snapshotActions.ts's shape for the
// export side.

export type ImportUploadResult =
  | { ok: true; workspace: string; added: number; updated: number; skipped: number; newestFilename?: string }
  | { ok: false; error: string };

export async function uploadImportZip(
  file: File,
  targetWorkspace: string,
  mode: "create" | "merge"
): Promise<ImportUploadResult> {
  const form = new FormData();
  form.set("file", file);
  form.set("targetWorkspace", targetWorkspace);
  form.set("mode", mode);

  try {
    const res = await fetch("/import", { method: "POST", body: form });
    const data = (await res.json()) as ImportUploadResult;
    if (!data.ok) {
      return { ok: false, error: data.error ?? "Import failed" };
    }
    return data;
  } catch {
    return { ok: false, error: "Network error during import" };
  }
}

// F40 — reuses the existing POST /snapshots/load endpoint to switch the
// client's active workspace to the just-imported one, the same way
// HistoryPanel.svelte's own snapshot rows do. Best-effort: the canvas
// updates via the server's WebSocket broadcast if the request lands; a
// network-level failure here is non-fatal to the import itself, which
// already succeeded server-side.
export async function loadImportedSnapshot(workspace: string, filename: string): Promise<void> {
  try {
    await fetch("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, filename }),
    });
  } catch (err) {
    console.error("[agent-whiteboard] failed to load imported snapshot:", err);
  }
}
