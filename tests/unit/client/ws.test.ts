// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWebSocket } from "../../../client/src/ws.js";
import type { RenderCommand } from "../../../client/src/ws.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  listeners: Record<string, ((event: any) => void)[]> = {};
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, handler: (event: any) => void) {
    (this.listeners[type] ??= []).push(handler);
  }
  close() {}
  emit(type: string, data?: unknown) {
    for (const handler of this.listeners[type] ?? []) handler({ data });
  }
}

describe("connectWebSocket — unrecognized message handling (B11)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function connect() {
    const received: RenderCommand[] = [];
    connectWebSocket((cmd) => received.push(cmd));
    const socket = FakeWebSocket.instances[0];
    return { socket, received };
  }

  it("forwards a known render command", () => {
    const { socket, received } = connect();
    socket.emit("message", JSON.stringify({ action: "replace", type: "mermaid", payload: "graph TD; A" }));
    expect(received).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a diagnostic and does not forward an unrecognized type instead of silently no-op'ing", () => {
    const { socket, received } = connect();
    socket.emit("message", JSON.stringify({ action: "replace", type: "not-a-real-type", payload: "x" }));
    expect(received).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs a diagnostic and does not forward an unrecognized action", () => {
    const { socket, received } = connect();
    socket.emit("message", JSON.stringify({ action: "not-a-real-action" }));
    expect(received).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("still forwards the step-frames-placeholder variant", () => {
    const { socket, received } = connect();
    socket.emit("message", JSON.stringify({ action: "replace", type: "step-frames-placeholder", frameCount: 0 }));
    expect(received).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
