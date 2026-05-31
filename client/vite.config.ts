import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    port: 5173,
    proxy: {
      "/render": "http://localhost:3000",
      "/clear": "http://localhost:3000",
      "/export": "http://localhost:3000",
      "/mcp": "http://localhost:3000",
      // WebSocket proxy requires ws: true — HTTP proxy alone does not cover WS connections.
      "/stream": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
