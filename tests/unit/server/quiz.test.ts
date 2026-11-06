import { describe, expect, it } from "vitest";
import { parseQuizPayload, validateQuizPayload } from "../../../server/quiz.js";
import { validateRenderPayload, validateFrame } from "../../../server/validate.js";

const opt = (id: string, correct?: boolean, weight?: number) => ({ id, text: `Option ${id}`, ...(correct !== undefined ? { correct } : {}), ...(weight !== undefined ? { weight } : {}) });
const q = (over: Record<string, unknown> = {}) => ({ id: "q1", text: "Q?", kind: "single", options: [opt("a", true), opt("b")], ...over });
const payload = (...questions: unknown[]) => JSON.stringify({ questions });

describe("parseQuizPayload (F44/F45/F47)", () => {
  it("derives inline mode when every question has a correct option", () => {
    const r = parseQuizPayload(payload(q(), q({ id: "q2" })));
    expect(r).toMatchObject({ ok: true, mode: "inline" });
  });

  it("derives deferred mode when no question has a correct option", () => {
    const r = parseQuizPayload(payload(q({ options: [opt("a"), opt("b")] })));
    expect(r).toMatchObject({ ok: true, mode: "deferred" });
  });

  it("rejects a mixed answer key", () => {
    const r = parseQuizPayload(payload(q(), q({ id: "q2", options: [opt("a"), opt("b")] })));
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/mixed/);
  });

  it.each([
    ["not JSON", "nope"],
    ["not an object", "[]"],
    ["no questions", JSON.stringify({ questions: [] })],
    ["bad title", JSON.stringify({ title: 3, questions: [q()] })],
    ["duplicate question ids", payload(q(), q())],
    ["duplicate option ids", payload(q({ options: [opt("a", true), opt("a")] }))],
    ["fewer than 2 options", payload(q({ options: [opt("a", true)] }))],
    ["bad kind", payload(q({ kind: "essay" }))],
    ["single with two correct", payload(q({ options: [opt("a", true), opt("b", true)] }))],
    ["partial on single", payload(q({ scoring: "partial" }))],
    ["non-positive points", payload(q({ points: 0 }))],
    ["empty question text", payload(q({ text: "" }))],
  ])("rejects: %s", (_name, p) => {
    expect(validateQuizPayload(p)).toMatch(/^invalid quiz payload:/);
  });

  it("accepts partial scoring with weights summing to 1", () => {
    const r = parseQuizPayload(payload(q({ kind: "multiple", scoring: "partial", options: [opt("a", true, 0.25), opt("b", true, 0.75), opt("c")] })));
    expect(r.ok).toBe(true);
  });

  it("rejects partial weights that don't sum to 1", () => {
    expect(validateQuizPayload(payload(q({ kind: "multiple", scoring: "partial", options: [opt("a", true, 0.5), opt("b", true, 0.4), opt("c")] })))).toMatch(/sum to 1/);
  });

  it("rejects a partial question where a correct option lacks a weight", () => {
    expect(validateQuizPayload(payload(q({ kind: "multiple", scoring: "partial", options: [opt("a", true, 1), opt("b", true), opt("c")] })))).toMatch(/needs a weight/);
  });

  it("rejects weight on a non-correct option or without partial scoring", () => {
    expect(validateQuizPayload(payload(q({ kind: "multiple", scoring: "partial", options: [opt("a", true, 1), { ...opt("b"), weight: 0.5 }] })))).toMatch(/weight is only valid/);
    expect(validateQuizPayload(payload(q({ kind: "multiple", options: [opt("a", true, 1), opt("b", true)] })))).toMatch(/requires scoring/);
  });
});

describe("validateRenderPayload", () => {
  it("routes quiz payloads to the quiz validator", async () => {
    expect(await validateRenderPayload("quiz", payload(q()))).toBeNull();
    expect(await validateRenderPayload("quiz", "nope")).toMatch(/invalid quiz payload/);
  });

  it("delegates other types to validateFrame", async () => {
    expect(await validateRenderPayload("vega-lite", "nope")).toMatch(/vega-lite/);
  });

  it("keeps quiz out of the frame validator (slideshow / step-frames)", async () => {
    expect(await validateFrame({ type: "quiz", payload: payload(q()) })).toMatch(/type must be one of/);
  });
});
