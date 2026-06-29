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
  let locked = false;
  let selectMode = false;
  // key: "workspace/filename"
  let selected = new Set<string>();

  const dispatch = createEventDispatcher<{ close: void }>();

  // Reset ephemeral state when panel closes.
  $: if (!open) {
    locked = false;
    selectMode = false;
    selected = new Set();
  }

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
    if (selectMode) {
      toggleSelect(workspace, filename);
      return;
    }
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

  function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selected = new Set();
  }

  function toggleSelect(workspace: string, filename: string) {
    const key = `${workspace}/${filename}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected = next;
  }

  function isSelected(workspace: string, filename: string) {
    return selected.has(`${workspace}/${filename}`);
  }

  async function deleteSelected() {
    // Group selected items by workspace.
    const byWorkspace = new Map<string, string[]>();
    for (const key of selected) {
      const slash = key.indexOf("/");
      const ws = key.slice(0, slash);
      const fn = key.slice(slash + 1);
      if (!byWorkspace.has(ws)) byWorkspace.set(ws, []);
      byWorkspace.get(ws)!.push(fn);
    }
    for (const [ws, filenames] of byWorkspace) {
      try {
        await fetch("/snapshots/delete-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: ws, filenames }),
        });
      } catch { /* ignore */ }
    }
    // Optimistically remove from UI.
    workspaces = workspaces.map((g) => ({
      ...g,
      snapshots: g.snapshots.filter((s) => !selected.has(`${g.name}/${s.filename}`)),
    }));
    selected = new Set();
    selectMode = false;
  }

  async function clearWorkspace(workspace: string) {
    try {
      await fetch("/snapshots/clear-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
    } catch { /* ignore */ }
    workspaces = workspaces.map((g) =>
      g.name === workspace ? { ...g, snapshots: [] } : g
    );
  }

  async function deleteWorkspace(workspace: string) {
    const confirmed = window.confirm(
      `Delete workspace "${workspace}" and all its snapshots? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await fetch("/snapshots/delete-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
    } catch { /* ignore */ }
    workspaces = workspaces.filter((g) => g.name !== workspace);
  }
</script>

{#if open}
  <div class="history-panel" role="dialog" aria-label="Snapshot history">
    <div class="panel-header">
      <span class="panel-title">History</span>
      <div class="header-actions">
        {#if !selectMode}
          <!-- Edit mode entry: pencil icon, visible by default -->
          <button
            class="action-btn"
            on:click={toggleSelectMode}
            aria-label="Edit — enter selection/delete mode"
            title="Edit (select and delete snapshots)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        {:else}
          <!-- Recycle bin icon, visible in selection/delete mode -->
          <button
            class="action-btn active"
            on:click={toggleSelectMode}
            aria-label="Exit selection/delete mode"
            title="Exit delete mode"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        {/if}
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

    {#if selectMode}
      <div class="select-bar">
        <span class="select-count">{selected.size === 0 ? "Select snapshots to delete" : `${selected.size} selected`}</span>
        <div class="select-bar-actions">
          {#if selected.size > 0}
            <button class="delete-selected-btn" on:click={deleteSelected}>Delete selected</button>
          {/if}
          <button class="cancel-select-btn" on:click={toggleSelectMode}>Cancel</button>
        </div>
      </div>
    {/if}

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
            {#if selectMode}
              <div class="ws-actions-bar">
                <span class="ws-actions-label">Workspace:</span>
                <button
                  class="ws-action-btn"
                  on:click={() => clearWorkspace(group.name)}
                  title="Delete all snapshots in this workspace (keeps folder)"
                >Clear all</button>
                <button
                  class="ws-action-btn ws-action-delete"
                  on:click={() => deleteWorkspace(group.name)}
                  title="Delete workspace folder and all its snapshots"
                >Delete folder</button>
              </div>
            {/if}
            <ul class="snapshot-list">
              {#each group.snapshots as entry (group.name + "/" + entry.filename)}
                <li class="snapshot-item" class:selected={isSelected(group.name, entry.filename)}>
                  {#if selectMode}
                    <label class="snapshot-checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected(group.name, entry.filename)}
                        on:change={() => toggleSelect(group.name, entry.filename)}
                        aria-label="Select snapshot {entry.title ?? entry.filename}"
                      />
                    </label>
                  {/if}
                  <button class="snapshot-row" on:click={() => loadSnapshot(group.name, entry.filename)}>
                    <span class="snapshot-title">{entry.title ?? "—"}</span>
                    <span class="snapshot-meta">
                      <span class="type-badge">{entry.type}</span>
                      <span class="snapshot-time">{formatTimestamp(entry.timestamp)}</span>
                    </span>
                  </button>
                  {#if !selectMode}
                    <button
                      class="row-delete-btn"
                      on:click|stopPropagation={async () => {
                        try {
                          await fetch("/snapshots/delete-files", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ workspace: group.name, filenames: [entry.filename] }),
                          });
                        } catch { /* ignore */ }
                        workspaces = workspaces.map((g) =>
                          g.name === group.name
                            ? { ...g, snapshots: g.snapshots.filter((s) => s.filename !== entry.filename) }
                            : g
                        );
                      }}
                      aria-label="Delete this snapshot"
                      title="Delete snapshot"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/>
                        <path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  {/if}
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

  .action-btn.active,
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

  .select-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: #fff8e1;
    border-bottom: 1px solid #ffe082;
    font-size: 12px;
    gap: 8px;
  }

  .select-count {
    color: #555;
    flex: 1;
  }

  .select-bar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .delete-selected-btn {
    background: #e74c3c;
    color: #fff;
    border: none;
    border-radius: 3px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
  }

  .delete-selected-btn:hover {
    background: #c0392b;
  }

  .cancel-select-btn {
    background: none;
    color: #555;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .cancel-select-btn:hover {
    background: #f0f0f0;
  }

  .ws-actions-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 28px;
    background: #fafafa;
    border-bottom: 1px solid #ececec;
    font-size: 11px;
  }

  .ws-actions-label {
    color: #999;
    flex: 1;
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

  .ws-action-btn {
    font-size: 10px;
    padding: 1px 7px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
    color: #555;
    font-weight: 500;
    flex-shrink: 0;
  }

  .ws-action-btn:hover {
    background: #f0f0f0;
  }

  .ws-action-delete {
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .ws-action-delete:hover {
    background: #fdf0f0;
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

  .snapshot-item.selected {
    background: #fff8e1;
  }

  .snapshot-item:hover .row-delete-btn {
    opacity: 1;
  }

  .snapshot-checkbox-label {
    display: flex;
    align-items: center;
    padding: 0 4px 0 12px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .snapshot-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding: 10px 8px 10px 28px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .snapshot-item.selected .snapshot-row,
  .snapshot-item:has(.snapshot-checkbox-label) .snapshot-row {
    padding-left: 8px;
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

  .row-delete-btn {
    opacity: 0;
    transition: opacity 0.1s;
    background: none;
    border: none;
    cursor: pointer;
    color: #bbb;
    padding: 6px 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .row-delete-btn:hover {
    color: #e74c3c;
  }
</style>
