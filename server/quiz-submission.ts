// Quiz submit → wait_quiz handoff (F48, F49 in docs/03 §10).
//
// POST /quiz/submit stores the user's answers; wait_quiz / POST /wait-quiz
// long-poll for them. Modeled on wait_click's single-flight interaction, but
// carrying a payload. A submission made while no wait is armed is retained and
// handed to the next wait_quiz — but only while the same quiz is still on the
// canvas (identity of the Presentation object, which every render / history
// load replaces).

import { createSingleFlightInteraction } from "./interaction.js";
import { parseQuizPayload } from "./quiz.js";
import type { QuizMode, QuizPayload } from "./quiz.js";
import { getCanvas } from "./session.js";
import type { Presentation } from "./presentation.js";

export interface QuizAnswer {
  questionId: string;
  selected: string[];
}

export interface QuizScoreSummary {
  earned: number;
  possible: number;
}

interface Submission {
  presentation: Presentation;
  questions: QuizPayload;
  answers: QuizAnswer[];
  score?: QuizScoreSummary;
}

type QuizEvent =
  | { type: "submitted"; submission: Submission }
  | { type: "timeout" }
  | { type: "superseded" };

const interaction = createSingleFlightInteraction<QuizEvent>({ type: "timeout" }, { type: "superseded" });

let waiting = false;
/** Id of the newest wait — a superseded wait's cleanup must not clear `waiting` for its successor. */
let latestWait = 0;
let retained: Submission | null = null;

function getActiveQuiz(): { presentation: Presentation; quiz: QuizPayload; mode: QuizMode } | null {
  const presentation = getCanvas().presentation;
  const frame = presentation?.frames[0];
  if (!presentation || !frame || frame.type !== "quiz") return null;
  const parsed = parseQuizPayload(frame.payload);
  if (!parsed.ok) return null;
  return { presentation, quiz: parsed.quiz, mode: parsed.mode };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export function submitQuiz(rawAnswers: unknown, rawScore?: unknown): SubmitResult {
  const active = getActiveQuiz();
  if (!active) return { ok: false, error: "no quiz on the canvas" };
  if (!Array.isArray(rawAnswers)) return { ok: false, error: "answers must be an array" };

  const byQuestion = new Map<string, string[]>();
  for (const a of rawAnswers as unknown[]) {
    if (!isRecord(a) || typeof a.questionId !== "string" || !Array.isArray(a.selected) || !a.selected.every((s) => typeof s === "string")) {
      return { ok: false, error: "each answer must be { questionId: string, selected: string[] }" };
    }
    if (byQuestion.has(a.questionId)) return { ok: false, error: `duplicate answer for question "${a.questionId}"` };
    byQuestion.set(a.questionId, a.selected as string[]);
  }

  const answers: QuizAnswer[] = [];
  for (const q of active.quiz.questions) {
    const selected = byQuestion.get(q.id);
    if (!selected || selected.length === 0) return { ok: false, error: `question "${q.id}" is unanswered` };
    if (new Set(selected).size !== selected.length) return { ok: false, error: `duplicate options selected for question "${q.id}"` };
    const known = new Set(q.options.map((o) => o.id));
    if (!selected.every((s) => known.has(s))) return { ok: false, error: `unknown option for question "${q.id}"` };
    if (q.kind === "single" && selected.length !== 1) return { ok: false, error: `question "${q.id}" is single-choice` };
    answers.push({ questionId: q.id, selected });
  }
  for (const id of byQuestion.keys()) {
    if (!active.quiz.questions.some((q) => q.id === id)) return { ok: false, error: `unknown question "${id}"` };
  }

  let score: QuizScoreSummary | undefined;
  if (active.mode === "inline" && rawScore !== undefined) {
    if (!isRecord(rawScore) || typeof rawScore.earned !== "number" || typeof rawScore.possible !== "number"
      || !Number.isFinite(rawScore.earned) || !Number.isFinite(rawScore.possible)
      || rawScore.earned < 0 || rawScore.possible < rawScore.earned) {
      return { ok: false, error: "score must be { earned, possible } with 0 <= earned <= possible" };
    }
    score = { earned: rawScore.earned, possible: rawScore.possible };
  }

  const submission: Submission = {
    presentation: active.presentation,
    questions: active.quiz,
    answers,
    ...(score ? { score } : {}),
  };

  if (waiting) {
    interaction.resolve({ type: "submitted", submission });
  } else {
    retained = submission;
  }
  return { ok: true };
}

export type WaitQuizResult =
  | { ok: true; type: "submitted"; questions: QuizPayload; answers: QuizAnswer[]; score?: QuizScoreSummary }
  | { ok: true; type: "timeout" | "superseded" }
  | { ok: false; error: string };

function toResult(s: Submission): WaitQuizResult {
  return { ok: true, type: "submitted", questions: s.questions, answers: s.answers, ...(s.score ? { score: s.score } : {}) };
}

/** Long-polls for the user's submission (10-minute timeout, shared with wait_done/wait_click). */
export async function waitForQuiz(): Promise<WaitQuizResult> {
  const active = getActiveQuiz();
  if (!active) return { ok: false, error: "no quiz on the canvas — call render({ type: \"quiz\", ... }) first" };

  if (retained) {
    const r = retained;
    retained = null;
    if (r.presentation === active.presentation) return toResult(r);
  }

  const myWait = ++latestWait;
  waiting = true;
  try {
    const event = await interaction.await();
    return event.type === "submitted" ? toResult(event.submission) : { ok: true, type: event.type };
  } finally {
    if (myWait === latestWait) waiting = false;
  }
}

/** Drops retained/pending state — for tests only. */
export function resetQuizSubmission(): void {
  retained = null;
  interaction.reset();
  waiting = false;
}
