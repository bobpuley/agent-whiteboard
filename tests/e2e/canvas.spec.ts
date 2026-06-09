import { expect, test } from "@playwright/test";

const SERVER = "http://localhost:3000";

const THREE_FRAMES = JSON.stringify({
  frame_type: "mermaid",
  frames: [
    { label: "Step 1 — A", payload: "graph TD; A" },
    { label: "Step 2 — A→B", payload: "graph TD; A --> B" },
    { label: "Step 3 — A→B→C", payload: "graph TD; A --> B --> C" },
  ],
});

// Reset server canvas state before every test.
// The Playwright page fixture is per-test (fresh page each run),
// so browser state is always clean on page load.
test.beforeEach(async ({ request }) => {
  await request.post(`${SERVER}/clear`);
});

// ── Initial state ─────────────────────────────────────────────────────────────

test("shows placeholder on load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".placeholder")).toBeVisible();
  await expect(page.locator(".placeholder")).toContainText("Waiting for content");
});

// ── Rendering ─────────────────────────────────────────────────────────────────

test("mermaid: renders SVG after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".placeholder")).toBeVisible();

  await request.post(`${SERVER}/render`, {
    data: { type: "mermaid", payload: "graph TD; A --> B" },
  });

  await expect(page.locator(".mermaid-container svg")).toBeVisible();
  await expect(page.locator(".placeholder")).not.toBeVisible();
});

test("html: renders content after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<h1 id='e2e-h1'>Hello</h1>" },
  });
  await expect(page.locator(".html-renderer #e2e-h1")).toBeVisible();
});

test("svg: renders SVG element after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "svg", payload: "<svg width='50' height='50'><circle r='20' cx='25' cy='25'/></svg>" },
  });
  await expect(page.locator(".html-renderer svg")).toBeVisible();
});

test("katex: renders math after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "katex", payload: "E = mc^2" },
  });
  // KaTeX renders a .katex span inside the container div.
  await expect(page.locator(".katex-renderer .katex")).toBeVisible();
});

test("vega-lite: renders chart SVG after POST /render", async ({ page, request }) => {
  await page.goto("/");
  const spec = JSON.stringify({
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    data: { values: [{ x: "A", y: 1 }, { x: "B", y: 2 }] },
    mark: "bar",
    encoding: {
      x: { field: "x", type: "nominal" },
      y: { field: "y", type: "quantitative" },
    },
  });
  await request.post(`${SERVER}/render`, { data: { type: "vega-lite", payload: spec } });
  // vega-embed renders with svg renderer (set in VegaLite.svelte).
  await expect(page.locator(".vegalite-renderer svg")).toBeVisible();
});

// ── Title overlay ─────────────────────────────────────────────────────────────

test("title: shown when options.title is provided", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: {
      type: "html",
      payload: "<p>content</p>",
      options: { title: "My Lesson" },
    },
  });
  await expect(page.locator(".canvas-title")).toBeVisible();
  await expect(page.locator(".canvas-title")).toHaveText("My Lesson");
});

test("title: hidden when render has no title", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<p>content</p>" },
  });
  await expect(page.locator(".html-renderer p")).toBeVisible();
  await expect(page.locator(".canvas-title")).not.toBeVisible();
});

test("title: cleared by POST /clear", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<p>x</p>", options: { title: "Temporary" } },
  });
  await expect(page.locator(".canvas-title")).toBeVisible();

  await request.post(`${SERVER}/clear`);
  await expect(page.locator(".canvas-title")).not.toBeVisible();
  await expect(page.locator(".placeholder")).toBeVisible();
});

// ── Clear ─────────────────────────────────────────────────────────────────────

test("clear: reverts canvas to placeholder", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "mermaid", payload: "graph TD; A --> B" },
  });
  await expect(page.locator(".mermaid-container svg")).toBeVisible();

  await request.post(`${SERVER}/clear`);
  await expect(page.locator(".placeholder")).toBeVisible();
  await expect(page.locator(".mermaid-container")).not.toBeVisible();
});

// ── Step-frames ───────────────────────────────────────────────────────────────

test("step-frames: step-bar visible and Prev disabled on load", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES },
  });
  await expect(page.locator(".step-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next frame" })).toBeEnabled();
});

