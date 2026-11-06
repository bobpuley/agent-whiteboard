// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitQuizAnswers } from "../../../../client/src/lib/quizActions.js";

describe("submitQuizAnswers (F48)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs answers (and a trimmed score) to /quiz/submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await submitQuizAnswers([{ questionId: "q1", selected: ["a"] }], { earned: 1, possible: 2, results: [] });
    expect(fetchMock).toHaveBeenCalledWith("/quiz/submit", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      answers: [{ questionId: "q1", selected: ["a"] }],
      score: { earned: 1, possible: 2 },
    });
  });

  it("omits score for deferred quizzes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await submitQuizAnswers([]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ answers: [] });
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: "no quiz on the canvas" }) }));
    await expect(submitQuizAnswers([])).rejects.toThrow("no quiz on the canvas");
  });
});
