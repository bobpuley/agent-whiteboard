import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("../../../server/snapshot-writer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/snapshot-writer.js")>();
  return { ...actual, saveSnapshot: vi.fn(), generateSnapshotId: vi.fn(() => "quiz-id") };
});
vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
  broadcastReplace: vi.fn(),
  broadcastStepFrames: vi.fn(),
  addClient: vi.fn(),
}));

import { createApp } from "../../../server/app.js";
import { createMcpServer } from "../../../server/mcp.js";
import { resetCanvas, resetLastWorkspace } from "../../../server/session.js";
import { INTERACTION_TIMEOUT_MS } from "../../../server/interaction.js";
import { resetQuizSubmission } from "../../../server/quiz-submission.js";

const app = createApp();
const WS = "quiz-ws";

const deferredQuiz = JSON.stringify({
  questions: [
    { id: "q1", text: "Why?", kind: "single", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
    { id: "q2", text: "Which?", kind: "multiple", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] },
  ],
});
const inlineQuiz = JSON.stringify({
  questions: [{ id: "q1", text: "?", kind: "single", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] }],
});
const goodAnswers = [{ questionId: "q1", selected: ["a"] }, { questionId: "q2", selected: ["b", "c"] }];

async function renderQuiz(payload: string) {
  await app.request("/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "quiz", payload, options: { workspace: WS } }),
  });
}
const submit = (body: unknown) =>
  app.request("/quiz/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const waitQuiz = () => app.request("/wait-quiz", { method: "POST" }).then((r) => r.json() as Promise<Record<string, unknown>>);

beforeEach(() => {
  resetCanvas();
  resetLastWorkspace();
  resetQuizSubmission();
});
afterEach(() => {
  vi.useRealTimers();
  resetQuizSubmission();
});

describe("POST /quiz/submit + POST /wait-quiz (F48/F49)", () => {
  it("wait-quiz returns the questions and answers once the user submits", async () => {
    await renderQuiz(deferredQuiz);
    const pending = waitQuiz();
    await Promise.resolve();
    const res = await submit({ answers: goodAnswers });
    expect(res.status).toBe(200);
    const result = await pending;
    expect(result).toMatchObject({ ok: true, type: "submitted", answers: goodAnswers });
    expect((result.questions as { questions: unknown[] }).questions).toHaveLength(2);
    expect(result.score).toBeUndefined();
  });

  it("retains a submission made before wait-quiz and returns it immediately, once", async () => {
    await renderQuiz(deferredQuiz);
    await submit({ answers: goodAnswers });
    expect(await waitQuiz()).toMatchObject({ ok: true, type: "submitted", answers: goodAnswers });
    vi.useFakeTimers();
    const second = waitQuiz();
    await vi.advanceTimersByTimeAsync(INTERACTION_TIMEOUT_MS);
    expect(await second).toEqual({ ok: true, type: "timeout" });
  });

  it("discards a retained submission when the canvas has since been replaced", async () => {
    await renderQuiz(deferredQuiz);
    await submit({ answers: goodAnswers });
    await renderQuiz(deferredQuiz); // new render → new quiz instance
    vi.useFakeTimers();
    const pending = waitQuiz();
    await vi.advanceTimersByTimeAsync(INTERACTION_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: true, type: "timeout" });
  });

  it("times out after the shared 10-minute interaction timeout", async () => {
    await renderQuiz(deferredQuiz);
    vi.useFakeTimers();
    const pending = waitQuiz();
    await vi.advanceTimersByTimeAsync(INTERACTION_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: true, type: "timeout" });
  });

  it("a second wait-quiz supersedes the pending one", async () => {
    await renderQuiz(deferredQuiz);
    const first = waitQuiz();
    await Promise.resolve();
    const second = waitQuiz();
    expect(await first).toEqual({ ok: true, type: "superseded" });
    await Promise.resolve();
    await submit({ answers: goodAnswers });
    expect(await second).toMatchObject({ type: "submitted" });
  });

  it("includes the client-computed score for an inline quiz and ignores it for a deferred one", async () => {
    await renderQuiz(inlineQuiz);
    await submit({ answers: [{ questionId: "q1", selected: ["a"] }], score: { earned: 1, possible: 1 } });
    expect(await waitQuiz()).toMatchObject({ type: "submitted", score: { earned: 1, possible: 1 } });

    await renderQuiz(deferredQuiz);
    await submit({ answers: goodAnswers, score: { earned: 9, possible: 9 } });
    expect((await waitQuiz()).score).toBeUndefined();
  });

  it("errors when no quiz is on the canvas", async () => {
    expect(await waitQuiz()).toMatchObject({ ok: false, error: expect.stringMatching(/no quiz on the canvas/) });
    const res = await submit({ answers: goodAnswers });
    expect(res.status).toBe(400);
  });

  it.each([
    ["answers not an array", { answers: "x" }, /answers must be an array/],
    ["malformed answer", { answers: [{ questionId: 1, selected: [] }] }, /each answer must be/],
    ["unanswered question", { answers: [{ questionId: "q1", selected: ["a"] }] }, /"q2" is unanswered/],
    ["unknown option", { answers: [{ questionId: "q1", selected: ["z"] }, { questionId: "q2", selected: ["a"] }] }, /unknown option/],
    ["two picks on single-choice", { answers: [{ questionId: "q1", selected: ["a", "b"] }, { questionId: "q2", selected: ["a"] }] }, /single-choice/],
    ["duplicate answer", { answers: [...goodAnswers, goodAnswers[0]] }, /duplicate answer/],
    ["unknown question", { answers: [...goodAnswers, { questionId: "q9", selected: ["a"] }] }, /unknown question/],
  ])("rejects an invalid submission: %s", async (_n, body, msg) => {
    await renderQuiz(deferredQuiz);
    const res = await submit(body);
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ ok: false, error: expect.stringMatching(msg) });
  });

  it("rejects a bad inline score", async () => {
    await renderQuiz(inlineQuiz);
    const res = await submit({ answers: [{ questionId: "q1", selected: ["a"] }], score: { earned: 5, possible: 1 } });
    expect(res.status).toBe(400);
  });
});

