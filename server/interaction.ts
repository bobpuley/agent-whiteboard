// Interaction primitive (U7, D4 — v0.26 Sprints 46-47): one arm/await/resolve
// mechanism for every server-side "wait for the browser user" signal.
// `wait_done` and `wait_click` are configurations of it, distinguished only
// by their resolution mode:
//   - broadcast:     every pending await() gets its own listener; one
//                     resolve() wakes all of them (wait_done — F9).
//   - single-flight:  at most one pending await() at a time; a new arm on
//                     this interaction, or an external supersede() call from
//                     a different one taking over the return channel, cancels
//                     the previous one with `type: "superseded"` rather than
//                     leaving it to the plain-inactivity `"timeout"` (Sprint
//                     47, OQ11 — wait_done() superseding a pending
//                     wait_click() is the one cross-interaction case today).
// `node_to_frame` (U4e) is the same primitive conceptually — arm on commit,
// resolve on click — but its resolver runs entirely client-side (the browser
// calls POST /seek directly instead of round-tripping through the agent), so
// it has no server-side arm/await state and nothing here to share code with.
// Its auto-restore (Sprint 47, OQ12) lives purely in canvasStore.ts's reducer.

import { EventEmitter } from "node:events";

export const INTERACTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Every pending await() resolves independently; resolve() wakes all of them. */
export function createBroadcastInteraction<E>(): {
  await(): Promise<E | undefined>;
  resolve(event: E): void;
} {
  const bus = new EventEmitter();
  return {
    resolve(event: E): void {
      bus.emit("resolve", event);
    },
    await(): Promise<E | undefined> {
      return new Promise((resolve) => {
        const onResolve = (event: E) => {
          clearTimeout(timer);
          resolve(event);
        };
        const timer = setTimeout(() => {
          bus.off("resolve", onResolve);
          resolve(undefined);
        }, INTERACTION_TIMEOUT_MS);
        bus.once("resolve", onResolve);
      });
    },
  };
}

/**
 * At most one pending await() at a time. A new arm — either a fresh await()
 * on this same interaction, or an external supersede() call from a different
 * interaction taking over the return channel (D4, v0.26 Sprint 47 — e.g.
 * wait_done() superseding a pending wait_click()) — cancels the previous one
 * with `supersededEvent`. A pending await() left untouched for the full
 * `INTERACTION_TIMEOUT_MS` resolves on its own with `timeoutEvent` instead.
 */
export function createSingleFlightInteraction<E>(timeoutEvent: E, supersededEvent: E): {
  await(): Promise<E>;
  resolve(event: E): void;
  supersede(): void;
  reset(): void;
} {
  let pending: ((event: E) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function settle(event: E): void {
    const resolve = pending;
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    resolve?.(event);
  }

  return {
    resolve(event: E): void {
      if (!pending) return; // no-op when nothing is armed
      settle(event);
    },
    await(): Promise<E> {
      if (pending) settle(supersededEvent); // a new arm supersedes the previous one
      return new Promise((resolve) => {
        pending = resolve;
        timer = setTimeout(() => settle(timeoutEvent), INTERACTION_TIMEOUT_MS);
      });
    },
    supersede(): void {
      if (!pending) return; // no-op when nothing is armed
      settle(supersededEvent);
    },
    reset(): void {
      settle(timeoutEvent);
    },
  };
}

// ── Done signal (F9, U4a) ────────────────────────────────────────────────────

let doneArmed = false;

export function getDoneArmed(): boolean {
  return doneArmed;
}

// Lazily imported to avoid circular dependency (ws.ts imports interaction.ts indirectly).
let _broadcastFn: ((msg: object) => void) | null = null;
export function setBroadcastFn(fn: (msg: object) => void): void {
  _broadcastFn = fn;
}

function broadcastDoneArmed(armed: boolean): void {
  _broadcastFn?.({ action: "set_done_armed", armed });
}

const doneInteraction = createBroadcastInteraction<void>();

/** Signal that the user clicked Done — wakes all pending waitForDone() calls. */
export function signalDone(): void {
  doneInteraction.resolve(undefined);
}

/** Resolve when the user clicks Done (or after the timeout). */
export async function waitForDone(): Promise<void> {
  doneArmed = true;
  broadcastDoneArmed(true);
  // Arming Done takes over the return channel from a pending click (D4, one
  // Interaction primitive) — supersede it rather than leaving it to time out.
  clickInteraction.supersede();
  await doneInteraction.await();
  doneArmed = false;
  broadcastDoneArmed(false);
}

// ── Click signal (U4b/U4c) ───────────────────────────────────────────────────

export interface ClickEvent {
  type: "node" | "edge" | "timeout" | "superseded";
  id: string;
  label: string;
  action: string | null;
}

const CLICK_TIMEOUT_EVENT: ClickEvent = { type: "timeout", id: "", label: "", action: null };
const CLICK_SUPERSEDED_EVENT: ClickEvent = { type: "superseded", id: "", label: "", action: null };

const clickInteraction = createSingleFlightInteraction<ClickEvent>(CLICK_TIMEOUT_EVENT, CLICK_SUPERSEDED_EVENT);

/** Signal that the user clicked a node/edge — resolves the pending waitForClick(). No-op if none pending. */
export function signalClick(event: ClickEvent): void {
  clickInteraction.resolve(event);
}

/**
 * Resolve when the user clicks a node/edge (or after the timeout).
 * At most one call may be pending — a second `wait_click()` (or an arming
 * `wait_done()`) supersedes it, resolving with `type: "superseded"` (v0.26
 * Sprint 47, OQ11) rather than the plain-inactivity `type: "timeout"`.
 */
export function waitForClick(): Promise<ClickEvent> {
  return clickInteraction.await();
}

/** Reset click state — for use in tests only. */
export function resetClick(): void {
  clickInteraction.reset();
}
