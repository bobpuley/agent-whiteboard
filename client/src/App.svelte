<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { ComponentType, SvelteComponent } from "svelte";
  import HistoryPanel from "./HistoryPanel.svelte";
  import DeleteExportModal from "./DeleteExportModal.svelte";
  import Icon from "./lib/Icon.svelte";
  import { canvasStore } from "./stores/canvasStore.js";
  import { doneStore } from "./stores/doneStore.js";
  import { modalStore } from "./stores/modalStore.js";
  import { themeStore } from "./stores/themeStore.js";
  import { stepNav } from "./stores/stepNav.js";
  import { disconnected, reconnectExhausted, initRouter } from "./stores/wsRouter.js";
  import { rendererRegistry } from "./renderers/registry.js";
  import type { RendererKey } from "./renderers/registry.js";

  $: ({ presentation, driver, placeholder, currentFrame, totalFrames, viewport, nodeToFrame, clickable, nodeActions, nodeToFrameEnabled } = $canvasStore);

  // Renderer registry wiring (v0.24, U6 in docs/04_architecture.md §9): looks
  // up and caches the component for the current canvas type via the registry's
  // async `load()` (see registry.ts for why that's a resolved promise, not a
  // dynamic import(), for today's renderer types). `loadToken` guards against
  // an older in-flight load landing after a newer type change superseded it —
  // relevant for any future renderer type whose `load()` is genuinely async.
  const componentCache = new Map<RendererKey, ComponentType<SvelteComponent>>();
  let currentComponent: ComponentType<SvelteComponent> | undefined;
  let currentComponentType: RendererKey | undefined;
  let loadToken = 0;

  $: rendererKey = placeholder !== null ? "step-frames-placeholder" : presentation?.frames[0]?.type as RendererKey | undefined;
  $: void loadRenderer(rendererKey);

  async function loadRenderer(key: RendererKey | undefined) {
    if (key === undefined) {
      currentComponent = undefined;
      currentComponentType = undefined;
      return;
    }
    const cached = componentCache.get(key);
    if (cached) {
      currentComponent = cached;
      currentComponentType = key;
      return;
    }
    const token = ++loadToken;
    const Component = await rendererRegistry[key].load();
    if (token !== loadToken) return;
    componentCache.set(key, Component);
    currentComponent = Component;
    currentComponentType = key;
  }

  // Only compute props once currentComponentType actually matches the live
  // rendererKey — the same guard the template below uses to decide whether to
  // render at all. Without it, a stale-but-still-cached currentComponentType
  // (e.g. "mermaid" from before a clear()/WS-disconnect reset presentation to
  // null) recomputes props eagerly against content that's no longer there.
  // registry.ts's RendererContext requires a non-null presentation (NF40) —
  // canvasStore guarantees presentation/placeholder are mutually exclusive,
  // so this null check is what lets that type hold without a `!` on the
  // registry side.
  $: rendererProps = (() => {
    if (!currentComponentType || currentComponentType !== rendererKey) return {};
    if (currentComponentType === "step-frames-placeholder") {
      return placeholder ? rendererRegistry["step-frames-placeholder"].props({ placeholder }) : {};
    }
    if (!presentation) return {};
    return rendererRegistry[currentComponentType].props({
      presentation,
      clickable,
      nodeActions,
      nodeToFrameEnabled,
      nodeToFrame,
      viewport,
      currentFrame: currentFrame ?? 0,
    });
  })();

  let cleanup: (() => void) | null = null;

  onMount(() => {
    cleanup = initRouter();
  });

  onDestroy(() => {
    cleanup?.();
  });

  let historyOpen = false;
  let historyPanelRef: HistoryPanel;

  function handleModalDeleted() {
    if (historyOpen) historyPanelRef?.fetchSnapshots();
  }
</script>

<HistoryPanel bind:this={historyPanelRef} bind:open={historyOpen} on:close={() => { historyOpen = false; }} />

<DeleteExportModal
  mode={$modalStore.mode ?? "delete"}
  open={$modalStore.mode !== null}
  workspaces={$modalStore.workspaces}
  loadError={$modalStore.loadError}
  on:close={modalStore.close}
  on:deleted={handleModalDeleted}
/>

