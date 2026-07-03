// MCP tool definitions and handlers.
// Tools: render, clear, export, step.

import { homedir } from "os";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clearCanvas, exportCanvas, getCanvas, getLastWorkspace, seekStepFrame, setCanvas, setLastWorkspace, setStepFrames, stepCursor } from "./session.js";
import type { StepFrame } from "./session.js";
import { broadcast, broadcastStepFrames } from "./ws.js";
import { hasMermaidKeyword, isValidWorkspaceName, parseMermaid } from "./validate.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import { waitForClick, waitForDone } from "./events.js";
import { saveSnapshot } from "./snapshot.js";
import { findSnapshotById, findSnapshotByIdInWorkspace, listSnapshots } from "./snapshot-reader.js";
import { appendFrame, commitBuilder, createBuilder } from "./step-frames-builder.js";
import { generateExportHtml, writeExportHtmlToDisk } from "./export-html.js";
import type { ValidatedExportItem } from "./export-html.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agent-whiteboard",
    version: "0.1.0",
  });

  // render(type, payload) — push content to the canvas.
  server.registerTool(
    "render",
    {
      description:
        "Push content to the whiteboard canvas. The payload always replaces the current canvas state.\n" +
        "Supported types:\n" +
        '  • "mermaid"     — Mermaid diagram source. Must begin with a diagram keyword (graph, flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap). Example: render({ type: "mermaid", payload: "graph TD; A --> B" })\n' +
        '  • "svg"         — Inline SVG markup. Example: render({ type: "svg", payload: "<svg>...</svg>" })\n' +
        '  • "html"        — HTML/CSS fragment. Example: render({ type: "html", payload: "<h1>Hello</h1>" })\n' +
        '  • "katex"       — LaTeX string, rendered in display mode. Example: render({ type: "katex", payload: "E = mc^2" })\n' +
        '  • "vega-lite"   — Vega-Lite JSON spec (must be valid JSON). Example: render({ type: "vega-lite", payload: "{\"$schema\":\"...\",\"mark\":\"bar\",...}" })\n' +
        '  • "step-frames" — Ordered sequence of frames for step-through. payload is a JSON string: { "frame_type": "mermaid", "frames": [{ "label": "Step 1", "payload": "graph TD; A" }, ...] }. Displays frame 0; use step() to navigate. ' +
        'Best for small, fully-known-upfront sequences (one call). Caveat: individual frame payloads are NOT validated against frame_type here — a malformed frame is accepted and only fails when the user steps/seeks to it. ' +
        'For long or complex sequences, when you want each frame validated as you build it, or when you want the user to review and acknowledge each frame before the next appears, use init_step_frames()/append_frame()/commit_step_frames() instead (see below) — it validates every frame at append time and composes with wait_done() for paced, user-acknowledged reveal.\n' +
        'options: { "workspace": "my-course", "title": "My diagram" }. workspace is REQUIRED — snapshot routing fails without it. title is optional.\n' +
        'options.workspace: workspace name for snapshot routing. Must be alphanumeric with dashes, underscores, dots, or spaces — no path separators. No env var fallback: always pass explicitly.\n' +
        'Example: render({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: "course_2", title: "System flow" } })',
      inputSchema: z.object({
        type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite", "step-frames"])
          .describe("Content type."),
        payload: z
          .string()
          .describe(
            "The content source. For mermaid: must begin with a valid diagram keyword. " +
              "For vega-lite and step-frames: must be valid JSON. For svg/html/katex: any string."
          ),
        options: z
          .object({
            workspace: z.string().describe(
              "REQUIRED. Workspace name for snapshot routing. " +
              "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'. " +
              "Always pass explicitly — no env var fallback."
            ),
            title: z.string().optional(),
            node_to_frame: z.record(z.string(), z.number()).optional(),
          })
          .describe('Required options object. workspace: snapshot destination (required). title: label above canvas (optional). node_to_frame: node→frame map for autonomous navigation on step-frames (optional).'),
      }),
    },
    async ({ type, payload, options }) => {
      const title = options?.title;
      const nodeToFrame = options?.node_to_frame;
      const workspace = options?.workspace;
      if (!workspace) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ok: false, error: "workspace is required" }),
          }],
        };
      }
      if (!isValidWorkspaceName(workspace)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
            }),
          }],
        };
      }
      if (type === "mermaid") {
        if (!hasMermaidKeyword(payload)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error:
                    "invalid payload: mermaid source must begin with a diagram keyword " +
                    "(e.g. 'graph TD', 'sequenceDiagram', 'classDiagram', ...)",
                }),
              },
            ],
          };
        }
        try {
          await parseMermaid(payload);
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`,
                }),
              },
            ],
          };
        }
      }

      if (type === "vega-lite") {
        try {
          JSON.parse(payload);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: "invalid payload: vega-lite payload must be valid JSON",
                }),
              },
            ],
          };
        }
      }

      if (type === "step-frames") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: "invalid payload: step-frames payload must be valid JSON",
                }),
              },
            ],
          };
        }
        const spec = parsed as { frame_type?: string; frames?: unknown[] };
        if (
          typeof spec.frame_type !== "string" ||
          !Array.isArray(spec.frames) ||
          spec.frames.length === 0
        ) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: 'invalid payload: step-frames must have "frame_type" (string) and "frames" (non-empty array)',
                }),
              },
            ],
          };
        }
        const frames = spec.frames as StepFrame[];
        if (frames.some((f) => typeof f.payload !== "string")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: 'invalid payload: each frame must have a "payload" string',
                }),
              },
            ],
          };
        }
        cancelSlideshow();
        setStepFrames(frames, spec.frame_type, payload, title, nodeToFrame);
        broadcast({
          action: "replace",
          type: spec.frame_type,
          payload: frames[0].payload,
          frameLabel: frames[0].label,
          stepFrames: true,
          currentFrame: 0,
          totalFrames: frames.length,
          ...(title !== undefined ? { title } : {}),
          ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
        });
        setLastWorkspace(workspace);
        let sfSnapshotId: string | undefined;
        try { sfSnapshotId = saveSnapshot("step-frames", payload, { title, node_to_frame: nodeToFrame, workspace }); } catch { /* non-fatal */ }
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, ...(sfSnapshotId !== undefined ? { id: sfSnapshotId } : {}) }) }],
        };
      }

      cancelSlideshow();
      setCanvas(type, payload, title);
      broadcast({ action: "replace", type, payload, ...(title !== undefined ? { title } : {}) });
      setLastWorkspace(workspace);
      let snapshotId: string | undefined;
      try { snapshotId = saveSnapshot(type, payload, { title, workspace }); } catch { /* non-fatal */ }

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, ...(snapshotId !== undefined ? { id: snapshotId } : {}) }) }],
      };
    }
  );

  // step(direction) — advance or rewind the step cursor.
  server.registerTool(
    "step",
    {
      description:
        'Advance ("next") or rewind ("prev") the step cursor for a loaded step-frames sequence. ' +
        'Returns { "ok": true, "current_frame": N, "total_frames": M }. ' +
        'Returns { "ok": false, "error": "..." } if no step-frames sequence is loaded.',
      inputSchema: z.object({
        direction: z
          .enum(["next", "prev"])
          .describe('"next" to advance, "prev" to rewind.'),
      }),
    },
    ({ direction }) => {
      const result = stepCursor(direction);
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: "no step-frames sequence is loaded",
              }),
            },
          ],
        };
      }
      const state = getCanvas();
      if (state.type === "step-frames") {
        const frame = state.frames[result.currentFrame];
        broadcast({
          action: "replace",
          type: state.frameType,
          payload: frame.payload,
          frameLabel: frame.label,
          stepFrames: true,
          currentFrame: result.currentFrame,
          totalFrames: result.totalFrames,
          ...(state.title !== undefined ? { title: state.title } : {}),
        });
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              current_frame: result.currentFrame,
              total_frames: result.totalFrames,
            }),
          },
        ],
      };
    }
  );

  // seek(frame) — jump the step cursor to an arbitrary frame index.
  server.registerTool(
    "seek",
    {
      description:
        'Jump the step-frame cursor to an arbitrary frame index. ' +
        'Useful for random-access navigation without repeated step() calls. ' +
        'Returns { "ok": true, "current_frame": N, "total_frames": M }. ' +
        'Returns { "ok": false, "error": "..." } if no step-frames sequence is loaded or frame is out of range.',
      inputSchema: z.object({
        frame: z.number().int().nonnegative().describe("Zero-based frame index to jump to."),
      }),
    },
    ({ frame }) => {
      const state = getCanvas();
      if (state.type !== "step-frames") {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "no step-frames sequence is loaded" }) }],
        };
      }
      const total = state.frames.length;
      if (frame < 0 || frame >= total) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: `frame out of range: must be 0–${total - 1}` }) }],
        };
      }
      seekStepFrame(frame);
      const f = state.frames[frame];
      broadcast({
        action: "replace",
        type: state.frameType,
        payload: f.payload,
        frameLabel: f.label,
        stepFrames: true,
        currentFrame: frame,
        totalFrames: total,
        ...(state.title !== undefined ? { title: state.title } : {}),
        ...(state.nodeToFrame !== undefined ? { nodeToFrame: state.nodeToFrame } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, current_frame: frame, total_frames: total }) }],
      };
    }
  );

  // clear() — reset the canvas.
  server.registerTool(
    "clear",
    {
      description: "Reset the whiteboard canvas to a blank state.",
      inputSchema: z.object({}),
    },
    () => {
      cancelSlideshow();
      clearCanvas();
      broadcast({ action: "clear" });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // slideshow(slides, delay_ms) — auto-advance a playlist on a server-side timer.
  server.registerTool(
    "slideshow",
    {
      description:
        "Load a playlist of slides and auto-advance the canvas on a server-side timer.\n" +
        'slides: array of { type, payload, title? } — same types as render().\n' +
        'delay_ms: interval in milliseconds between slides.\n' +
        "A new call cancels any running slideshow. Use slideshow_stop() to stop early.\n" +
        'Example: slideshow({ slides: [{ type: "mermaid", payload: "graph TD; A-->B", title: "Slide 1" }], delay_ms: 3000 })',
      inputSchema: z.object({
        slides: z
          .array(
            z.object({
              type: z.enum(["mermaid", "svg", "html", "katex", "vega-lite"]).describe("Content type."),
              payload: z.string().describe("Content source."),
              title: z.string().optional().describe("Optional label above the canvas."),
            })
          )
          .min(1)
          .describe("Ordered list of slides."),
        delay_ms: z
          .number()
          .positive()
          .describe("Milliseconds between slide advances."),
      }),
    },
    async ({ slides, delay_ms }) => {
      // Validate each slide payload.
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        if (s.type === "mermaid") {
          if (!hasMermaidKeyword(s.payload)) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid payload: mermaid source must begin with a diagram keyword`,
                }),
              }],
            };
          }
          try {
            await parseMermaid(s.payload);
          } catch (err) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`,
                }),
              }],
            };
          }
        } else if (s.type === "vega-lite") {
          try {
            JSON.parse(s.payload);
          } catch {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid payload: vega-lite payload must be valid JSON`,
                }),
              }],
            };
          }
        }
      }
      startSlideshow(slides, delay_ms);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // slideshow_stop() — cancel the running slideshow.
  server.registerTool(
    "slideshow_stop",
    {
      description:
        "Cancel the running slideshow timer. The last rendered slide remains on screen. " +
        "No-op if no slideshow is running.",
      inputSchema: z.object({}),
    },
    () => {
      cancelSlideshow();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // wait_click(node_actions?) — arm click listener, block until user clicks a node/edge.
  server.registerTool(
    "wait_click",
    {
      description:
        "Arm the browser for a single node or edge click on the current Mermaid diagram. " +
        "The browser highlights clickable elements; one click resolves the call.\n" +
        "Optional node_actions: map of node ID → string[] — nodes with registered actions show a popup menu on click; user selects one.\n" +
        "Returns { \"ok\": true, \"type\": \"node\"|\"edge\", \"id\": \"<id>\", \"label\": \"<label>\", \"action\": \"<string or null>\" }.\n" +
        "  action is null when no popup was shown or user clicked without selecting; string value when menu item was selected.\n" +
        "On timeout (10 min): returns { \"ok\": true, \"type\": \"timeout\" }.\n" +
        "Applies to graph/flowchart diagrams reliably; other Mermaid types (sequenceDiagram, erDiagram, classDiagram) are best-effort — node IDs may be opaque or extraction may fail.\n" +
        "Only one wait_click() may be pending at a time — a second call cancels the first.\n" +
        "Example — plain click: render({ type: \"mermaid\", payload: \"graph TD; A-->B\" }) → wait_click() → handle result\n" +
        "Example — popup menu: wait_click({ node_actions: { \"B\": [\"Explain\", \"Drill down\"] } }) → user clicks B → selects action",
      inputSchema: z.object({
        node_actions: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe(
            "Optional map of node ID → action labels. " +
            "Nodes with a non-empty entry show a popup menu on click; user selects one action. " +
            "Nodes not in the map accept a plain click (no popup). " +
            "Edge clicks are always plain (no popup)."
          ),
      }),
    },
    async ({ node_actions }) => {
      // Arm the browser click listener, passing the node_actions map (or empty map for plain click).
      broadcast({ action: "set_node_actions", node_actions: node_actions ?? {}, enabled: true });
      const event = await waitForClick();
      // Disarm the browser.
      broadcast({ action: "set_node_actions", enabled: false });
      if (event.type === "timeout") {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, type: "timeout" }) }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            type: event.type,
            id: event.id,
            label: event.label,
            action: event.action,
          }),
        }],
      };
    }
  );

  // wait_done() — block until the user clicks Done in the browser.
  server.registerTool(
    "wait_done",
    {
      description:
        "Block until the user clicks the Done button in the whiteboard browser. " +
        "Call this immediately after render() when you want the user to review the diagram before you continue. " +
        'Returns { "ok": true } when the user signals they are ready. ' +
        "Example flow: render(...) → wait_done() → continue lesson",
      inputSchema: z.object({}),
    },
    async () => {
      await waitForDone();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // init_step_frames(frame_type, workspace, title?) — begin an incremental step-frames build.
  server.registerTool(
    "init_step_frames",
    {
      description:
        "Begin an incremental step-frames sequence. Use this when you want to build a step-through diagram one frame at a time.\n" +
        "Creates an empty skeleton in server memory, pushes a 0-frame placeholder to the browser, and returns a unique ID.\n" +
        "Protocol: init_step_frames() → append_frame() × N (browser updates after each append) → commit_step_frames() (finalizes snapshot + state).\n" +
        "frame_type: content type shared by all frames (e.g. 'mermaid') — every frame in the sequence must currently be this same type.\n" +
        "workspace: same rules as render() — required.\n" +
        "The ID expires after 30 minutes of inactivity (no append_frame or commit_step_frames call).\n" +
        "Prefer this over passing a full payload to render(type=\"step-frames\", ...) in one call whenever: the sequence is long or complex (each append_frame() validates its own frame — the one-shot render() path does not validate individual frame content); or you want the user to review and acknowledge each frame before the next appears — interleave wait_done() after each append_frame() call for paced, user-acknowledged reveal. For a short, fully-known-upfront sequence, render(type=\"step-frames\", ...) in one call is fewer round-trips.\n" +
        'Returns { "ok": true, "id": "<uuid>" }. Error if workspace is missing/invalid or frame_type is unsupported.\n' +
        'Example: init_step_frames({ frame_type: "mermaid", workspace: "my-course", title: "TCP Handshake" })',
      inputSchema: z.object({
        frame_type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite"])
          .describe("Content type shared by all frames."),
        workspace: z
          .string()
          .describe(
            "REQUIRED. Workspace name for snapshot routing. " +
            "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'."
          ),
        title: z.string().optional().describe("Optional label displayed above the canvas."),
      }),
    },
    ({ frame_type, workspace, title }) => {
      if (!workspace) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "workspace is required" }) }],
        };
      }
      if (!isValidWorkspaceName(workspace)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
            }),
          }],
        };
      }
      const id = createBuilder(frame_type, workspace, title);
      broadcast({
        action: "replace",
        type: "step-frames-placeholder",
        frameCount: 0,
        ...(title !== undefined ? { title } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, id }) }],
      };
    }
  );

  // append_frame(id, payload, label?) — add one frame to an in-progress sequence.
  server.registerTool(
    "append_frame",
    {
      description:
        "Append one frame to an in-progress step-frames sequence identified by id.\n" +
        "payload is validated against the sequence's frame_type (same hard gate as render()).\n" +
        "After each valid append, immediately pushes the accumulated partial step-frames sequence to the browser (live preview positioned at the latest frame).\n" +
        "Invalid payloads are rejected before any broadcast; prior frames and browser state are preserved — fix and retry the frame.\n" +
        'Returns { "ok": true, "frame_count": N }. Error if id is unknown/expired or payload fails validation.\n' +
        'Example: append_frame({ id: "<uuid>", payload: "graph TD; A --> B", label: "Step 1" })',
      inputSchema: z.object({
        id: z.string().describe("Builder ID returned by init_step_frames()."),
        payload: z.string().describe("Frame content — validated against the sequence's frame_type."),
        label: z.string().optional().describe("Optional display caption for this frame."),
      }),
    },
    async ({ id, payload, label }) => {
      const result = await appendFrame(id, payload, label);
      if (result.ok) {
        // Live preview: push the accumulated partial sequence to the browser.
        const { frames, frame_type, title } = result;
        broadcastStepFrames(frames, frame_type, frames.length - 1, title);
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: result.ok, ...( result.ok ? { frame_count: result.frame_count } : { error: result.error }) }) }],
      };
    }
  );

  // commit_step_frames(id) — finalise and render the assembled sequence.
  server.registerTool(
    "commit_step_frames",
    {
      description:
        "Finalise an in-progress step-frames sequence (finalization only — the browser already shows the sequence via append_frame live previews).\n" +
        "Assembles the full step-frames JSON, writes a snapshot, updates in-memory canvas state (so export() works), cancels any running slideshow, and deletes the builder entry.\n" +
        "Still sends a final WebSocket broadcast for consistency (handles clear() called between appends).\n" +
        "After commit, export() returns the assembled full step-frames JSON. step() and seek() work on the committed sequence.\n" +
        "The builder entry is deleted after commit — the ID cannot be reused.\n" +
        'Returns { "ok": true }. Error if id is unknown/expired or the sequence has zero frames.\n' +
        'Example: commit_step_frames({ id: "<uuid>" })',
      inputSchema: z.object({
        id: z.string().describe("Builder ID returned by init_step_frames()."),
      }),
    },
    ({ id }) => {
      const result = commitBuilder(id);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
      const { entry } = result;
      const { frame_type, workspace, title, frames } = entry;

      // Assemble the full step-frames JSON.
      const assembledPayload = JSON.stringify({ frame_type, frames });

      cancelSlideshow();
      setStepFrames(frames, frame_type, assembledPayload, title);
      setLastWorkspace(workspace);
      let commitSnapshotId: string | undefined;
      try {
        commitSnapshotId = saveSnapshot("step-frames", assembledPayload, { title, workspace });
      } catch { /* non-fatal */ }
      // Final broadcast for consistency (handles clear() called between appends).
      broadcastStepFrames(frames, frame_type, 0, title);

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, ...(commitSnapshotId !== undefined ? { id: commitSnapshotId } : {}) }) }],
      };
    }
  );

    // export(id?) — return the current canvas source spec, or a past snapshot by UUID.
  server.registerTool(
    "export",
    {
      description:
        "Return the current canvas source spec, or a past snapshot by UUID. " +
        'Without id: returns verbatim last render() payload. Response: { "ok": true, "data": "<source>" }. ' +
        "For step-frames: returns the full original frames JSON string (not the current frame). " +
        'data is an empty string if the canvas is empty or was cleared. ' +
        'With optional id (UUID returned by render() or commit_step_frames()): scans snapshot files for a record whose id field matches and returns its payload. ' +
        'Error if id provided but no matching snapshot found: { "ok": false, "error": "graph not found" }. ' +
        "Old snapshots without an id field are not addressable by this mechanism.",
      inputSchema: z.object({
        id: z.string().optional().describe(
          "Optional UUID returned by a previous render() or commit_step_frames() call. " +
          "When provided, retrieves that specific snapshot's payload instead of the current canvas state."
        ),
      }),
    },
    ({ id }) => {
      if (id !== undefined && id !== "") {
        const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
        const payload = findSnapshotById(id, root);
        if (payload === null) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: false, error: "graph not found" }) }],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, data: payload }) }],
        };
      }
      const data = exportCanvas();
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, data }) },
        ],
      };
    }
  );

  // list_snapshots(workspace) — list a workspace's snapshots for agent-driven export selection.
  server.registerTool(
    "list_snapshots",
    {
      description:
        "List the snapshots stored for a workspace, so you can choose which ones to export via export_html().\n" +
        'Returns { "ok": true, "snapshots": [{ "id", "timestamp", "type", "title"? }] }, sorted newest-first.\n' +
        "Returns an empty array if the workspace has no snapshots or does not exist.\n" +
        'Example: list_snapshots({ workspace: "my-course" })',
      inputSchema: z.object({
        workspace: z
          .string()
          .describe(
            "REQUIRED. Workspace name to list snapshots for. " +
            "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'."
          ),
      }),
    },
    ({ workspace }) => {
      if (!workspace) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "workspace is required" }) }],
        };
      }
      if (!isValidWorkspaceName(workspace)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
            }),
          }],
        };
      }
      const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
      const snapshots = listSnapshots(workspace, root);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, snapshots }) }],
      };
    }
  );

  // export_html(workspace, ids, output_path?) — agent-facing HTML export, written to disk.
  server.registerTool(
    "export_html",
    {
      description:
        "Export 1..N snapshots from a workspace to a single self-contained HTML file " +
        "(agent-facing equivalent of the browser HistoryPanel's 'Export selected'). " +
        "Discover snapshot ids first with list_snapshots(workspace).\n" +
        "The assembled HTML is NOT returned inline (it can be several MB once the mermaid.js bundle is embedded) " +
        "— the server writes it to disk and returns the file path.\n" +
        "output_path (optional): if provided, parent directories are created as needed and the file is written there. " +
        "Relative paths resolve against the server process's working directory, not yours — pass an absolute path for a specific location.\n" +
        "If omitted, defaults to <snapshots_dir>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html.\n" +
        'Returns { "ok": true, "path": "<absolute path>" }.\n' +
        'Example: export_html({ workspace: "my-course", ids: ["<uuid-1>", "<uuid-2>"] })',
      inputSchema: z.object({
        workspace: z
          .string()
          .describe(
            "REQUIRED. Workspace the snapshot ids belong to. " +
            "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'."
          ),
        ids: z
          .array(z.string())
          .min(1)
          .describe("Non-empty array of snapshot UUIDs (from list_snapshots()), all scoped to workspace."),
        output_path: z
          .string()
          .optional()
          .describe(
            "Optional absolute path to write the HTML file to (parent directories created as needed). " +
            "Defaults to <snapshots_dir>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html."
          ),
      }),
    },
    async ({ workspace, ids, output_path }) => {
      if (!workspace) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "workspace is required" }) }],
        };
      }
      if (!isValidWorkspaceName(workspace)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: "invalid workspace: must be alphanumeric with dashes, underscores, dots, or spaces — no path separators or '..'",
            }),
          }],
        };
      }
      if (ids.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "ids must be a non-empty array" }) }],
        };
      }

      const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
      const validItems: ValidatedExportItem[] = [];
      for (const id of ids) {
        const record = findSnapshotByIdInWorkspace(workspace, id, root);
        if (record !== null) {
          validItems.push({ workspace, id, record });
        }
      }

      if (validItems.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "no valid items to export" }) }],
        };
      }

      const { html, downloadFilename } = await generateExportHtml(validItems);

      try {
        const path = writeExportHtmlToDisk(workspace, html, downloadFilename, output_path, root);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, path }) }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: `failed to write export file: ${err instanceof Error ? err.message : String(err)}`,
            }),
          }],
        };
      }
    }
  );

  return server;
}
