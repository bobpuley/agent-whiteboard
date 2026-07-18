<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { WorkspaceGroup } from "./lib/snapshotTypes";
  import { trapFocus } from "./lib/trapFocus";
  import { fetchAllSnapshots } from "./lib/fetchSnapshots";
  import SnapshotRow from "./lib/SnapshotRow.svelte";

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
    const result = await fetchAllSnapshots();
    if (result.ok) {
      workspaces = result.workspaces;
    } else {
      error = result.error;
    }
    loading = false;
  }

  async function loadSnapshot(workspace: string, filename: string) {
    try {
      await fetch("/snapshots/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, filename }),
      });
    } catch (err) {
      // Canvas will update via WebSocket if the request reached the server —
      // this only catches a network-level failure (request never arrived).
      console.error("[agent-whiteboard] failed to load snapshot:", err);
    }
    if (!locked) dispatch("close");
  }

  $: if (open) fetchSnapshots();

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
                    <SnapshotRow title={entry.title} type={entry.type} timestamp={entry.timestamp} />
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
    background: var(--board-bg);
    border-left: 1px solid var(--board-border);
    box-shadow: -2px 0 8px var(--board-shadow-panel);
    display: flex;
    flex-direction: column;
    z-index: 100;
    box-sizing: border-box;
  }

  .panel-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--board-border-light);
    background: var(--board-bg-panel);
    gap: 4px;
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--board-text);
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
    color: var(--board-text-faint);
    padding: 3px 5px;
    border-radius: 3px;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .action-btn:hover {
    background: var(--board-bg-hover);
    color: var(--board-text-secondary);
  }

  .action-btn.locked {
    color: var(--board-accent);
    border-color: var(--board-accent);
    background: var(--board-accent-bg);
  }

  .header-sep {
    width: 1px;
    height: 18px;
    background: var(--board-border-mid);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--board-text-muted);
    padding: 2px 6px;
    border-radius: 3px;
    line-height: 1;
  }

  .close-btn:hover {
    background: var(--board-bg-hover);
    color: var(--board-text);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .panel-message {
    color: var(--board-text-muted);
    font-size: 13px;
    padding: 16px;
    margin: 0;
    text-align: center;
  }

  .panel-error {
    color: var(--board-danger-dark);
  }

  .workspace-group {
    border-bottom: 1px solid var(--board-border-light);
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
    background: var(--board-bg-panel);
    list-style: none;
    user-select: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--board-text-secondary);
  }

  .workspace-summary:hover {
    background: var(--board-bg-hover);
  }

  .workspace-summary::-webkit-details-marker {
    display: none;
  }

  .workspace-summary::before {
    content: "▶";
    font-size: 9px;
    color: var(--board-text-faint);
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
    background: var(--board-accent-bg);
    color: var(--board-accent);
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
    border-bottom: 1px solid var(--board-bg-hover);
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
    background: var(--board-bg-row-hover);
  }
</style>