describe("MCP tool: wait_quiz (F49) — parity with POST /wait-quiz", () => {
  interface Registered { handler: (a: unknown, e: unknown) => Promise<{ content: { text: string }[] }> }
  async function callTool(server: McpServer, name: string) {
    const tools = (server as unknown as { _registeredTools: Record<string, Registered> })._registeredTools;
    return JSON.parse((await tools[name].handler({}, {})).content[0].text) as Record<string, unknown>;
  }

  it("returns the same payload as REST", async () => {
    const server = createMcpServer();
    await renderQuiz(deferredQuiz);
    const pending = callTool(server, "wait_quiz");
    await Promise.resolve();
    await submit({ answers: goodAnswers });
    expect(await pending).toMatchObject({ ok: true, type: "submitted", answers: goodAnswers });
  });

  it("returns the same error as REST when no quiz is on screen", async () => {
    const server = createMcpServer();
    expect(await callTool(server, "wait_quiz")).toEqual(await waitQuiz());
  });
});

describe("quiz snapshots — history reload & HTML export (F50)", () => {
  it("history-load accepts a single-frame quiz snapshot and redisplays it as a fresh quiz", async () => {
    const { applyLoadedSnapshotResult } = await import("../../../server/render-core.js");
    const { getCanvas } = await import("../../../server/session.js");
    const result = await applyLoadedSnapshotResult([{ type: "quiz", payload: deferredQuiz }], WS, undefined, undefined, "snap-1", undefined);
    expect(result).toMatchObject({ ok: true });
    expect(getCanvas().presentation?.frames[0]).toEqual({ type: "quiz", payload: deferredQuiz });
  });

  it("history-load rejects a quiz frame inside a multi-frame sequence", async () => {
    const { applyLoadedSnapshotResult } = await import("../../../server/render-core.js");
    const result = await applyLoadedSnapshotResult(
      [{ type: "quiz", payload: deferredQuiz }, { type: "svg", payload: "<svg/>" }], WS, undefined, undefined, "snap-2", undefined);
    expect(result.ok).toBe(false);
  });
});
