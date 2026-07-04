import { expect, test } from "@playwright/test";

const SERVER = "http://localhost:3000";
const WS = "e2e-test";

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
    data: { type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WS } },
  });

  await expect(page.locator(".mermaid-container svg")).toBeVisible();
  await expect(page.locator(".placeholder")).not.toBeVisible();
});

test("html: renders content after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<h1 id='e2e-h1'>Hello</h1>", options: { workspace: WS } },
  });
  await expect(page.locator(".html-renderer #e2e-h1")).toBeVisible();
});

test("svg: renders SVG element after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "svg", payload: "<svg width='50' height='50'><circle r='20' cx='25' cy='25'/></svg>", options: { workspace: WS } },
  });
  await expect(page.locator(".html-renderer svg")).toBeVisible();
});

test("katex: renders math after POST /render", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "katex", payload: "E = mc^2", options: { workspace: WS } },
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
  await request.post(`${SERVER}/render`, { data: { type: "vega-lite", payload: spec, options: { workspace: WS } } });
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
      options: { workspace: WS, title: "My Lesson" },
    },
  });
  await expect(page.locator(".canvas-title")).toBeVisible();
  await expect(page.locator(".canvas-title")).toHaveText("My Lesson");
});

test("title: hidden when render has no title", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<p>content</p>", options: { workspace: WS } },
  });
  await expect(page.locator(".html-renderer p")).toBeVisible();
  await expect(page.locator(".canvas-title")).not.toBeVisible();
});

test("title: cleared by POST /clear", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<p>x</p>", options: { workspace: WS, title: "Temporary" } },
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
    data: { type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WS } },
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
    data: { type: "step-frames", payload: THREE_FRAMES, options: { workspace: WS } },
  });
  await expect(page.locator(".step-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next frame" })).toBeEnabled();
});

test("step-frames: frame label shown in step-bar", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES, options: { workspace: WS } },
  });
  await expect(page.locator(".step-label")).toBeVisible();
  await expect(page.locator(".step-label")).toHaveText("Step 1 — A");
});

test("step-frames: clicking Next advances to frame 2", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES, options: { workspace: WS } },
  });
  await expect(page.locator(".step-bar")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();

  await expect(page.locator(".step-label")).toHaveText("Step 2 — A→B");
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeEnabled();
});

test("step-frames: clicking Prev rewinds to frame 1", async ({ page, request }) => {
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: THREE_FRAMES, options: { workspace: WS } },
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
    data: { type: "step-frames", payload: THREE_FRAMES, options: { workspace: WS } },
  });
  await expect(page.locator(".step-bar")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();
  await page.getByRole("button", { name: "Next frame" }).click();

  await expect(page.locator(".step-label")).toHaveText("Step 3 — A→B→C");
  await expect(page.getByRole("button", { name: "Next frame" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous frame" })).toBeEnabled();
});

test("step-frames: a mixed mermaid+katex sequence renders each frame with its own renderer (v0.17)", async ({ page, request }) => {
  const mixedFrames = JSON.stringify({
    frame_type: "mermaid",
    frames: [
      { label: "Diagram", payload: "graph TD; A --> B" },
      { label: "Formula", payload: "E = mc^2", type: "katex" },
    ],
  });
  await page.goto("/");
  await request.post(`${SERVER}/render`, {
    data: { type: "step-frames", payload: mixedFrames, options: { workspace: WS } },
  });

  await expect(page.locator(".mermaid-container svg")).toBeVisible();

  await page.getByRole("button", { name: "Next frame" }).click();

  await expect(page.locator(".step-label")).toHaveText("Formula");
  await expect(page.locator(".katex-renderer .katex")).toBeVisible();
  await expect(page.locator(".mermaid-container svg")).not.toBeVisible();
});

// ── Done button ───────────────────────────────────────────────────────────────

test("Done button: hidden until wait_done() is armed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Done" })).not.toBeVisible();
});

