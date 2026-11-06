// Quiz payload parsing + validation (F44, F45, F47 in docs/03 §10).
//
// A quiz is a single-frame `render()` payload: JSON describing questions with
// predefined options. Mode is derived from the answer key (F45): every
// question has a `correct` option → "inline" (client scores); none do →
// "deferred" (the agent scores via wait_quiz); a mix is rejected.

export type QuizQuestionKind = "single" | "multiple";
export type QuizScoring = "all_or_nothing" | "partial";
export type QuizMode = "inline" | "deferred";

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

export interface QuizPayload {
  title?: string;
  questions: QuizQuestion[];
}

export type QuizParseResult =
  | { ok: true; quiz: QuizPayload; mode: QuizMode }
  | { ok: false; error: string };

const WEIGHT_EPSILON = 1e-6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(error: string): QuizParseResult {
  return { ok: false, error: `invalid quiz payload: ${error}` };
}

export function parseQuizPayload(payload: string): QuizParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return fail("payload must be valid JSON");
  }
  if (!isRecord(raw)) return fail("payload must be a JSON object");
  if (raw.title !== undefined && typeof raw.title !== "string") return fail("title must be a string");
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    return fail("questions must be a non-empty array");
  }

  const questionIds = new Set<string>();
  let keyedCount = 0;

  for (const [qi, q] of raw.questions.entries()) {
    const where = `questions[${qi}]`;
    if (!isRecord(q)) return fail(`${where} must be an object`);
    if (typeof q.id !== "string" || q.id === "") return fail(`${where}.id must be a non-empty string`);
    if (questionIds.has(q.id)) return fail(`duplicate question id "${q.id}"`);
    questionIds.add(q.id);
    if (typeof q.text !== "string" || q.text === "") return fail(`${where}.text must be a non-empty string`);
    if (q.kind !== "single" && q.kind !== "multiple") return fail(`${where}.kind must be "single" or "multiple"`);
    if (q.scoring !== undefined && q.scoring !== "all_or_nothing" && q.scoring !== "partial") {
      return fail(`${where}.scoring must be "all_or_nothing" or "partial"`);
    }
    if (q.scoring === "partial" && q.kind !== "multiple") {
      return fail(`${where}: partial scoring is only valid for kind "multiple"`);
    }
    if (q.points !== undefined && (typeof q.points !== "number" || !Number.isFinite(q.points) || q.points <= 0)) {
      return fail(`${where}.points must be a positive number`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return fail(`${where}.options must be an array of at least 2 options`);
    }

    const optionIds = new Set<string>();
    let correctCount = 0;
    let weightSum = 0;
    let weightedCount = 0;
    for (const [oi, o] of q.options.entries()) {
      const ow = `${where}.options[${oi}]`;
      if (!isRecord(o)) return fail(`${ow} must be an object`);
      if (typeof o.id !== "string" || o.id === "") return fail(`${ow}.id must be a non-empty string`);
      if (optionIds.has(o.id)) return fail(`duplicate option id "${o.id}" in question "${q.id}"`);
      optionIds.add(o.id);
      if (typeof o.text !== "string" || o.text === "") return fail(`${ow}.text must be a non-empty string`);
      if (o.correct !== undefined && typeof o.correct !== "boolean") return fail(`${ow}.correct must be a boolean`);
      if (o.weight !== undefined) {
        if (typeof o.weight !== "number" || !Number.isFinite(o.weight) || o.weight <= 0) {
          return fail(`${ow}.weight must be a positive number`);
        }
        if (o.correct !== true) return fail(`${ow}: weight is only valid on a correct option`);
        if (q.scoring !== "partial") return fail(`${ow}: weight requires scoring "partial"`);
        weightSum += o.weight;
        weightedCount++;
      }
      if (o.correct === true) correctCount++;
    }

    if (correctCount > 0) keyedCount++;
    if (correctCount > 0 && q.kind === "single" && correctCount !== 1) {
      return fail(`question "${q.id}" is single-choice but has ${correctCount} correct options`);
    }
    if (correctCount > 0 && q.scoring === "partial") {
      if (weightedCount !== correctCount) {
        return fail(`question "${q.id}": every correct option needs a weight under partial scoring`);
      }
      if (Math.abs(weightSum - 1) > WEIGHT_EPSILON) {
        return fail(`question "${q.id}": correct option weights must sum to 1 (got ${weightSum})`);
      }
    }
  }

  if (keyedCount !== 0 && keyedCount !== raw.questions.length) {
    return fail("answer key is mixed: either every question has a correct option (inline) or none does (deferred)");
  }

  return { ok: true, quiz: raw as unknown as QuizPayload, mode: keyedCount === 0 ? "deferred" : "inline" };
}

/** Returns null on success, an error string on failure (validateFrame convention). */
export function validateQuizPayload(payload: string): string | null {
  const result = parseQuizPayload(payload);
  return result.ok ? null : result.error;
}
