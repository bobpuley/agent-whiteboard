import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
