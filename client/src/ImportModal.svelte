<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { trapFocus } from "./lib/trapFocus";
  import { readManifestFromZip } from "./lib/importFile";
  import type { ImportManifest } from "./lib/importFile";

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let manifest: ImportManifest | null = null;
  let errorMessage: string | null = null;
  let resolving = false;
  let dragOver = false;
  let fileInput: HTMLInputElement | undefined;

  $: if (!open) resetState();

  function resetState() {
    manifest = null;
    errorMessage = null;
    resolving = false;
    dragOver = false;
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
    const result = await readManifestFromZip(file);
    resolving = false;
    if (!result.ok) {
      errorMessage = result.error;
      manifest = null;
      return;
    }
    manifest = result.manifest;
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

        {#if manifest}
          <p class="import-resolved">
            Workspace: <strong>{manifest.workspace}</strong>
            ({manifest.snapshots.length} snapshot{manifest.snapshots.length === 1 ? "" : "s"})
          </p>
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
</style>
