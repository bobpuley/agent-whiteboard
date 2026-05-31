// WebSocket client — connects to /stream and dispatches render commands.

export type RenderCommand =
  | { action: "replace"; type: "mermaid"; payload: string }
  | { action: "clear" };

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
