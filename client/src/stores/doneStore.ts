// Done-button lifecycle — armed/sent/error state driven by the
// set_done_armed WebSocket command and the POST /user-done click handler.
import { get, writable } from "svelte/store";
import type { RenderCommand } from "../ws.js";

export interface DoneViewState {
  armed: boolean;
  sent: boolean;
  error: boolean;
}

function createDoneStore() {
  const state = writable<DoneViewState>({ armed: false, sent: false, error: false });
  let sentTimer: ReturnType<typeof setTimeout> | null = null;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  function dispatch(cmd: RenderCommand) {
    if (cmd.action === "set_done_armed") {
      // Don't cancel an in-flight "Sent ✓" confirmation just because the
      // server unarmed immediately after resolving this click's wait_done()
      // call — sent's own 2s timer (handleDone) owns that lifecycle.
      state.update((s) => ({ ...s, armed: cmd.armed }));
    }
  }

  async function handleDone() {
    if (get(state).sent) return;
    try {
      const res = await fetch("/user-done", { method: "POST" });
      if (!res.ok) throw new Error(`unexpected status ${res.status}`);
    } catch (err) {
      console.error("handleDone: POST /user-done failed", err);
      state.update((s) => ({ ...s, error: true }));
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(() => state.update((s) => ({ ...s, error: false })), 2000);
      return; // leave sent false so the user can retry
    }
    state.update((s) => ({ ...s, sent: true }));
    if (sentTimer) clearTimeout(sentTimer);
    sentTimer = setTimeout(() => state.update((s) => ({ ...s, sent: false })), 2000);
  }

  return { subscribe: state.subscribe, dispatch, handleDone };
}

export const doneStore = createDoneStore();
