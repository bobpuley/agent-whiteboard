<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { trapFocus } from "./lib/trapFocus";
  import { readManifestFromZip } from "./lib/importFile";
  import type { ImportManifest } from "./lib/importFile";
  import { fetchAllSnapshots } from "./lib/fetchSnapshots";
  import { uploadImportZip } from "./lib/importActions";
  import type { ImportUploadResult } from "./lib/importActions";

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void; imported: void }>();

  let manifest: ImportManifest | null = null;
  let selectedFile: File | null = null;
  let errorMessage: string | null = null;
  let resolving = false;
  let dragOver = false;
  let fileInput: HTMLInputElement | undefined;

  // F38 — populated once a manifest resolves, to decide whether the target
  // workspace name collides with one that already exists.
  let existingWorkspaceNames: string[] = [];
  let checkingCollision = false;
  let collisionDecision: "prompt" | null = null;
  let newNameInput = "";

  let busy = false;
  let result: Extract<ImportUploadResult, { ok: true }> | null = null;

  $: if (!open) resetState();

  function resetState() {
    manifest = null;
    selectedFile = null;
    errorMessage = null;
    resolving = false;
    dragOver = false;
    existingWorkspaceNames = [];
    checkingCollision = false;
    collisionDecision = null;
    newNameInput = "";
    busy = false;
    result = null;
  }

  // Exposed so App.svelte's page-level drop target (F37) can hand off a file
  // dropped anywhere on the app, not just onto this modal's own drop-zone —
  // the component is always mounted (open just toggles its own internal
  // {#if}), so this works whether or not the modal is visible yet.
  export async function acceptFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      errorMessage = "please select a .zip file exported from this app";
      manifest = null;
      return;
    }
    resolving = true;
    errorMessage = null;
    const readResult = await readManifestFromZip(file);
    resolving = false;
    if (!readResult.ok) {
      errorMessage = readResult.error;
      manifest = null;
      return;
    }
    manifest = readResult.manifest;
    selectedFile = file;
    await resolveCollision(readResult.manifest.workspace);
  }

  // F38 — checks the resolved workspace name against the already-loaded
  // workspace list before any upload, so the collision prompt (or the
  // straight-to-import path) can render immediately.
  async function resolveCollision(workspaceName: string) {
    checkingCollision = true;
    const snapshotsResult = await fetchAllSnapshots();
    checkingCollision = false;
    existingWorkspaceNames = snapshotsResult.ok ? snapshotsResult.workspaces.map((w) => w.name) : [];

    if (existingWorkspaceNames.includes(workspaceName)) {
      newNameInput = suggestNewName(workspaceName, existingWorkspaceNames);
      collisionDecision = "prompt";
      return;
    }
    // No collision — skip straight to import (F38 DoD).
    await runImport(workspaceName, "create");
  }

  function suggestNewName(base: string, existing: string[]): string {
    let n = 2;
    let candidate = `${base} (${n})`;
    while (existing.includes(candidate)) {
      n++;
      candidate = `${base} (${n})`;
    }
    return candidate;
  }

  async function confirmMerge() {
    if (!manifest) return;
    collisionDecision = null;
    await runImport(manifest.workspace, "merge");
  }

  async function confirmImportAsNew() {
    const name = newNameInput.trim();
    if (!name) return;
    collisionDecision = null;
    await runImport(name, "create");
  }

  function cancelCollision() {
    resetState();
  }

  async function runImport(targetWorkspace: string, mode: "create" | "merge") {
    if (!selectedFile) return;
    busy = true;
    errorMessage = null;
    const uploadResult = await uploadImportZip(selectedFile, targetWorkspace, mode);
    busy = false;
    if (!uploadResult.ok) {
      errorMessage = uploadResult.error;
      return;
    }
    result = uploadResult;
    dispatch("imported");
  }

  function onFileInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void acceptFile(file);
    input.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) void acceptFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function onDragLeave() {
    dragOver = false;
  }

  function close() {
    dispatch("close");
  }
</script>

