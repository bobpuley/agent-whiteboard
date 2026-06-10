<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let open = false;

  interface SnapshotEntry {
    filename: string;
    timestamp: string;
    type: string;
    title?: string;
  }

  interface WorkspaceGroup {
    name: string;
    isCurrent: boolean;
    snapshots: SnapshotEntry[];
  }

  let workspaces: WorkspaceGroup[] = [];
  let loading = false;
  let error = "";

  const dispatch = createEventDispatcher<{ close: void }>();

  async function fetchSnapshots() {
    loading = true;
    error = "";
    try {
      const res = await fetch("/snapshots/all");
      const data = await res.json<{ ok: boolean; workspaces: WorkspaceGroup[]; error?: string }>();
      if (data.ok) {
        workspaces = data.workspaces;
      } else {
        error = data.error ?? "Failed to load snapshots";
      }
    } catch {
      error = "Network error loading snapshots";
    } finally {
      loading = false;
    }
  }

  async function loadSnapshot(workspace: string, filename: string) {
    try {
      await fetch("/snapshots/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, filename }),
      });
    } catch {
      // Silently ignore — canvas will update via WebSocket if successful
    }
    dispatch("close");
  }

  $: if (open) fetchSnapshots();

  function formatTimestamp(iso: string): string {
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

  $: hasAnySnapshot = workspaces.some((g) => g.snapshots.length > 0);
</script>

{#if open}
  <div class="history-panel" role="dialog" aria-label="Snapshot history">
    <div class="panel-header">
      <span class="panel-title">History</span>
      <button class="close-btn" on:click={() => dispatch("close")} aria-label="Close history panel">&#10005;</button>
    </div>

    <div class="panel-body">
      {#if loading}
        <p class="panel-message">Loading…</p>
      {:else if error}
        <p class="panel-message panel-error">{error}</p>
      {:else if !hasAnySnapshot}
        <p class="panel-message">No snapshots yet.</p>
      {:else}
        {#each workspaces as group (group.name)}
          <details class="workspace-group" open={group.isCurrent}>
            <summary class="workspace-summary">
              <span class="workspace-name">{group.name}</span>
              {#if group.isCurrent}
                <span class="current-badge">current</span>
              {/if}
            </summary>
            <ul class="snapshot-list">
              {#each group.snapshots as entry (group.name + "/" + entry.filename)}
                <li>
                  <button class="snapshot-row" on:click={() => loadSnapshot(group.name, entry.filename)}>
                    <span class="snapshot-title">{entry.title ?? "—"}</span>
                    <span class="snapshot-meta">
                      <span class="type-badge">{entry.type}</span>
                      <span class="snapshot-time">{formatTimestamp(entry.timestamp)}</span>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </details>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .history-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    background: #fff;
    border-left: 1px solid #d8d8d8;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    z-index: 100;
    box-sizing: border-box;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e8e8e8;
    background: #fafafa;
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #888;
    padding: 2px 6px;
    border-radius: 3px;
    line-height: 1;
  }

  .close-btn:hover {
    background: #f0f0f0;
    color: #444;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .panel-message {
    color: #888;
    font-size: 13px;
    padding: 16px;
    margin: 0;
    text-align: center;
  }

  .panel-error {
    color: #c0392b;
  }

  .workspace-group {
    border-bottom: 1px solid #ececec;
  }

  .workspace-group:last-child {
    border-bottom: none;
  }

  .workspace-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    background: #fafafa;
    list-style: none;
    user-select: none;
    font-size: 12px;
    font-weight: 600;
    color: #555;
  }

  .workspace-summary:hover {
    background: #f0f0f0;
  }

  .workspace-summary::-webkit-details-marker {
    display: none;
  }

  .workspace-summary::before {
    content: "▶";
    font-size: 9px;
    color: #999;
    transition: transform 0.15s;
    display: inline-block;
  }

  details[open] > .workspace-summary::before {
    transform: rotate(90deg);
  }

  .workspace-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current-badge {
    font-size: 10px;
    background: #e8f4fd;
    color: #2980b9;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .snapshot-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .snapshot-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 10px 16px 10px 28px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
    transition: background 0.1s;
  }

  .snapshot-row:hover {
    background: #f5f5f5;
  }

  .snapshot-title {
    font-size: 13px;
    color: #222;
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
    background: #e8f4fd;
    color: #2980b9;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .snapshot-time {
    font-size: 11px;
    color: #999;
  }
</style>
