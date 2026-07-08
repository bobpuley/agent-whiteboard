// WebSocket client — connects to /stream and dispatches render commands.

// Content types the server can send in a "replace" command.
export type RendererType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";

// Mermaid zoom/pan viewport (v0.19, F19/C3) — positionX/positionY are
// normalized fractions of the canvas container, not raw pixels.
export interface Viewport {
  scale: number;
  positionX: number;
  positionY: number;
}

export type RenderCommand =
  | {
      action: "replace";
      type: RendererType;
      payload: string;
      // id/cursor/total are always present (v0.26 Sprint 42) — they replace
      // the old stepFrames boolean flag entirely. A one-shot render is
      // cursor: 0, total: 1; a step-frames frame is cursor: N, total: M.
      id: string;             // snapshot id — present on new content, echoed on step()/seek() continuations
      cursor: number;         // frame index within the sequence (0-indexed)
      total: number;          // total frames in the loaded sequence
      title?: string;         // optional label shown above the canvas
      frameLabel?: string;    // present when this is a step-frames frame
      nodeToFrame?: Record<string, number>; // node ID → frame index for autonomous navigation
      viewport?: Viewport;    // cached zoom/pan to restore instead of auto-fitting (v0.19)
    }
  | {
      action: "replace";
      type: "step-frames-placeholder"; // incremental builder in progress (v0.8)
      frameCount: number;
      title?: string;
    }
  | { action: "clear" }
  | {
      action: "set_node_actions";
      enabled: boolean;
      node_actions?: Record<string, string[]>; // node ID → action labels (Sprint 13)
    }
  | {
      action: "set_done_armed";
      armed: boolean;
    };

type CommandHandler = (cmd: RenderCommand) => void;

const KNOWN_RENDERER_TYPES: readonly RendererType[] = ["mermaid", "svg", "html", "katex", "vega-lite"];
const KNOWN_ACTIONS = ["replace", "clear", "set_node_actions", "set_done_armed"] as const;

// Validates the minimal shape needed to safely cast to RenderCommand — in
// particular that "replace" messages carry a `type` App.svelte actually
// knows how to render, instead of silently falling through every `{#if}`
// branch with no diagnostic (B11).
function isKnownRenderCommand(cmd: unknown): cmd is RenderCommand {
  if (typeof cmd !== "object" || cmd === null) return false;
  const action = (cmd as { action?: unknown }).action;
  if (!(KNOWN_ACTIONS as readonly string[]).includes(action as string)) return false;
  if (action !== "replace") return true;
  const type = (cmd as { type?: unknown }).type;
  return type === "step-frames-placeholder" || (KNOWN_RENDERER_TYPES as readonly string[]).includes(type as string);
}

export function connectWebSocket(onCommand: CommandHandler): () => void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/stream`);

  ws.addEventListener("message", (event) => {
    let cmd: unknown;
    try {
      cmd = JSON.parse(event.data as string);
    } catch {
      console.error("ws: failed to parse message", event.data);
      return;
    }
    if (!isKnownRenderCommand(cmd)) {
      console.error("ws: received message with unrecognized action/type — ignoring", cmd);
      return;
    }
    onCommand(cmd);
  });

  ws.addEventListener("close", () => {
    onCommand({ action: "clear" });
    // Dispatch a custom event so App.svelte can show the disconnected banner.
    window.dispatchEvent(new CustomEvent("ws:disconnected"));
  });

  ws.addEventListener("open", () => {
    window.dispatchEvent(new CustomEvent("ws:connected"));
  });

  // Returns a cleanup function.
  return () => ws.close();
}