{#if open}
  <div class="modal-overlay" on:click|self={close}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Import workspace"
      tabindex="-1"
      use:trapFocus={{ onEscape: close }}
    >
      <div class="modal-header">
        <span class="modal-title">Import workspace</span>
        <button class="modal-close-btn" on:click={close} aria-label="Close">&#10005;</button>
      </div>

      <div class="modal-body">
        {#if errorMessage}
          <p class="modal-error">{errorMessage}</p>
        {/if}

        {#if result}
          <div class="modal-confirm">
            <span class="check-circle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span>
              Imported into <strong>{result.workspace}</strong> —
              {result.added} added, {result.updated} updated, {result.skipped} skipped
            </span>
          </div>
        {:else if collisionDecision === "prompt" && manifest}
          <p class="import-resolved">
            A workspace named <strong>{manifest.workspace}</strong> already exists.
          </p>
          <div class="collision-actions">
            <button class="collision-btn" disabled={busy} on:click={confirmMerge}>Merge</button>
            <div class="collision-new">
              <input
                type="text"
                bind:value={newNameInput}
                aria-label="New workspace name"
                disabled={busy}
              />
              <button class="collision-btn" disabled={busy || newNameInput.trim().length === 0} on:click={confirmImportAsNew}>
                Import as new
              </button>
            </div>
            <button class="collision-btn collision-cancel" disabled={busy} on:click={cancelCollision}>Cancel</button>
          </div>
        {:else if manifest}
          <p class="import-resolved">
            Workspace: <strong>{manifest.workspace}</strong>
            ({manifest.snapshots.length} snapshot{manifest.snapshots.length === 1 ? "" : "s"})
          </p>
          {#if checkingCollision || busy}
            <p class="modal-step-hint">{busy ? "Importing…" : "Checking for existing workspaces…"}</p>
          {/if}
        {:else}
          <div
            class="drop-zone"
            class:drag-over={dragOver}
            on:drop={onDrop}
            on:dragover={onDragOver}
            on:dragleave={onDragLeave}
            role="button"
            tabindex="0"
            on:click={() => fileInput?.click()}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInput?.click();
            }}
          >
            {#if resolving}
              <p>Reading…</p>
            {:else}
              <p>Drop a <code>.zip</code> file here, or click to choose one</p>
            {/if}
          </div>
          <input
            bind:this={fileInput}
            type="file"
            accept=".zip"
            class="visually-hidden-input"
            aria-label="Choose a .zip file to import"
            on:change={onFileInputChange}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--board-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
  }

  .modal {
    background: var(--board-bg);
    width: 420px;
    max-width: calc(100vw - 40px);
    max-height: 80vh;
    border-radius: 8px;
    box-shadow: 0 8px 30px var(--board-shadow-modal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--board-border-light);
    border-top: 3px solid var(--board-accent);
  }

  .modal-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: var(--board-text);
  }

  .modal-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--board-text-muted);
    padding: 2px 6px;
    border-radius: 3px;
    line-height: 1;
  }

  .modal-close-btn:hover {
    background: var(--board-bg-hover);
    color: var(--board-text);
  }

  .modal-body {
    padding: 14px 16px;
    overflow-y: auto;
    flex: 1;
  }

  .modal-error {
    color: var(--board-danger-dark);
    font-size: 12px;
    margin: 0 0 10px;
  }

  .import-resolved {
    font-size: 13px;
    color: var(--board-text);
    margin: 0;
  }

  .drop-zone {
    border: 2px dashed var(--board-border-mid);
    border-radius: 6px;
    padding: 32px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--board-text-secondary);
    cursor: pointer;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    background: var(--board-bg-hover);
    border-color: var(--board-accent);
  }

  .drop-zone code {
    background: var(--board-bg-panel);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .visually-hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .modal-step-hint {
    font-size: 12px;
    color: var(--board-text-faint);
    margin: 8px 0 0;
  }

  .collision-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }

  .collision-btn {
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--board-border-mid);
    background: var(--board-bg);
    color: var(--board-text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .collision-btn:hover:not(:disabled) {
    background: var(--board-bg-hover);
  }

  .collision-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .collision-new {
    display: flex;
    gap: 8px;
  }

  .collision-new input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--board-border-mid);
    background: var(--board-bg);
    color: var(--board-text);
    font-size: 13px;
  }

  .collision-cancel {
    color: var(--board-text-secondary);
    border-color: var(--board-border-mid);
    background: none;
  }

  .modal-confirm {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 30px 16px;
    color: var(--board-text);
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
    background: var(--board-accent);
  }
</style>
