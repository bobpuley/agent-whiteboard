// F38/F39 — uploads a selected import zip to the server's POST /import
// (multipart/form-data), mirroring snapshotActions.ts's shape for the
// export side.

export type ImportUploadResult =
  | { ok: true; workspace: string; added: number; updated: number; skipped: number }
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
