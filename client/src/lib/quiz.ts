// Client-side quiz types + inline scoring (F46, F47 in docs/03 §10).
// Mirrors the payload shape validated by server/quiz.ts — the two projects
// don't share code (client/ and server/ are separate TS projects), so the
// shapes are duplicated here like scopeCss.ts is.

export type QuizQuestionKind = "single" | "multiple";
export type QuizScoring = "all_or_nothing" | "partial";

export interface QuizOption {
  id: string;
  text: string;
  correct?: boolean;
  weight?: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  kind: QuizQuestionKind;
  options: QuizOption[];
  scoring?: QuizScoring;
  points?: number;
}

export interface Quiz {
  title?: string;
  questions: QuizQuestion[];
}

/** One answer per question: the selected option ids. */
export interface QuizAnswer {
  questionId: string;
  selected: string[];
}

export interface QuestionResult {
  questionId: string;
  earned: number;
  possible: number;
  /** True only when earned === possible. */
  correct: boolean;
}

export interface QuizScore {
  earned: number;
  possible: number;
  results: QuestionResult[];
}

/** Pure scoring: all_or_nothing = exact set match; partial = sum of selected correct options' weights, wrong picks earn nothing. */
export function scoreQuestion(question: QuizQuestion, selected: readonly string[]): QuestionResult {
  const possible = question.points ?? 1;
  const picked = new Set(selected);
  const correctIds = question.options.filter((o) => o.correct === true).map((o) => o.id);

  let fraction: number;
  if (question.scoring === "partial") {
    fraction = question.options
      .filter((o) => o.correct === true && picked.has(o.id))
      .reduce((sum, o) => sum + (o.weight ?? 0), 0);
    fraction = Math.min(1, fraction);
  } else {
    const exact = picked.size === correctIds.length && correctIds.every((id) => picked.has(id));
    fraction = exact ? 1 : 0;
  }

  const earned = fraction * possible;
  return { questionId: question.id, earned, possible, correct: Math.abs(earned - possible) < 1e-9 };
}

export function scoreQuiz(quiz: Quiz, answers: readonly QuizAnswer[]): QuizScore {
  const byId = new Map(answers.map((a) => [a.questionId, a.selected] as const));
  const results = quiz.questions.map((q) => scoreQuestion(q, byId.get(q.id) ?? []));
  return {
    earned: results.reduce((s, r) => s + r.earned, 0),
    possible: results.reduce((s, r) => s + r.possible, 0),
    results,
  };
}
