import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    port: 5173,
    proxy: {
      "/user-done": "http://localhost:3000",
      "/render": "http://localhost:3000",
      "/clear": "http://localhost:3000",
      "/export": "http://localhost:3000",
      "/step": "http://localhost:3000",
      "/node-click": "http://localhost:3000",
      "/wait-click": "http://localhost:3000",
      "/snapshots": "http://localhost:3000",
      "/viewport": "http://localhost:3000",
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
