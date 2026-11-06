import type { Hono } from "hono";
import { submitQuiz, waitForQuiz } from "../quiz-submission.js";

export function registerQuizRoutes(app: Hono): void {
  // Browser → server: the user's answers (and, for an inline quiz, the
  // client-computed score). Resolves a pending wait_quiz, or is retained for the next one.
  app.post("/quiz/submit", async (c) => {
    const body = await c.req.json<{ answers?: unknown; score?: unknown }>().catch(() => ({}) as { answers?: unknown; score?: unknown });
    const result = submitQuiz(body.answers, body.score);
    return c.json(result, result.ok ? 200 : 400);
  });

  // REST twin of the MCP wait_quiz tool.
  app.post("/wait-quiz", async (c) => c.json(await waitForQuiz()));
}