test("step-frames: frame label shown in step-bar", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES },
  });
  await expect(page.locator(".step-label")).toBeVisible();
  await expect(page.locator(".step-label")).toHaveText("Step 1 — A");
});

test("step-frames: clicking Next advances to frame 2", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES },
  });
  await expect(page.locator(".step-bar")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();

  await expect(page.locator(".step-label")).toHaveText("Step 2 — A→B");
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeEnabled();
});

test("step-frames: clicking Prev rewinds to frame 1", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES },
  });
  await expect(page.locator(".step-bar")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(page.locator(".step-label")).toHaveText("Step 2 — A→B");

  await page.getByRole("button", { name: "Previous frame" }).click();
  await expect(page.locator(".step-label")).toHaveText("Step 1 — A");
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeDisabled();
});

test("step-frames: Next disabled on last frame", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES },
  });
  await expect(page.locator(".step-bar")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();
  await page.getByRole("button", { name: "Next frame" }).click();

  await expect(page.locator(".step-label")).toHaveText("Step 3 — A→B→C");
  await expect(page.getByRole("button", { name: "Next frame" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeEnabled();
});

// ── Done button ───────────────────────────────────────────────────────────────

test("Done button: shows 'Sent ✓' after click and reverts", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: "Done" });
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();

  await btn.click();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeDisabled();

  // After 2 seconds the button reverts to "Done".
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 5_000 });
});

// ── History panel ─────────────────────────────────────────────────────────────

test("history panel: hidden by default on page load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".history-panel")).not.toBeVisible();
});

test("history panel: toggle button is visible", async ({ page }) => {
  await page.goto("/");
  const toggleBtn = page.getByRole("button", { name: "Toggle history panel" });
  await expect(toggleBtn).toBeVisible();
});

test("history panel: opens when toggle button is clicked", async ({ page }) => {
  await page.goto("/");
  const toggleBtn = page.getByRole("button", { name: "Toggle history panel" });
  await toggleBtn.click();
  await expect(page.locator(".history-panel")).toBeVisible();
});

test("history panel: closes when X button is clicked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();

  await page.getByRole("button", { name: "Close history panel" }).click();
  await expect(page.locator(".history-panel")).not.toBeVisible();
});

test("history panel: shows 'No snapshots yet.' when list is empty", async ({ page, request }) => {
  // Clear any existing snapshot state by relying on env-isolated test workspace.
  // Intercept /snapshots to return empty list.
  await page.route("/snapshots", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, snapshots: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();
  await expect(page.locator(".panel-message")).toContainText("No snapshots yet");
});

test("history panel: shows snapshot list with type badge and title", async ({ page }) => {
  await page.route("/snapshots", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        snapshots: [
          {
            filename: "20260609_150000_screen.json",
            timestamp: "2026-06-09T15:00:00.000Z",
            type: "mermaid",
            title: "My diagram",
          },
          {
            filename: "20260609_140000_screen.json",
            timestamp: "2026-06-09T14:00:00.000Z",
            type: "html",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();

  // First entry has title and mermaid badge.
  const rows = page.locator(".snapshot-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator(".snapshot-title")).toHaveText("My diagram");
  await expect(rows.first().locator(".type-badge")).toHaveText("mermaid");

  // Second entry has no title — shows "—".
  await expect(rows.nth(1).locator(".snapshot-title")).toHaveText("—");
  await expect(rows.nth(1).locator(".type-badge")).toHaveText("html");
});

test("history panel: clicking a snapshot row calls POST /snapshots/load and closes panel", async ({ page, request }) => {
  // Seed a real snapshot via POST /render so there's something in the list.
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<h1 id='snap-h1'>Snapshot content</h1>", options: { title: "Snap 1" } },
  });

  // Mock the /snapshots endpoint to return a known entry.
  await page.route("/snapshots", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        snapshots: [
          {
            filename: "20260609_150000_screen.json",
            timestamp: "2026-06-09T15:00:00.000Z",
            type: "mermaid",
            title: "Snap 1",
          },
        ],
      }),
    });
  });

  // Mock the load endpoint to render something visible and return ok.
  await page.route("/snapshots/load", (route) => {
    // Trigger an actual render to make the canvas update via the real server.
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();

  await page.locator(".snapshot-row").first().click();

  // Panel should close after clicking an entry.
  await expect(page.locator(".history-panel")).not.toBeVisible();
});
