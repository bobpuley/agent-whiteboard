// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { RenderCommand } from "../../../client/src/ws.js";

let capturedHandler: ((cmd: RenderCommand) => void) | null = null;
const connectWebSocketMock = vi.fn((handler: (cmd: RenderCommand) => void) => {
  capturedHandler = handler;
  return vi.fn();
});

vi.mock("../../../client/src/ws.js", () => ({
  connectWebSocket: (handler: (cmd: RenderCommand) => void) => connectWebSocketMock(handler),
}));

const canvasDispatch = vi.fn();
const doneDispatch = vi.fn();

vi.mock("../../../client/src/stores/canvasStore.js", () => ({
  canvasStore: { dispatch: (cmd: RenderCommand) => canvasDispatch(cmd) },
}));

vi.mock("../../../client/src/stores/doneStore.js", () => ({
  doneStore: { dispatch: (cmd: RenderCommand) => doneDispatch(cmd) },
}));

import { disconnected, reconnectExhausted, initRouter } from "../../../client/src/stores/wsRouter.js";

describe("wsRouter", () => {
  beforeEach(() => {
    capturedHandler = null;
    connectWebSocketMock.mockClear();
    canvasDispatch.mockClear();
    doneDispatch.mockClear();
  });

  afterEach(() => {
    disconnected.set(false);
    reconnectExhausted.set(false);
  });

  it("initRouter connects the websocket and returns a cleanup function", () => {
    const cleanup = initRouter();
    expect(connectWebSocketMock).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("fans out incoming commands to both canvasStore and doneStore", () => {
    const cleanup = initRouter();
    const cmd: RenderCommand = { action: "set_done_armed", armed: true };

    capturedHandler!(cmd);

    expect(canvasDispatch).toHaveBeenCalledWith(cmd);
    expect(doneDispatch).toHaveBeenCalledWith(cmd);
    cleanup();
  });

  it("sets disconnected true on ws:disconnected and false on ws:connected", () => {
    const cleanup = initRouter();
    expect(get(disconnected)).toBe(false);

    window.dispatchEvent(new CustomEvent("ws:disconnected"));
    expect(get(disconnected)).toBe(true);

    window.dispatchEvent(new CustomEvent("ws:connected"));
    expect(get(disconnected)).toBe(false);

    cleanup();
  });

  it("tracks reconnectExhausted from the ws:disconnected event detail (F32)", () => {
    const cleanup = initRouter();
    expect(get(reconnectExhausted)).toBe(false);

    window.dispatchEvent(new CustomEvent("ws:disconnected", { detail: { exhausted: false } }));
    expect(get(disconnected)).toBe(true);
    expect(get(reconnectExhausted)).toBe(false);

    window.dispatchEvent(new CustomEvent("ws:disconnected", { detail: { exhausted: true } }));
    expect(get(reconnectExhausted)).toBe(true);

    window.dispatchEvent(new CustomEvent("ws:connected"));
    expect(get(reconnectExhausted)).toBe(false);

    cleanup();
  });

  it("cleanup removes window listeners and calls the ws cleanup", () => {
    const wsCleanup = vi.fn();
    connectWebSocketMock.mockImplementationOnce((handler: (cmd: RenderCommand) => void) => {
      capturedHandler = handler;
      return wsCleanup;
    });

    const cleanup = initRouter();
    cleanup();

    expect(wsCleanup).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent("ws:disconnected"));
    expect(get(disconnected)).toBe(false);
  });
});
