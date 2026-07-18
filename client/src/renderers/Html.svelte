<script lang="ts">
  import DOMPurify from "dompurify";
  import { onMount, afterUpdate } from "svelte";
  import { scopeCss } from "../lib/scopeCss.js";

  export let source: string;
  export let type: "svg" | "html";

  let container: HTMLDivElement;
  let lastRendered: string | null = null;

  const BOOTSTRAP_STYLE_ID = "bootstrap-house-style";
  const BOOTSTRAP_ANCHOR_ID = "html-renderer-root";

  // Loaded lazily on first "html"-type mount, never for "svg" (FR25, v0.31
  // Sprint 71) — same lazy-load precedent as Mermaid/KaTeX/Vega-Embed
  // (NF13, registry.ts): a one-time delay on first use is an accepted
  // trade-off for not eagerly bundling a stylesheet most sessions never need.
  let bootstrapPromise: Promise<string> | null = null;

  // Bootstrap's color system (alert/badge/table variants, etc.) is defined
  // almost entirely via CSS custom properties set on `:root`. `@scope` only
  // matches elements within the scope root's own subtree — `:root` (the
  // `<html>` element) is an ancestor of the scope root, never a descendant,
  // so a bare `:root` rule inside `@scope (#anchor) { ... }` never matches
  // and its custom properties are silently never set. `:scope`, inside an
  // `@scope` block, refers to the scope root element itself — properties
  // set there still inherit normally to every descendant. Without this
  // rewrite, colors/backgrounds silently fall back to initial values while
  // non-variable properties (padding, etc.) keep working, producing
  // unstyled-looking Bootstrap components with no error. Found via manual
  // browser verification, v0.31 Sprint 71.
  function loadBootstrapCss(): Promise<string> {
    if (!bootstrapPromise) {
      bootstrapPromise = import("bootstrap/dist/css/bootstrap.min.css?inline").then((mod) =>
        mod.default.replace(/:root/g, ":scope")
      );
    }
    return bootstrapPromise;
  }

  async function ensureBootstrapInjected() {
    if (document.getElementById(BOOTSTRAP_STYLE_ID)) return;
    const css = await loadBootstrapCss();
    if (document.getElementById(BOOTSTRAP_STYLE_ID)) return; // injected by a concurrent mount while awaiting
    const styleEl = document.createElement("style");
    styleEl.id = BOOTSTRAP_STYLE_ID;
    // Scoped to this component's own container so bare-element rules
    // (table, h1-h6, etc.) never affect the rest of the app's chrome.
    styleEl.textContent = scopeCss(css, [BOOTSTRAP_ANCHOR_ID]);
    document.head.appendChild(styleEl);
  }

  function render(src: string) {
    if (!container) return;
    if (type === "html") void ensureBootstrapInjected();
    // Silent sanitization: DOMPurify strips malicious markup; cleaned output is rendered.
    const clean = DOMPurify.sanitize(src, {
      // Allow SVG elements and attributes when type is svg.
      USE_PROFILES: type === "svg" ? { svg: true, svgFilters: true } : { html: true },
    });
    container.innerHTML = clean;
  }

  onMount(() => {
    render(source);
    lastRendered = source;
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      lastRendered = source;
      render(source);
    }
  });
</script>

<div class="html-renderer" id="html-renderer-root" bind:this={container}></div>

<style>
  .html-renderer {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .html-renderer :global(svg) {
    max-width: 100%;
    height: auto;
  }
</style>
