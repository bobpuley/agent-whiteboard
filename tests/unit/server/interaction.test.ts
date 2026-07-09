import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBroadcastInteraction,
  createSingleFlightInteraction,
  getDoneArmed,
  resetClick,
  setBroadcastFn,
  signalClick,
  signalDone,
  waitForClick,
  waitForDone,
} from "../../../server/interaction.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

describe("interaction primitive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createBroadcastInteraction", () => {
    it("resolves a pending await() with the event passed to resolve()", async () => {
      const interaction = createBroadcastInteraction<string>();
      const promise = interaction.await();
      interaction.resolve("event");
      await expect(promise).resolves.toBe("event");
    });

    it("a single resolve() wakes multiple concurrent await() calls", async () => {
      const interaction = createBroadcastInteraction<string>();
      const p1 = interaction.await();
      const p2 = interaction.await();
      interaction.resolve("event");
      await expect(Promise.all([p1, p2])).resolves.toEqual(["event", "event"]);
    });

    it("await() resolves with undefined after the timeout with no resolve()", async () => {
      const interaction = createBroadcastInteraction<string>();
      const promise = interaction.await();
      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe("createSingleFlightInteraction", () => {
    it("resolves a pending await() with the event passed to resolve()", async () => {
      const interaction = createSingleFlightInteraction<string>("cancelled");
      const promise = interaction.await();
      interaction.resolve("event");
      await expect(promise).resolves.toBe("event");
    });

    it("a new await() cancels a pending one with the cancel event", async () => {
      const interaction = createSingleFlightInteraction<string>("cancelled");
      const first = interaction.await();
      const second = interaction.await();
      await expect(first).resolves.toBe("cancelled");
      interaction.resolve("event");
      await expect(second).resolves.toBe("event");
    });

    it("await() resolves with the cancel event after the timeout", async () => {
      const interaction = createSingleFlightInteraction<string>("cancelled");
      const promise = interaction.await();
      await vi.advanceTimersByTimeAsync(TEN_MINUTES_MS);
      await expect(promise).resolves.toBe("cancelled");
    });

    it("resolve() is a no-op when nothing is pending", () => {
      const interaction = createSingleFlightInteraction<string>("cancelled");
      expect(() => interaction.resolve("event")).not.toThrow();
    });

    it("reset() resolves a pending await() with the cancel event", async () => {
      const interaction = createSingleFlightInteraction<string>("cancelled");
      const promise = interaction.await();
      interaction.reset();
      await expect(promise).resolves.toBe("cancelled");
    });
  });

  // wait_done and wait_click are configurations of the primitives above
  // (D4, U7) — same behavior as before the refactor (F9, U4b).
  describe("wait_done — broadcast configuration", () => {
    afterEach(() => {
      setBroadcastFn(() => {});
    });

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

  describe("wait_click — single-flight configuration", () => {
    afterEach(() => {
      resetClick();
    });

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