test("Done button: shows 'Sent ✓' after click, then disappears (v0.12 conditional visibility)", async ({ page, request }) => {
  await page.goto("/");

  // wait_done() long-polls until clicked (or a 10-min timeout) — fire without awaiting.
  const waitDone = request.post(`${SERVER}/wait-done`);

  const btn = page.getByRole("button", { name: "Done" });
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();

  await btn.click();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeDisabled();

  // The button is un-armed by the click and disappears entirely after the
  // 2s "Sent ✓" confirmation window — it does not revert to a visible "Done".
  await expect(page.getByRole("button", { name: /Sent|Done/ })).not.toBeVisible({ timeout: 5_000 });

  await waitDone;
});

test("Done button: a failed POST /user-done shows an error and allows retry (B9)", async ({ page, request }) => {
  await page.goto("/");

  const waitDone = request.post(`${SERVER}/wait-done`);
  const btn = page.getByRole("button", { name: "Done" });
  await expect(btn).toBeVisible();

  // Simulate a network/server failure on the first click.
  let failNext = true;
  await page.route("**/user-done", (route) => {
    if (failNext) {
      failNext = false;
      return route.abort("failed");
    }
    return route.continue();
  });

  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await btn.click();
  await expect(page.getByRole("button", { name: /Failed/ })).toBeVisible();
  // Button must stay enabled so the user can retry — unlike the success path.
  await expect(page.getByRole("button", { name: /Failed/ })).toBeEnabled();

  // Error indicator clears after its timeout, reverting to the plain Done button.
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 5_000 });

  // Retry succeeds now that the route passes through.
  await btn.click();
  await expect(page.getByRole("button", { name: /Sent/ })).toBeVisible();

  expect(pageErrors).toEqual([]);
  await waitDone;
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

test("history panel: closes on Escape and traps Tab focus (B12)", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, workspaces: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  const panel = page.locator(".history-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("aria-modal", "true");

  // Focus starts inside the dialog (on the first focusable control).
  await expect(page.locator(".history-panel :focus")).toHaveCount(1);

  // Tabbing forward from the last focusable element wraps back to the first.
  const closeBtn = page.getByRole("button", { name: "Close history panel" });
  await closeBtn.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".history-panel :focus")).toHaveCount(1);
  const wrappedToPanel = await page.evaluate(() => document.activeElement?.closest(".history-panel") !== null);
  expect(wrappedToPanel).toBe(true);

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

test("delete/export modal: closes on Escape and traps Tab focus (B12)", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [{ name: "ws-a", isCurrent: true, snapshots: [] }, { name: "ws-b", isCurrent: false, snapshots: [] }],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Delete snapshots" }).click();
  const modal = page.locator(".modal");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".modal :focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
});

test("history panel: shows 'No snapshots yet.' when list is empty", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, workspaces: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();
  await expect(page.locator(".panel-message")).toContainText("No snapshots yet");
});

test("history panel: shows snapshot list with type badge and title", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "my-project",
            isCurrent: true,
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

test("history panel: clicking a snapshot row calls POST /snapshots/load with workspace+filename and closes panel", async ({ page, request }) => {
  await request.post(`${SERVER}/render`, {
    data: { type: "html", payload: "<h1 id='snap-h1'>Snapshot content</h1>", options: { title: "Snap 1" } },
  });

  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "my-project",
            isCurrent: true,
            snapshots: [
              {
                filename: "20260609_150000_screen.json",
                timestamp: "2026-06-09T15:00:00.000Z",
                type: "mermaid",
                title: "Snap 1",
              },
            ],
          },
        ],
      }),
    });
  });

  let loadBody: unknown;
  await page.route("/snapshots/load", async (route) => {
    loadBody = JSON.parse(route.request().postData() ?? "{}");
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

  await expect(page.locator(".history-panel")).not.toBeVisible();
  expect(loadBody).toMatchObject({ workspace: "my-project", filename: "20260609_150000_screen.json" });
});

