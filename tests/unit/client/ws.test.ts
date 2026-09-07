// @vitest-environment jsdom
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
  close() {
    this.emit("close");
  }
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

describe("connectWebSocket — bounded exponential-backoff reconnect (F32)", () => {
  let disconnectedEvents: Array<{ exhausted?: boolean }>;
  let connectedCount: number;

  function onDisconnected(event: Event) {
    disconnectedEvents.push((event as CustomEvent<{ exhausted?: boolean }>).detail ?? {});
  }
  function onConnected() {
    connectedCount++;
  }

  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    disconnectedEvents = [];
    connectedCount = 0;
    window.addEventListener("ws:disconnected", onDisconnected);
    window.addEventListener("ws:connected", onConnected);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.removeEventListener("ws:disconnected", onDisconnected);
    window.removeEventListener("ws:connected", onConnected);
  });

  it("reopens a new socket with growing, capped delays after a close, and resets on reopen", () => {
    connectWebSocket(() => {});
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].close();
    expect(disconnectedEvents).toEqual([{ exhausted: false }]);
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet — waiting on backoff delay

    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2); // 500ms initial delay

    FakeWebSocket.instances[1].close();
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3); // 1000ms, doubled

    FakeWebSocket.instances[2].emit("open");
    expect(connectedCount).toBe(1);

    // A subsequent close after a successful reopen restarts the backoff from the initial delay.
    FakeWebSocket.instances[2].close();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it("dispatches exhausted:true and stops retrying once the attempt budget runs out", () => {
    connectWebSocket(() => {});

    // Drive through every retry attempt without ever reopening successfully.
    // MAX_ATTEMPTS successful reconnect schedules (closes 1..10) plus one
    // more close (the 11th) is what actually trips the exhausted check.
    for (let i = 0; i < 11; i++) {
      const before = FakeWebSocket.instances.length;
      FakeWebSocket.instances[before - 1].close();
      vi.runOnlyPendingTimers();
    }

    expect(disconnectedEvents.at(-1)).toEqual({ exhausted: true });
    const instancesAfterExhaustion = FakeWebSocket.instances.length;

    // No further reconnect is scheduled once exhausted.
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(instancesAfterExhaustion);
  });

  it("stops reconnecting once the cleanup function returned by connectWebSocket is called", () => {
    const cleanup = connectWebSocket(() => {});
    FakeWebSocket.instances[0].close();
    expect(FakeWebSocket.instances).toHaveLength(1);

    cleanup();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
