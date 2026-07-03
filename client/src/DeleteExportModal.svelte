<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import type { WorkspaceGroup } from "./lib/snapshotTypes";
  import { triggerDownload } from "./lib/download";

  export let mode: "delete" | "export";
  export let open = false;
  export let workspaces: WorkspaceGroup[] = [];

  const dispatch = createEventDispatcher<{ close: void; deleted: void }>();

  let step: 1 | 2 = 1;
  let selectedWorkspace: WorkspaceGroup | null = null;
  let selectedFilenames = new Set<string>();
  let confirmingWhole = false;
  let confirmingSubset = false;
  let busy = false;
  let errorMessage: string | null = null;
  let doneMessage: string | null = null;

  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;

  $: verb = mode === "delete" ? "Delete" : "Export";
  $: canGoBack = step === 2 && workspaces.length > 1;

  // Combined into a single reactive block so the order is guaranteed:
  // Svelte does not guarantee source-order execution across *separate*
  // top-level `$:` statements (it topologically sorts by dependency), which
  // previously let `wasOpen` update before the open-transition check ran.
  let wasOpen = false;
  $: {
    if (open && !wasOpen) resetState();
    wasOpen = open;
  }

  function resetState() {
    errorMessage = null;
    doneMessage = null;
    busy = false;
    confirmingWhole = false;
    confirmingSubset = false;
    selectedFilenames = new Set();
    if (workspaces.length === 1) {
      selectedWorkspace = workspaces[0];
      step = 2;
    } else {
      selectedWorkspace = null;
      step = 1;
    }
  }

  function pickWorkspace(ws: WorkspaceGroup) {
    selectedWorkspace = ws;
    selectedFilenames = new Set();
    confirmingWhole = false;
    confirmingSubset = false;
    errorMessage = null;
    step = 2;
  }

  function goBack() {
    if (workspaces.length <= 1) return;
    step = 1;
    selectedWorkspace = null;
    selectedFilenames = new Set();
    errorMessage = null;
  }

  function close() {
    dispatch("close");
  }

  function toggleFilename(filename: string) {
    const next = new Set(selectedFilenames);
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    selectedFilenames = next;
    confirmingSubset = false;
  }

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

  function armConfirm(which: "whole" | "subset") {
    if (which === "whole") confirmingWhole = true;
    else confirmingSubset = true;
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      confirmingWhole = false;
      confirmingSubset = false;
    }, 3000);
  }

  function showDone(message: string) {
    doneMessage = message;
    if (doneTimer) clearTimeout(doneTimer);
    doneTimer = setTimeout(() => dispatch("close"), 1200);
  }

  async function exportItems(items: Array<{ workspace: string; filename: string }>) {
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

  async function runWholeAction() {
    if (!selectedWorkspace) return;
    busy = true;
    errorMessage = null;
    try {
      if (mode === "delete") {
        const res = await fetch("/snapshots/delete-workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: selectedWorkspace.name }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Delete failed");
        dispatch("deleted");
        showDone(`Deleted entire workspace "${selectedWorkspace.name}"`);
      } else {
        const items = selectedWorkspace.snapshots.map((s) => ({
          workspace: selectedWorkspace!.name,
          filename: s.filename,
        }));
        await exportItems(items);
        showDone(`Exported entire workspace "${selectedWorkspace.name}"`);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Request failed";
    } finally {
      busy = false;
    }
  }

  async function runSelectedAction() {
    if (!selectedWorkspace || selectedFilenames.size === 0) return;
    busy = true;
    errorMessage = null;
    const filenames = [...selectedFilenames];
    try {
      if (mode === "delete") {
        const res = await fetch("/snapshots/delete-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: selectedWorkspace.name, filenames }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Delete failed");
        dispatch("deleted");
        showDone(`Deleted ${filenames.length} snapshot${filenames.length === 1 ? "" : "s"} from "${selectedWorkspace.name}"`);
      } else {
        const items = filenames.map((filename) => ({ workspace: selectedWorkspace!.name, filename }));
        await exportItems(items);
        showDone(`Exported ${filenames.length} snapshot${filenames.length === 1 ? "" : "s"} from "${selectedWorkspace.name}"`);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Request failed";
    } finally {
      busy = false;
    }
  }

  function handleWholeAction() {
    if (mode === "delete" && !confirmingWhole) {
      armConfirm("whole");
      return;
    }
    if (confirmTimer) clearTimeout(confirmTimer);
    void runWholeAction();
  }

  function handleSelectedAction() {
    if (selectedFilenames.size === 0) return;
    if (mode === "delete" && !confirmingSubset) {
      armConfirm("subset");
      return;
    }
    if (confirmTimer) clearTimeout(confirmTimer);
    void runSelectedAction();
  }

  onDestroy(() => {
    if (confirmTimer) clearTimeout(confirmTimer);
    if (doneTimer) clearTimeout(doneTimer);
  });
</script>

{#if open}
  <div class="modal-overlay" on:click|self={close}>
    <div class="modal mode-{mode}" role="dialog" aria-label="{verb} snapshots">
      <div class="modal-header">
        {#if canGoBack}
          <button class="modal-back-btn" on:click={goBack} aria-label="Back">&#8592;</button>
        {/if}
        <span class="modal-title">
          {#if step === 1}
            {verb} — choose a workspace
          {:else if selectedWorkspace}
            {selectedWorkspace.name}
          {/if}
        </span>
        <button class="modal-close-btn" on:click={close} aria-label="Close">&#10005;</button>
      </div>

      <div class="modal-body">
        {#if doneMessage}
          <div class="modal-confirm">
            <span class="check-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span>{doneMessage}</span>
          </div>
        {:else if step === 1}
          <p class="modal-step-hint">Step 1 of 2 — pick which workspace's snapshots to {mode}.</p>
          {#each workspaces as ws (ws.name)}
            <button class="workspace-pick-row" on:click={() => pickWorkspace(ws)}>
              <span class="workspace-pick-name">{ws.name}{ws.isCurrent ? " (current)" : ""}</span>
              <span class="workspace-pick-meta">
                {ws.snapshots.length} snapshot{ws.snapshots.length === 1 ? "" : "s"}
                <span class="workspace-pick-chevron">&#8250;</span>
              </span>
            </button>
          {/each}
        {:else if selectedWorkspace}
          <p class="modal-step-hint">Step 2 of 2 — {mode} the whole workspace, or select individual snapshots below.</p>
          <button class="whole-workspace-action" disabled={busy} on:click={handleWholeAction}>
            {#if mode === "delete" && confirmingWhole}
              Click again to confirm
            {:else}
              {verb} entire workspace ({selectedWorkspace.snapshots.length} snapshot{selectedWorkspace.snapshots.length === 1 ? "" : "s"})
            {/if}
          </button>
          <div class="modal-divider">or select individual snapshots</div>
          <ul class="modal-snapshot-list">
            {#each selectedWorkspace.snapshots as s (s.filename)}
              <li class="modal-snapshot-item" class:selected={selectedFilenames.has(s.filename)}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedFilenames.has(s.filename)}
                    on:change={() => toggleFilename(s.filename)}
                    aria-label="Select snapshot {s.title ?? s.filename}"
                  />
                  <span class="modal-snapshot-row">
                    <span class="snapshot-title">{s.title ?? "—"}</span>
                    <span class="snapshot-meta">
                      <span class="type-badge">{s.type}</span>
                      <span class="snapshot-time">{formatTimestamp(s.timestamp)}</span>
                    </span>
                  </span>
                </label>
              </li>
            {/each}
          </ul>
          {#if errorMessage}
            <p class="modal-error">{errorMessage}</p>
          {/if}
        {/if}
      </div>

      {#if step === 2 && !doneMessage}
        <div class="modal-footer">
          <span class="modal-select-count">{selectedFilenames.size} selected</span>
          <div class="modal-footer-actions">
            <button class="modal-cancel-btn" on:click={close}>Cancel</button>
            <button
              class="modal-selected-action"
              disabled={selectedFilenames.size === 0 || busy}
              on:click={handleSelectedAction}
            >
              {mode === "delete" && confirmingSubset ? "Click again to confirm" : `${verb} selected`}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }

  .modal {
    background: #fff;
    width: 420px;
    max-width: calc(100vw - 40px);
    max-height: 80vh;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid #e8e8e8;
    border-top: 3px solid #999;
  }

  .modal.mode-delete .modal-header {
    border-top-color: #e74c3c;
  }

  .modal.mode-export .modal-header {
    border-top-color: #2980b9;
  }

  .modal-back-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #888;
    font-size: 16px;
    padding: 2px 4px;
    line-height: 1;
    border-radius: 3px;
  }

  .modal-back-btn:hover {
    background: #f0f0f0;
  }

  .modal-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #888;
    padding: 2px 6px;
    border-radius: 3px;
    line-height: 1;
  }

  .modal-close-btn:hover {
    background: #f0f0f0;
    color: #444;
  }

  .modal-body {
    padding: 14px 16px;
    overflow-y: auto;
    flex: 1;
  }

  .modal-step-hint {
    font-size: 12px;
    color: #999;
    margin: 0 0 10px;
  }

  .workspace-pick-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    margin-bottom: 8px;
    cursor: pointer;
    background: #fff;
    font: inherit;
    text-align: left;
  }

  .workspace-pick-row:hover {
    background: #f5f5f5;
    border-color: #ccc;
  }

  .workspace-pick-name {
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }

  .workspace-pick-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #999;
    font-size: 12px;
  }

  .workspace-pick-chevron {
    color: #bbb;
  }

  .whole-workspace-action {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    border-radius: 6px;
    border: none;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 14px;
  }

  .whole-workspace-action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .mode-delete .whole-workspace-action {
    background: #e74c3c;
  }

  .mode-delete .whole-workspace-action:hover:not(:disabled) {
    background: #c0392b;
  }

  .mode-export .whole-workspace-action {
    background: #2980b9;
  }

  .mode-export .whole-workspace-action:hover:not(:disabled) {
    background: #1f6699;
  }

  .modal-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #aaa;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin: 4px 0 10px;
  }

  .modal-divider::before,
  .modal-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #eee;
  }

  .modal-snapshot-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #ececec;
    border-radius: 6px;
    overflow: hidden;
  }

  .modal-snapshot-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
  }

  .modal-snapshot-item:last-child {
    border-bottom: none;
  }

  .modal-snapshot-item.selected {
    background: #fff8e1;
  }

  .modal-snapshot-item label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }

  .modal-snapshot-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
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

  .modal-error {
    color: #c0392b;
    font-size: 12px;
    margin: 10px 0 0;
  }

  .modal-footer {
    box-sizing: border-box;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid #e8e8e8;
    background: #fafafa;
  }

  .modal-select-count {
    font-size: 12px;
    color: #666;
  }

  .modal-footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-cancel-btn {
    background: none;
    color: #555;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
  }

  .modal-cancel-btn:hover {
    background: #f0f0f0;
  }

  .modal-selected-action {
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
  }

  .modal-selected-action:disabled {
    background: #ddd !important;
    cursor: default;
  }

  .mode-delete .modal-selected-action {
    background: #e74c3c;
  }

  .mode-delete .modal-selected-action:hover:not(:disabled) {
    background: #c0392b;
  }

  .mode-export .modal-selected-action {
    background: #2980b9;
  }

  .mode-export .modal-selected-action:hover:not(:disabled) {
    background: #1f6699;
  }

  .modal-confirm {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 30px 16px;
    color: #333;
    font-size: 14px;
    text-align: center;
  }

  .modal-confirm .check-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .mode-delete .check-circle {
    background: #e74c3c;
  }

  .mode-export .check-circle {
    background: #2980b9;
  }
</style>
