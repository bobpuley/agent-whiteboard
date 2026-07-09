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

  it("broadcastStepFrames broadcasts the frame at cursor with per-frame type override", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    const frames = [
      { payload: "A", label: "Step 1" },
      { payload: "B", label: "Step 2", type: "katex" },
    ];
    broadcastStepFrames(frames, "mermaid", 1, "sf-1", "Seq Title");

    expect(JSON.parse(client.sent[0])).toEqual({
      action: "replace",
      type: "katex",
      payload: "B",
      frameLabel: "Step 2",
      cursor: 1,
      total: 2,
      title: "Seq Title",
      id: "sf-1",
    });
  });

  it("broadcastStepFrames falls back to frameType and omits title when absent", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames([{ payload: "A" }], "mermaid", 0, "sf-2");

    expect(JSON.parse(client.sent[0])).toEqual({
      action: "replace",
      type: "mermaid",
      payload: "A",
      frameLabel: undefined,
      cursor: 0,
      total: 1,
      id: "sf-2",
    });
  });

  it("broadcastStepFrames forwards nodeToFrame when provided (bug B18 in docs/01 — was silently dropped)", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames(
      [{ payload: "A" }, { payload: "B" }],
      "mermaid",
      0,
      "sf-3",
      "Seq Title",
      { A: 0, B: 1 }
    );

    expect(JSON.parse(client.sent[0])).toMatchObject({
      action: "replace",
      id: "sf-3",
      nodeToFrame: { A: 0, B: 1 },
    });
  });

  it("broadcastStepFrames omits nodeToFrame when not provided", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames([{ payload: "A" }], "mermaid", 0, "sf-4");

    expect(JSON.parse(client.sent[0])).not.toHaveProperty("nodeToFrame");
  });

  it("broadcastStepFrames forwards viewport when provided (bug B19/FR21 in docs/01 — per-frame restore)", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames(
      [{ payload: "A" }],
      "mermaid",
      0,
      "sf-5",
      undefined,
      undefined,
      { scale: 1.2, positionX: 0.1, positionY: -0.1 }
    );

    expect(JSON.parse(client.sent[0])).toMatchObject({
      viewport: { scale: 1.2, positionX: 0.1, positionY: -0.1 },
    });
  });

  it("broadcastStepFrames omits viewport when not provided", () => {
    const client = new FakeSocket();
    addClient(client as never);
    client.sent = [];

    broadcastStepFrames([{ payload: "A" }], "mermaid", 0, "sf-6");

    expect(JSON.parse(client.sent[0])).not.toHaveProperty("viewport");
  });

  // ── broadcastReplace — single "replace" builder (v0.23, U5) ─────────────────
  // Every render/step/seek/history-load/slideshow call path funnels through
  // this function; these tests cover its id/cursor/viewport/nodeToFrame
  // inclusion rules directly, independent of any particular call site.

  describe("broadcastReplace", () => {
    it("includes only type/payload/id/cursor/total when every optional field is absent", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({ type: "svg", payload: "<svg/>", id: "snap-0", cursor: 0, total: 1 });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "svg",
        payload: "<svg/>",
        id: "snap-0",
        cursor: 0,
        total: 1,
      });
    });

    it("includes title and viewport when provided (plain render/history-load path)", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        id: "snap-1",
        cursor: 0,
        total: 1,
        title: "My diagram",
        viewport: { scale: 1.4, positionX: 0.1, positionY: -0.2 },
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; A-->B",
        id: "snap-1",
        cursor: 0,
        total: 1,
        title: "My diagram",
        viewport: { scale: 1.4, positionX: 0.1, positionY: -0.2 },
      });
    });

    it("carries a cursor/total other than 0/1 plus frameLabel for a step-frames frame (v0.26 Sprint 42 — replaces the old stepFrames boolean)", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; C-->D",
        id: "snap-2",
        cursor: 1,
        total: 3,
        frameLabel: "Step 2",
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; C-->D",
        id: "snap-2",
        cursor: 1,
        total: 3,
        frameLabel: "Step 2",
      });
    });

    it("includes nodeToFrame when provided (render/seek/history-load with autonomous navigation)", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        id: "snap-3",
        cursor: 0,
        total: 1,
        nodeToFrame: { A: 0, B: 1 },
      });

      expect(JSON.parse(client.sent[0])).toEqual({
        action: "replace",
        type: "mermaid",
        payload: "graph TD; A-->B",
        id: "snap-3",
        cursor: 0,
        total: 1,
        nodeToFrame: { A: 0, B: 1 },
      });
    });

    it("includes frameCount (and omits payload/id/cursor/total) for the init_step_frames placeholder", () => {
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
      expect(sent).not.toHaveProperty("id");
      expect(sent).not.toHaveProperty("cursor");
      expect(sent).not.toHaveProperty("total");
    });

    it("omits viewport/nodeToFrame/title/frameLabel when undefined, even for a step-frames broadcast", () => {
      const client = new FakeSocket();
      addClient(client as never);
      client.sent = [];

      broadcastReplace({
        type: "mermaid",
        payload: "graph TD; A-->B",
        id: "snap-4",
        cursor: 0,
        total: 1,
      });

      const sent = JSON.parse(client.sent[0]);
      expect(sent).not.toHaveProperty("viewport");
      expect(sent).not.toHaveProperty("nodeToFrame");
      expect(sent).not.toHaveProperty("title");
      expect(sent).not.toHaveProperty("frameLabel");
    });
  });
});
