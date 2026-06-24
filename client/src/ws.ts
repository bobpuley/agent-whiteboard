// WebSocket client — connects to /stream and dispatches render commands.

export type RenderCommand =
  | {
      action: "replace";
      type: string; // content type — one of: mermaid, svg, html, katex, vega-lite
      payload: string;
      title?: string;        // optional label shown above the canvas
      frameLabel?: string;   // present when this is a step-frames frame
      stepFrames?: boolean;  // true when this is part of a step-frames sequence
      currentFrame?: number; // step-frames cursor position (0-indexed)
      totalFrames?: number;  // total frames in the loaded sequence
      nodeToFrame?: Record<string, number>; // node ID → frame index for autonomous navigation
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
    };

type CommandHandler = (cmd: RenderCommand) => void;

export function connectWebSocket(onCommand: CommandHandler): () => void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/stream`);

  ws.addEventListener("message", (event) => {
    try {
      const cmd = JSON.parse(event.data as string) as RenderCommand;
      onCommand(cmd);
    } catch {
      console.error("ws: failed to parse message", event.data);
    }
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
