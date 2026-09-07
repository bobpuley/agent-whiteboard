import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const CLIENT_PORT = parseInt(process.env.CLIENT_PORT ?? "5173", 10);
const SERVER_PORT = parseInt(process.env.PORT ?? "3000", 10);
const SERVER_HTTP_TARGET = `http://localhost:${SERVER_PORT}`;
const SERVER_WS_TARGET = `ws://localhost:${SERVER_PORT}`;

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [svelte({ preprocess: vitePreprocess() })],
  server: {
    port: CLIENT_PORT,
    proxy: {
      "/user-done": SERVER_HTTP_TARGET,
      "/render": SERVER_HTTP_TARGET,
      "/clear": SERVER_HTTP_TARGET,
      "/export": SERVER_HTTP_TARGET,
      "/step": SERVER_HTTP_TARGET,
      "/seek": SERVER_HTTP_TARGET,
      "/node-click": SERVER_HTTP_TARGET,
      "/wait-click": SERVER_HTTP_TARGET,
      "/snapshots": SERVER_HTTP_TARGET,
      "/viewport": SERVER_HTTP_TARGET,
      "/mcp": SERVER_HTTP_TARGET,
      // WebSocket proxy requires ws: true — HTTP proxy alone does not cover WS connections.
      "/stream": {
        target: SERVER_WS_TARGET,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
