// v0.29 Sprint 64 (NF31): shared out of HistoryPanel.svelte and
// DeleteExportModal.svelte, which had byte-identical copies of this
// function.
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
