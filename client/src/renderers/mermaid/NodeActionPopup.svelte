<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { PopupRequest } from "./nodeInteractions";

  export let popup: PopupRequest | null = null;

  const dispatch = createEventDispatcher<{ select: string; dismiss: void }>();
</script>

{#if popup}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="popup-backdrop" on:click={() => dispatch("dismiss")}></div>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="node-action-popup"
    style="position: fixed; left: {popup.x}px; top: {popup.y}px;"
    on:click|stopPropagation={() => {}}
  >
    {#each popup.actions as action, i (i)}
      <div
        class="popup-item"
        role="button"
        tabindex="0"
        on:click={() => dispatch("select", action)}
        on:keydown={(e) => e.key === "Enter" && dispatch("select", action)}
      >
        {action}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Transparent backdrop — covers the whole viewport to catch outside clicks. */
  .popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  /* Floating popup menu. */
  .node-action-popup {
    z-index: 100;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    min-width: 140px;
    overflow: hidden;
    transform: translate(4px, 4px); /* slight offset from cursor */
  }

  .popup-item {
    padding: 9px 16px;
    font-size: 13px;
    color: #222;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  .popup-item:hover {
    background: #f0f5ff;
    color: #1a6ec7;
  }

  .popup-item + .popup-item {
    border-top: 1px solid #f0f0f0;
  }
</style>
