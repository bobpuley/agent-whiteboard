import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // "browser" resolve condition forces Svelte's client (DOM) runtime instead
  // of the SSR build vitest would otherwise pick — without it, component
  // lifecycle hooks (onMount, bind:this) never run under @testing-library/svelte.
  resolve: { conditions: ["browser"] },
  plugins: [svelte({ preprocess: vitePreprocess(), hot: false })],
  test: {
    include: ["tests/unit/server/**/*.test.ts", "tests/unit/client/**/*.test.ts"],
  },
});
