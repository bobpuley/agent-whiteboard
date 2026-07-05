import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDoneArmed,
  resetClick,
  setBroadcastFn,
  signalClick,
  signalDone,
  waitForClick,
  waitForDone,
} from "../../../server/events.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

describe("events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetClick();
    setBroadcastFn(() => {});
    vi.useRealTimers();
  });

  describe("done signal", () => {
    it("waitForDone arms, resolves on signalDone, and disarms", async () => {
      const broadcasts: object[] = [];
      setBroadcastFn((msg) => broadcasts.push(msg));

      const promise = waitForDone();
      expect(getDoneArmed()).toBe(true);
      expect(broadcasts).toContainEqual({ action: "set_done_armed", armed: true });

      signalDone();
      await promise;

      expect(getDoneArmed()).toBe(false);
      expect(broadcasts).toContainEqual({ action: "set_done_armed", armed: false });
    });

    it("waitForDone resolves on its own after the 10-minute timeout", async () => {
      const promise = waitForDone();
      expect(getDoneArmed()).toBe(true);

      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      await promise;

      expect(getDoneArmed()).toBe(false);
    });

    it("a single signalDone resolves multiple concurrent waitForDone calls", async () => {
      const p1 = waitForDone();
      const p2 = waitForDone();
      signalDone();
      await Promise.all([p1, p2]);
      expect(getDoneArmed()).toBe(false);
    });
  });

  describe("click signal", () => {
    it("waitForClick resolves with the event passed to signalClick", async () => {
      const promise = waitForClick();
      signalClick({ type: "node", id: "n1", label: "Node 1", action: null });
      await expect(promise).resolves.toEqual({ type: "node", id: "n1", label: "Node 1", action: null });
    });

    it("waitForClick resolves with a timeout event after 10 minutes", async () => {
      const promise = waitForClick();
      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      await expect(promise).resolves.toEqual({ type: "timeout", id: "", label: "", action: null });
    });

    it("a second waitForClick cancels the first with a timeout event", async () => {
      const first = waitForClick();
      const second = waitForClick();

      await expect(first).resolves.toEqual({ type: "timeout", id: "", label: "", action: null });

      signalClick({ type: "edge", id: "e1", label: "Edge 1", action: "go" });
      await expect(second).resolves.toEqual({ type: "edge", id: "e1", label: "Edge 1", action: "go" });
    });

    it("signalClick is a no-op when no waitForClick is pending", () => {
      expect(() => signalClick({ type: "node", id: "n1", label: "Node 1", action: null })).not.toThrow();
    });

    it("resetClick resolves a pending waitForClick with a timeout event", async () => {
      const promise = waitForClick();
      resetClick();
      await expect(promise).resolves.toEqual({ type: "timeout", id: "", label: "", action: null });
    });
  });
});
