import { describe, expect, it } from "vitest";
import { scoreQuestion, scoreQuiz } from "../../../../client/src/lib/quiz.js";
import type { Quiz, QuizQuestion } from "../../../../client/src/lib/quiz.js";

const multi = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: "m", text: "?", kind: "multiple",
  options: [{ id: "a", text: "A", correct: true, weight: 0.25 }, { id: "b", text: "B", correct: true, weight: 0.75 }, { id: "c", text: "C" }],
  ...over,
});

describe("scoreQuestion (F47)", () => {
  it("all_or_nothing: exact set earns full points", () => {
    expect(scoreQuestion(multi(), ["b", "a"])).toMatchObject({ earned: 1, possible: 1, correct: true });
  });

  it("all_or_nothing: a missing or extra pick earns 0", () => {
    expect(scoreQuestion(multi(), ["a"]).earned).toBe(0);
    expect(scoreQuestion(multi(), ["a", "b", "c"]).earned).toBe(0);
    expect(scoreQuestion(multi(), []).earned).toBe(0);
  });

  it("single choice: the one correct option scores", () => {
    const q: QuizQuestion = { id: "s", text: "?", kind: "single", options: [{ id: "x", text: "X", correct: true }, { id: "y", text: "Y" }] };
    expect(scoreQuestion(q, ["x"]).correct).toBe(true);
    expect(scoreQuestion(q, ["y"]).correct).toBe(false);
  });

  it("partial: sums the weights of selected correct options", () => {
    const q = multi({ scoring: "partial" });
    expect(scoreQuestion(q, ["a"])).toMatchObject({ earned: 0.25, correct: false });
    expect(scoreQuestion(q, ["b"]).earned).toBe(0.75);
    expect(scoreQuestion(q, ["a", "b"])).toMatchObject({ earned: 1, correct: true });
  });

  it("partial: wrong picks earn nothing and don't subtract", () => {
    const q = multi({ scoring: "partial" });
    expect(scoreQuestion(q, ["a", "c"]).earned).toBe(0.25);
    expect(scoreQuestion(q, ["c"]).earned).toBe(0);
  });

  it("scales by points (default 1)", () => {
    expect(scoreQuestion(multi({ points: 4 }), ["a", "b"])).toMatchObject({ earned: 4, possible: 4 });
    expect(scoreQuestion(multi({ scoring: "partial", points: 4 }), ["a"]).earned).toBe(1);
  });
});

describe("scoreQuiz", () => {
  const quiz: Quiz = {
    questions: [
      multi({ id: "q1", points: 2 }),
      { id: "q2", text: "?", kind: "single", options: [{ id: "x", text: "X", correct: true }, { id: "y", text: "Y" }] },
    ],
  };

  it("totals earned and possible across questions", () => {
    const s = scoreQuiz(quiz, [{ questionId: "q1", selected: ["a", "b"] }, { questionId: "q2", selected: ["y"] }]);
    expect(s).toMatchObject({ earned: 2, possible: 3 });
    expect(s.results.map((r) => r.correct)).toEqual([true, false]);
  });

  it("treats unanswered questions as 0", () => {
    expect(scoreQuiz(quiz, [])).toMatchObject({ earned: 0, possible: 3 });
  });
});
