// Server call for the in-quiz Submit button (F48). Kept out of Quiz.svelte,
// like snapshotActions.ts for the modals.
import type { QuizAnswer, QuizScore } from "./quiz";
import type { ApiResult } from "./snapshotTypes";

export async function submitQuizAnswers(answers: QuizAnswer[], score?: QuizScore): Promise<void> {
  const res = await fetch("/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, ...(score ? { score: { earned: score.earned, possible: score.possible } } : {}) }),
  });
  const data = (await res.json().catch(() => ({ ok: false }))) as ApiResult;
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Quiz submit failed");
}
