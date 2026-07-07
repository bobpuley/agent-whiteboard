import { describe, expect, it } from "vitest";
import { addClient, broadcast, broadcastReplace, broadcastStepFrames } from "../../../server/ws.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: string[] = [];
  private closeHandlers: Array<() => void> = [];
  on(event: string, handler: () => void) {
    if (event === "close") this.closeHandlers.push(handler);
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  triggerClose() {
    for (const h of this.closeHandlers) h();
  }
}

describe("ws", () => {
  it("addClient immediately pushes the current done-armed state", () => {
    const client = new FakeSocket();
    addClient(client as never);
    expect(client.sent).toHaveLength(1);
    expect(JSON.parse(client.sent[0])).toEqual({ action: "set_done_armed", armed: false });
  });

  it("addClient does not send to a socket that isn't open", () => {
    const client = new FakeSocket();
    client.readyState = 0; // CONNECTING
    addClient(client as never);
    expect(client.sent).toHaveLength(0);
  });

  it("broadcast sends to every open client and skips closed ones", () => {
    const open = new FakeSocket();
    const closed = new FakeSocket();
    closed.readyState = 3; // CLOSED
    addClient(open as never);
    addClient(closed as never);
    open.sent = [];
    closed.sent = [];

    broadcast({ action: "replace", type: "svg", payload: "<svg/>" });

    expect(open.sent).toEqual([JSON.stringify({ action: "replace", type: "svg", payload: "<svg/>" })]);
    expect(closed.sent).toHaveLength(0);
  });

  it("a client removed via 'close' no longer receives broadcasts", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.triggerClose();
    client.sent = [];

    broadcast({ action: "clear" });

    expect(client.sent).toHaveLength(0);
  });

  it("broadcastStepFrames broadcasts the frame at currentFrame with per-frame type override", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    const frames = [
      { payload: "A", label: "Step 1" },
      { payload: "B", label: "Step 2", type: "katex" },
    ];
    broadcastStepFrames(frames, "mermaid", 1, "Seq Title", "sf-1");

    expect(JSON.parse(client.sent[0])).toEqual({
      action: "replace",
      type: "katex",
      payload: "B",
      frameLabel: "Step 2",
      stepFrames: true,
      currentFrame: 1,
      totalFrames: 2,
      title: "Seq Title",
      id: "sf-1",
    });
  });

  it("broadcastStepFrames falls back to frameType and omits title/id when absent", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames([{ payload: "A" }], "mermaid", 0);

    expect(JSON.parse(client.sent[0])).toEqual({
      action: "replace",
      type: "mermaid",
      payload: "A",
      frameLabel: undefined,
      stepFrames: true,
      currentFrame: 0,
      totalFrames: 1,
    });
  });

  // ── broadcastReplace — single "replace" builder (v0.23, U5) ─────────────────
  // Every render/step/seek/history-load/slideshow call path funnels through
  // this function; these tests cover its id/cursor/viewport/nodeToFrame
  // inclusion rules directly, independent of any particular call site.

  describe("broadcastReplace", () => {
    it("includes only type/payload when every optional field is absent", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({ type: "svg", payload: "<svg/>" });

      expect(JSON.parse(client.sent[0])).toEqual({ action: "replace", type: "svg", payload: "<svg/>" });
    });

    it("includes title, id, and viewport when provided (plain render/history-load path)", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        title: "My diagram",
        id: "snap-1",
        viewport: { scale: 1.4, positionX: 0.1, positionY: -0.2 },
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; A-->B",
        title: "My diagram",
        id: "snap-1",
        viewport: { scale: 1.4, positionX: 0.1, positionY: -0.2 },
      });
    });

    it("includes the step-frames cursor fields (frameLabel/stepFrames/currentFrame/totalFrames) when set", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; C-->D",
        frameLabel: "Step 2",
        stepFrames: true,
        currentFrame: 1,
        totalFrames: 3,
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; C-->D",
        frameLabel: "Step 2",
        stepFrames: true,
        currentFrame: 1,
        totalFrames: 3,
      });
    });

    it("includes nodeToFrame when provided (render/seek/history-load with autonomous navigation)", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        nodeToFrame: { A: 0, B: 1 },
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; A-->B",
        nodeToFrame: { A: 0, B: 1 },
      });
    });

    it("includes frameCount (and omits payload) for the init_step_frames placeholder", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({ type: "step-frames-placeholder", frameCount: 0, title: "TCP Handshake" });

      const sent = JSON.parse(client.sent[0]);
      expect(sent).toEqual({
        action: "replace",
        type: "step-frames-placeholder",
        frameCount: 0,
        title: "TCP Handshake",
      });
      expect(sent).not.toHaveProperty("payload");
    });

    it("omits viewport/nodeToFrame/id/title when undefined, even for a step-frames broadcast", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        stepFrames: true,
        currentFrame: 0,
        totalFrames: 1,
      });

      const sent = JSON.parse(client.sent[0]);
      expect(sent).not.toHaveProperty("viewport");
      expect(sent).not.toHaveProperty("nodeToFrame");
      expect(sent).not.toHaveProperty("id");
      expect(sent).not.toHaveProperty("title");
      expect(sent).not.toHaveProperty("frameLabel");
    });
  });
});
