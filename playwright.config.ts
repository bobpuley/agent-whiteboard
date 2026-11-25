import { defineConfig } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: isCI ? 2 : 0,
  forbidOnly: isCI,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    trace: "on-first-retry",
  },
  // Both servers must be ready before tests run: specs call the API on :3000
  // (POST /clear in beforeEach) while the page is served by Vite on :5173.
  webServer: [
    {
      command: "npx tsx server/index.ts",
      port: 3000,
      reuseExistingServer: !isCI,
      timeout: isCI ? 120_000 : 30_000,
    },
    {
      command: "npm run dev:client",
      url: "http://localhost:5173",
      reuseExistingServer: !isCI,
      timeout: isCI ? 120_000 : 30_000,
    },
  ],
});