<main>
  {#if $disconnected}
    <div class="banner" role="alert" aria-live="assertive">
      {#if $reconnectExhausted}
        Server disconnected. Restart <code>npm run dev</code>.
      {:else}
        Server disconnected. Reconnecting…
      {/if}
    </div>
  {/if}

  <div class="canvas-frame">
    {#if presentation !== null && presentation.title}
      <header class="canvas-title">{presentation.title}</header>
    {/if}

    <div class="canvas">
      {#if presentation === null && placeholder === null}
        <p class="placeholder">Waiting for content…</p>
      {:else if currentComponent && currentComponentType === rendererKey}
        <svelte:component this={currentComponent} {...rendererProps} />
      {/if}
    </div>
  </div>

  {#if presentation !== null && driver === "manual"}
    <div class="step-bar">
      <button
        class="step-btn"
        on:click={() => stepNav("prev")}
        aria-label="Previous frame"
        disabled={currentFrame === 0}
      >&#8592; Prev</button>
      {#if presentation.frames[0].label}
        <span class="step-label">{presentation.frames[0].label}</span>
      {/if}
      <button
        class="step-btn"
        on:click={() => stepNav("next")}
        aria-label="Next frame"
        disabled={totalFrames !== undefined && currentFrame === totalFrames - 1}
      >Next &#8594;</button>
    </div>
  {/if}

  <div class="controls-panel">
    <button
      class="panel-icon-btn"
      on:click={themeStore.toggle}
      aria-label={$themeStore === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={$themeStore === "dark"}
      title={$themeStore === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {#if $themeStore === "dark"}
        <Icon name="sun" />
      {:else}
        <Icon name="moon" />
      {/if}
    </button>

    <div class="panel-sep"></div>

    <button class="panel-icon-btn" on:click={() => { historyOpen = !historyOpen; }} aria-label="Toggle history panel" aria-pressed={historyOpen} title="History">
      <Icon name="history" />
    </button>

    <div class="panel-sep"></div>

    <button class="panel-icon-btn delete-btn" on:click={() => modalStore.open("delete")} aria-label="Delete snapshots" title="Delete snapshots">
      <Icon name="trash" />
    </button>
    <button class="panel-icon-btn export-btn" on:click={() => modalStore.open("export")} aria-label="Export snapshots" title="Export snapshots to HTML">
      <Icon name="export" />
    </button>

    {#if $doneStore.armed || $doneStore.sent || $doneStore.error}
      <div class="panel-sep"></div>
      <button class="done-btn" class:done-btn-error={$doneStore.error} on:click={doneStore.handleDone} disabled={$doneStore.sent} title={$doneStore.error ? "Failed to send — click to retry" : "Done"} aria-live="polite">
        {#if $doneStore.sent}
          Sent ✓
        {:else if $doneStore.error}
          Failed ✗
        {:else}
          <Icon name="check" size={16} strokeWidth={2.5} />
        {/if}
      </button>
    {/if}
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--board-bg);
    font-family: sans-serif;
  }

  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 20px;
    box-sizing: border-box;
  }

  .banner {
    background: #c0392b;
    color: #fff;
    padding: 10px 16px;
    font-size: 14px;
    text-align: center;
    margin-bottom: 12px;
    border-radius: 4px;
  }

  .banner code {
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .canvas-frame {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--board-border);
    border-radius: 6px;
    overflow: hidden;
    min-height: 0;
  }

  .canvas-title {
    padding: 10px 20px;
    font-size: 15px;
    font-weight: 600;
    color: var(--board-text);
    border-bottom: 1px solid var(--board-border-light);
    background: var(--board-bg-panel);
    user-select: none;
  }

  .canvas {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--board-canvas-bg);
  }

  .placeholder {
    color: var(--board-text-secondary);
    font-size: 16px;
    user-select: none;
  }

  .step-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 10px 16px;
    background: var(--board-bg-panel);
    border-top: 1px solid var(--board-border-faint);
  }

  .step-btn {
    padding: 6px 16px;
    border: 1px solid var(--board-border-mid);
    border-radius: 4px;
    background: var(--board-bg);
    color: var(--board-text);
    cursor: pointer;
    font-size: 14px;
  }

  .step-btn:hover:not(:disabled) {
    background: var(--board-bg-hover);
  }

  .step-btn:disabled {
    color: var(--board-text-subtlest);
    border-color: var(--board-border-faint);
    cursor: default;
  }

  .step-label {
    font-size: 14px;
    color: var(--board-text-secondary);
    flex: 1;
    text-align: center;
  }

  .controls-panel {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 8px;
    background: var(--board-bg);
    border: 1px solid var(--board-border);
    border-right: none;
    border-radius: 6px 0 0 6px;
    box-shadow: -2px 0 8px var(--board-shadow-controls);
    z-index: 50;
  }

  .panel-icon-btn {
    padding: 6px 8px;
    border: 1px solid var(--board-border-mid);
    border-radius: 4px;
    background: var(--board-bg);
    cursor: pointer;
    font-size: 16px;
    color: var(--board-text-secondary);
    transition: background 0.1s;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
  }

  .panel-icon-btn:hover {
    background: var(--board-bg-hover);
  }

  .panel-icon-btn[aria-pressed="true"] {
    background: var(--board-accent-bg);
    border-color: var(--board-accent);
    color: var(--board-accent);
  }

  .panel-icon-btn.delete-btn:hover {
    background: var(--board-danger-bg);
    border-color: var(--board-danger);
    color: var(--board-danger);
  }

  .panel-icon-btn.export-btn:hover {
    background: var(--board-accent-bg);
    border-color: var(--board-accent);
    color: var(--board-accent);
  }

  .panel-sep {
    height: 1px;
    background: var(--board-border-light);
    margin: 2px 2px;
  }

  .done-btn {
    padding: 6px 8px;
    border: 1px solid var(--board-success);
    border-radius: 4px;
    background: var(--board-bg);
    color: var(--board-success);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.1s;
    min-width: 32px;
    min-height: 32px;
  }

  .done-btn:hover:not(:disabled) {
    background: var(--board-success-bg);
  }

  .done-btn:disabled {
    border-color: var(--board-text-subtle);
    color: var(--board-text-subtle);
    cursor: default;
  }

  .done-btn-error {
    border-color: var(--board-danger);
    color: var(--board-danger);
  }

  .done-btn-error:hover:not(:disabled) {
    background: var(--board-danger-bg);
  }
</style>
