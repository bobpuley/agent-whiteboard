<script lang="ts">
  // v0.29 Sprint 64 (NF31): shared out of HistoryPanel.svelte and
  // DeleteExportModal.svelte, which had byte-identical markup + CSS for a
  // snapshot's title/type-badge/timestamp display. Each caller wraps this in
  // its own interactive element (a clickable row vs. a checkbox label).
  import { formatTimestamp } from "./formatTimestamp";

  export let title: string | undefined;
  export let type: string;
  export let timestamp: string;
</script>

<span class="snapshot-title">{title ?? "—"}</span>
<span class="snapshot-meta">
  <span class="type-badge">{type}</span>
  <span class="snapshot-time">{formatTimestamp(timestamp)}</span>
</span>

<style>
  .snapshot-title {
    font-size: 13px;
    color: var(--board-text-strong);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .snapshot-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-badge {
    font-size: 11px;
    background: var(--board-accent-bg);
    color: var(--board-accent);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .snapshot-time {
    font-size: 11px;
    color: var(--board-text-faint);
  }
</style>