// ── Sprint 18 — workspace accordion ──────────────────────────────────────────

test("history panel: accordion renders one section per workspace", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "project-a",
            isCurrent: false,
            snapshots: [{ filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "html" }],
          },
          {
            name: "project-b",
            isCurrent: true,
            snapshots: [{ filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid", title: "B diagram" }],
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();

  await expect(page.locator(".workspace-group")).toHaveCount(2);
  await expect(page.locator(".workspace-name").first()).toHaveText("project-a");
  await expect(page.locator(".workspace-name").nth(1)).toHaveText("project-b");
});

test("history panel: current workspace section is open, others are closed", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "other-project",
            isCurrent: false,
            snapshots: [{ filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "svg" }],
          },
          {
            name: "current-project",
            isCurrent: true,
            snapshots: [{ filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid" }],
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".history-panel")).toBeVisible();

  const groups = page.locator(".workspace-group");
  // other-project (isCurrent=false) must be closed.
  await expect(groups.first()).not.toHaveAttribute("open");
  // current-project (isCurrent=true) must be open.
  await expect(groups.nth(1)).toHaveAttribute("open");
});

test("history panel: current workspace shows 'current' badge", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "my-workspace",
            isCurrent: true,
            snapshots: [{ filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid" }],
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();
  await expect(page.locator(".current-badge")).toBeVisible();
  await expect(page.locator(".current-badge")).toHaveText("current");
});

test("history panel: cross-workspace load sends correct workspace in POST body", async ({ page }) => {
  await page.route("/snapshots/all", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        workspaces: [
          {
            name: "other-workspace",
            isCurrent: false,
            snapshots: [{ filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "mermaid", title: "Remote" }],
          },
          {
            name: "current-workspace",
            isCurrent: true,
            snapshots: [{ filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid" }],
          },
        ],
      }),
    });
  });

  let loadBody: unknown;
  await page.route("/snapshots/load", async (route) => {
    loadBody = JSON.parse(route.request().postData() ?? "{}");
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle history panel" }).click();

  // Expand other-workspace and click its snapshot.
  await page.locator(".workspace-group").first().locator(".workspace-summary").click();
  await page.locator(".workspace-group").first().locator(".snapshot-row").click();

  expect(loadBody).toMatchObject({ workspace: "other-workspace", filename: "20260609_140000_screen.json" });
});

// ── Incremental step-frames builder (v0.8) ────────────────────────────────────

test("step-frames builder: placeholder appears after init, diagram appears after commit", async ({
  page,
  request,
}) => {
  await page.goto("/");

  // Init the builder — placeholder should appear.
  const initRes = await request.post(`${SERVER}/step-frames/init`, {
    data: { frame_type: "mermaid", workspace: "e2e-test", title: "Build test" },
  });
  const { id } = await initRes.json() as { ok: boolean; id: string };
  expect(typeof id).toBe("string");

  // Browser should show the building placeholder.
  await expect(page.locator(".placeholder")).toBeVisible();
  await expect(page.locator(".placeholder")).toContainText("Building step-frames");

  // Append frames.
  await request.post(`${SERVER}/step-frames/${id}/frame`, {
    data: { payload: "graph TD; A --> B", label: "Step 1" },
  });
  await request.post(`${SERVER}/step-frames/${id}/frame`, {
    data: { payload: "graph TD; A --> B --> C", label: "Step 2" },
  });

  // Commit — browser should show the rendered step-frames diagram.
  await request.post(`${SERVER}/step-frames/${id}/commit`);

  await expect(page.locator(".mermaid-container svg")).toBeVisible();
  await expect(page.locator(".placeholder")).not.toBeVisible();

  // Step bar should be visible for a 2-frame sequence.
  await expect(page.locator(".step-bar")).toBeVisible();
});
