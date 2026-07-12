// v0.29 Sprint 65 (NF32): server-call logic extracted out of
// DeleteExportModal.svelte, which keeps only step/UI orchestration
// (confirm-arming, step transitions, done/error display) and calls these.
import { triggerDownload } from "./download";

export async function deleteWorkspace(workspace: string): Promise<void> {
  const res = await fetch("/snapshots/delete-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "Delete failed");
}

export async function deleteFiles(workspace: string, filenames: string[]): Promise<void> {
  const res = await fetch("/snapshots/delete-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, filenames }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "Delete failed");
}

export async function exportItems(items: Array<{ workspace: string; id: string }>): Promise<void> {
  const res = await fetch("/export-html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    let message = "Export failed";
    try {
      const data = await res.json();
      message = data.error ?? message;
    } catch {
      /* ignore — keep default message */
    }
    throw new Error(message);
  }
  await triggerDownload(res);
}
