<script lang="ts">
  import { ICONS } from "./icons.js";
  import type { IconName } from "./icons.js";

  export let name: IconName;
  export let size = 15;
  export let strokeWidth = 2.2;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each ICONS[name] as shape, i (i)}
    {#if shape.tag === "circle"}
      <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    {:else if shape.tag === "line"}
      <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
    {:else if shape.tag === "path"}
      <path d={shape.d} />
    {:else if shape.tag === "polyline"}
      <polyline points={shape.points} />
    {/if}
  {/each}
</svg>
