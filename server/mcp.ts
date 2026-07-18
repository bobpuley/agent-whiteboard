// MCP tool definitions and handlers.
// Tools: render, clear, export, step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clearCanvas, exportCanvas } from "./session.js";
import { broadcast } from "./ws.js";
import { nodeActionsSchema, nodeToFrameSchema, validateFrame } from "./validate.js";
import { getSnapshotsRoot } from "./paths.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import { waitForClick, waitForDone } from "./interaction.js";
import { findSnapshotById, findSnapshotByIdInWorkspace, listSnapshots } from "./snapshot-reader.js";
import { generateExportHtml, writeExportHtmlToDisk } from "./export-html.js";
import type { ValidatedExportItem } from "./export-html.js";
import {
  appendFrameAndBroadcast,
  commitRenderResult,
  commitStepFramesResult,
  initStepFramesResult,
  seekAndBroadcast,
  stepAndBroadcast,
  validateWorkspaceInput,
} from "./render-core.js";

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
        '  • "html"        — HTML fragment, styled with Bootstrap 5 (CSS-only build, always available — no need to link or import it). Use its component classes instead of hand-authored CSS: "card"/"card-body"/"card-title" for panels, "alert alert-info"/"alert-warning"/"alert-danger" for callouts, "badge bg-primary"/"bg-success" for tags, "table table-striped"/"table-bordered" for data tables. No Bootstrap JS is loaded — components that depend on it (dropdowns, modals, tooltips, popovers, collapses, carousels, offcanvas) render their static markup but are not interactive, so avoid them. Example: render({ type: "html", payload: "<div class="card"><div class="card-body"><h5 class="card-title">Hello</h5><span class="badge bg-success">Done</span></div></div>" })\n' +
        '  • "katex"       — LaTeX string, rendered in display mode. Example: render({ type: "katex", payload: "E = mc^2" })\n' +
        '  • "vega-lite"   — Vega-Lite JSON spec (must be valid JSON). Example: render({ type: "vega-lite", payload: "{"$schema":"...","mark":"bar",...}" })\n' +
        "render() is single-frame only. For a step-through sequence (multiple frames navigable via step()/seek()), use init_step_frames()/append_frame()/commit_step_frames() instead (see below).\n" +
        'options: { "workspace": "my-course", "title": "My diagram" }. workspace is REQUIRED — snapshot routing fails without it. title is optional.\n' +
        'options.workspace: workspace name for snapshot routing. Must be alphanumeric with dashes, underscores, dots, or spaces — no path separators. No env var fallback: always pass explicitly.\n' +
        'Example: render({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: "course_2", title: "System flow" } })',
      inputSchema: z.object({
        type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite"])
          .describe("Content type."),
        payload: z
          .string()
          .describe(
            "The content source. For mermaid: must begin with a valid diagram keyword. " +
              "For vega-lite: must be valid JSON. For svg/html/katex: any string."
          ),
        options: z
          .object({
            workspace: z.string().describe(
              "REQUIRED. Workspace name for snapshot routing. " +
              "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'. " +
              "Always pass explicitly — no env var fallback."
            ),
            title: z.string().optional(),
          })
          .describe('Required options object. workspace: snapshot destination (required). title: label above canvas (optional).'),
      }),
    },
    async ({ type, payload, options }) => {
      const title = options?.title;
      const workspaceResult = validateWorkspaceInput(options?.workspace);
      if (!workspaceResult.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: workspaceResult.error }) }],
        };
      }
      const { workspace } = workspaceResult;

      const validationError = await validateFrame({ type, payload });
      if (validationError) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: validationError }) }],
        };
      }

      const result = commitRenderResult(type, payload, workspace, title);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
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
      return {
        content: [{ type: "text", text: JSON.stringify(stepAndBroadcast(direction)) }],
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
      return {
        content: [{ type: "text", text: JSON.stringify(seekAndBroadcast(frame)) }],
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
      cancelSlideshow({ persist: false }); // clear() must never produce a snapshot (F10)
      clearCanvas();
      broadcast({ action: "clear" });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // slideshow(slides, delay_ms, workspace) — auto-advance a playlist on a server-side timer.
  server.registerTool(
    "slideshow",
    {
      description:
        "Load a playlist of slides and auto-advance the canvas on a server-side timer.\n" +
        'slides: array of { type, payload, title? } — same types as render().\n' +
        'delay_ms: interval in milliseconds between slides.\n' +
        "workspace: REQUIRED — same rules as render(). Individual ticks are never persisted; when the " +
        "slideshow ends (runs to completion, is stopped, or is superseded by a new render()/slideshow() call), " +
        "whatever is last on screen is written as a single snapshot to this workspace.\n" +
        "A new call cancels any running slideshow. Use slideshow_stop() to stop early.\n" +
        'Example: slideshow({ slides: [{ type: "mermaid", payload: "graph TD; A-->B", title: "Slide 1" }], delay_ms: 3000, workspace: "course_2" })',
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
        workspace: z.string().describe(
          "REQUIRED. Workspace to persist the finalize snapshot to (see description). " +
          "Alphanumeric, dashes, underscores, dots, spaces — no path separators or '..'."
        ),
      }),
    },
    async ({ slides, delay_ms, workspace: rawWorkspace }) => {
      const workspaceResult = validateWorkspaceInput(rawWorkspace);
      if (!workspaceResult.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: workspaceResult.error }) }],
        };
      }
      const { workspace } = workspaceResult;

      // Validate each slide payload — same validator REST's /slideshow uses (NF18).
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const err = await validateFrame({ type: s.type, payload: s.payload });
        if (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: false, error: `slide[${i}]: ${err}` }) }],
          };
        }
      }
      startSlideshow(slides, delay_ms, workspace);
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
        "Only one wait_click() may be pending at a time — a second wait_click() or an arming wait_done() supersedes it, returning { \"ok\": true, \"type\": \"superseded\" } to the superseded call instead of waiting out the full timeout.\n" +
        "Example — plain click: render({ type: \"mermaid\", payload: \"graph TD; A-->B\" }) → wait_click() → handle result\n" +
        "Example — popup menu: wait_click({ node_actions: { \"B\": [\"Explain\", \"Drill down\"] } }) → user clicks B → selects action",
      inputSchema: z.object({
        node_actions: nodeActionsSchema
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
      if (event.type === "timeout" || event.type === "superseded") {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, type: event.type }) }],
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
        "Begin a step-frames sequence — a step-through diagram built one frame at a time and navigable afterwards via step()/seek(). This is the only way to create a multi-frame sequence (render() is single-frame only).\n" +
        "Creates an empty skeleton in server memory, pushes a 0-frame placeholder to the browser, and returns a unique ID.\n" +
        "Protocol: init_step_frames() → append_frame() × N (browser updates after each append) → commit_step_frames() (finalizes snapshot + state).\n" +
        "frame_type: content type shared by all frames (e.g. 'mermaid') — every frame in the sequence must currently be this same type.\n" +
        "workspace: same rules as render() — required.\n" +
        "The ID expires after 30 minutes of inactivity (no append_frame or commit_step_frames call).\n" +
        "Each append_frame() call is validated and pushed to the browser individually — the user watches the sequence grow one frame at a time; interleave wait_done() after each append_frame() call for a paced, user-acknowledged reveal.\n" +
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
      const workspaceResult = validateWorkspaceInput(workspace);
      if (!workspaceResult.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: workspaceResult.error }) }],
        };
      }
      const { id } = initStepFramesResult(frame_type, workspaceResult.workspace, title);
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
        "payload is validated against type ?? the sequence's frame_type (same hard gate as render()).\n" +
        "After each valid append, immediately pushes the accumulated partial step-frames sequence to the browser (live preview positioned at the latest frame).\n" +
        "Invalid payloads are rejected before any broadcast; prior frames and browser state are preserved — fix and retry the frame.\n" +
        'Returns { "ok": true, "frame_count": N }. Error if id is unknown/expired or payload fails validation.\n' +
        'Example: append_frame({ id: "<uuid>", payload: "graph TD; A --> B", label: "Step 1" })\n' +
        'Example — mixing types in one sequence: append_frame({ id: "<uuid>", payload: "E = mc^2", type: "katex" }) inside a sequence whose frame_type is "mermaid".',
      inputSchema: z.object({
        id: z.string().describe("Builder ID returned by init_step_frames()."),
        payload: z.string().describe("Frame content — validated against type ?? the sequence's frame_type."),
        label: z.string().optional().describe("Optional display caption for this frame."),
        type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite"])
          .optional()
          .describe("Optional per-frame type override. Defaults to the sequence's frame_type when omitted — set this to mix content types within one sequence."),
      }),
    },
    async ({ id, payload, label, type }) => {
      const result = await appendFrameAndBroadcast(id, payload, label, type);
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
        "Optional node_to_frame: node ID → frame index map. When set, the browser attaches click listeners automatically — clicking a mapped node jumps directly to its frame (no wait_click() call needed). wait_click() overrides node_to_frame for the duration of its call.\n" +
        'Returns { "ok": true }. Error if id is unknown/expired or the sequence has zero frames.\n' +
        'Example: commit_step_frames({ id: "<uuid>" })\n' +
        'Example with node_to_frame: commit_step_frames({ id: "<uuid>", node_to_frame: { "A": 0, "B": 1, "C": 2 } })',
      inputSchema: z.object({
        id: z.string().describe("Builder ID returned by init_step_frames()."),
        node_to_frame: nodeToFrameSchema
          .optional()
          .describe("Optional node ID → frame index map for autonomous browser navigation on click."),
      }),
    },
    ({ id, node_to_frame }) => {
      const result = commitStepFramesResult(id, node_to_frame);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
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
        const root = getSnapshotsRoot();
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
      const workspaceResult = validateWorkspaceInput(workspace);
      if (!workspaceResult.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: workspaceResult.error }) }],
        };
      }
      const root = getSnapshotsRoot();
      const snapshots = listSnapshots(workspaceResult.workspace, root);
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
      const workspaceResult = validateWorkspaceInput(workspace);
      if (!workspaceResult.ok) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: workspaceResult.error }) }],
        };
      }
      if (ids.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "ids must be a non-empty array" }) }],
        };
      }

      const validatedWorkspace = workspaceResult.workspace;
      const root = getSnapshotsRoot();
      const validItems: ValidatedExportItem[] = [];
      for (const id of ids) {
        const record = findSnapshotByIdInWorkspace(validatedWorkspace, id, root);
        if (record !== null) {
          validItems.push({ workspace: validatedWorkspace, id, record });
        }
      }

      if (validItems.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "no valid items to export" }) }],
        };
      }

      const { html, downloadFilename } = await generateExportHtml(validItems);

      try {
        const path = writeExportHtmlToDisk(validatedWorkspace, html, downloadFilename, output_path, root);
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
