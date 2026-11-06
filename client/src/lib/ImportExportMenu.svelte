<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import Icon from "./Icon.svelte";

  // F41/F42 — single toolbar button opening an ARIA menu with Export… / Import….
  const dispatch = createEventDispatcher<{ export: void; import: void }>();

  let open = false;
  let root: HTMLElement;
  let button: HTMLButtonElement;
  let items: HTMLButtonElement[] = [];

  async function openMenu(focusIndex = 0) {
    open = true;
    await tick();
    items[focusIndex]?.focus();
  }

  function closeMenu(returnFocus: boolean) {
    if (!open) return;
    open = false;
    if (returnFocus) button?.focus();
  }

  function onButtonKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      void openMenu(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      void openMenu(1);
    }
  }

  function onMenuKeydown(e: KeyboardEvent) {
    const current = items.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(current + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  }

  function choose(kind: "export" | "import") {
    closeMenu(false);
    if (kind === "export") dispatch("export");
    else dispatch("import");
  }

  function onWindowPointerDown(e: Event) {
    if (open && root && !root.contains(e.target as Node)) closeMenu(false);
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:mousedown={onWindowPointerDown} />

<div class="io-menu" bind:this={root}>
  <button
    bind:this={button}
    class="panel-icon-btn io-btn"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Import / export"
    title="Import / export"
    on:click={() => (open ? closeMenu(false) : void openMenu(0))}
    on:keydown={onButtonKeydown}
  >
    <Icon name="transfer" />
  </button>
  {#if open}
    <!-- svelte-ignore a11y-interactive-supports-focus -->
    <div class="io-popover" role="menu" aria-label="Import / export" on:keydown={onMenuKeydown}>
      <button bind:this={items[0]} class="io-item" type="button" role="menuitem" tabindex="-1" on:click={() => choose("export")}>
        <Icon name="export" size={14} /><span>Export…</span>
      </button>
      <button bind:this={items[1]} class="io-item" type="button" role="menuitem" tabindex="-1" on:click={() => choose("import")}>
        <Icon name="import" size={14} /><span>Import…</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .io-menu { position: relative; display: flex; }
  .io-menu .io-btn { flex: 1; padding: 6px 8px; border: 1px solid var(--board-border-mid); border-radius: 4px;
    background: var(--board-bg); cursor: pointer; color: var(--board-text-secondary); transition: background 0.1s;
    line-height: 1; display: flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; }
  .io-btn:hover, .io-btn[aria-expanded="true"] { background: var(--board-accent-bg); border-color: var(--board-accent); color: var(--board-accent); }
  .io-popover { position: absolute; right: calc(100% + 8px); top: 0; min-width: 150px; background: var(--board-bg);
    border: 1px solid var(--board-border); border-radius: 6px; box-shadow: 0 4px 12px var(--board-shadow-panel); padding: 4px; z-index: 60; }
  .io-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: 0; background: none;
    color: var(--board-text); font-size: 13px; text-align: left; border-radius: 4px; cursor: pointer; }
  .io-item:hover, .io-item:focus { background: var(--board-accent-bg); color: var(--board-accent); outline: none; }
  .io-item:focus-visible { outline: 2px solid var(--board-accent); outline-offset: -2px; }
</style>
