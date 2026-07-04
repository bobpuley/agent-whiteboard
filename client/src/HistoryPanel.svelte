<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { WorkspaceGroup } from "./lib/snapshotTypes";
  import { trapFocus } from "./lib/trapFocus";

  export let open = false;

  let workspaces: WorkspaceGroup[] = [];
  let loading = false;
  let error = "";
  let locked = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  // Reset ephemeral state when panel closes.
  $: if (!open) {
    locked = false;
  }

  export async function fetchSnapshots() {
    loading = true;
    error = "";
    try {
      const res = await fetch("/snapshots/all");
      const data = (await res.json()) as { ok: boolean; workspaces: WorkspaceGroup[]; error?: string };
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
      // Canvas will update via WebSocket if successful
    }
    if (!locked) dispatch("close");
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
  <div
    class="history-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Snapshot history"
    tabindex="-1"
    use:trapFocus={{ onEscape: () => dispatch("close") }}
  >
    <div class="panel-header">
      <span class="panel-title">History</span>
      <div class="header-actions">
        <button
          class="action-btn"
          class:locked
          on:click={() => { locked = !locked; }}
          aria-label={locked ? "Unlock history panel (stays open)" : "Lock history panel (stays open)"}
          aria-pressed={locked}
          title={locked ? "Locked — panel stays open after load" : "Unlocked — panel closes after load"}
        >
          {#if locked}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          {/if}
        </button>
        <div class="header-sep" aria-hidden="true"></div>
        <button class="close-btn" on:click={() => dispatch("close")} aria-label="Close history panel">&#10005;</button>
      </div>
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
                <li class="snapshot-item">
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
    padding: 12px 16px;
    border-bottom: 1px solid #e8e8e8;
    background: #fafafa;
    gap: 4px;
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    flex: 1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action-btn {
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    color: #999;
    padding: 3px 5px;
    border-radius: 3px;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .action-btn:hover {
    background: #f0f0f0;
    color: #555;
  }

  .action-btn.locked {
    color: #2980b9;
    border-color: #2980b9;
    background: #e8f4fd;
  }

  .header-sep {
    width: 1px;
    height: 18px;
    background: #d0d0d0;
    margin: 0 4px;
    flex-shrink: 0;
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
    flex-shrink: 0;
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

  .snapshot-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
    position: relative;
  }

  .snapshot-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding: 10px 8px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
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
