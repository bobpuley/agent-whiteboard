---
name: whiteboard-assessment
description: Run quizzes on the Agent Whiteboard — inline self-check quizzes scored in the browser, deferred quizzes graded by the agent via wait_quiz, teach-quiz-remediate loops and spaced review. Use when the user wants to be tested, to review knowledge, or after teaching a topic. Builds on the agent-whiteboard skill.
---

# Assessment with quizzes

Read `agent-whiteboard` first. Quizzes are `render(type="quiz")` payloads; they cannot go in slideshows or step-frames.

## Payload
```json
{ "title": "Check-in",
  "questions": [
    { "id": "q1", "text": "Which verb is idempotent?", "kind": "single",
      "options": [{"id":"a","text":"PUT","correct":true},{"id":"b","text":"POST"}] },
    { "id": "q2", "text": "Pick the primes", "kind": "multiple", "scoring": "partial", "points": 2,
      "options": [{"id":"a","text":"2","correct":true,"weight":0.5},
                  {"id":"b","text":"3","correct":true,"weight":0.5},
                  {"id":"c","text":"4"}] } ] }
```
- Ids unique within the quiz / question. `kind`: `single` or `multiple`.
- `scoring`: `all_or_nothing` (default; exact correct set earns `points`, default 1) or `partial` (multiple only; correct options carry `weight`s summing to 1; wrong picks earn nothing).
- **Mode is decided by the key:** every question has a `correct` option → **inline**; none has → **deferred**; a mix is rejected.

## Choose the mode
| Inline (key in payload)                                                                     | Deferred (no key)                                                                                                    |
|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Instant self-check, learner sees per-question result and total                              | You see the answers and grade them with judgment                                                                     |
| Key is visible in the page source — fine for self-study, wrong for anything you want hidden | Answers stay hidden; best for formal checks, nuanced "best answer" questions, or when you want to explain per answer |

## Workflow 1 — Inline self-check
`render` quiz with a key → tell the user to submit → `wait_quiz`. The result carries `answers` and `score {earned, possible}` (client-computed). Comment on the misses; don't re-score.

## Workflow 2 — Deferred, agent-graded
`render` quiz without a key → `wait_quiz` → returned `questions` + `answers` → grade yourself against what you taught. Report the score in chat, explain each wrong answer briefly, and optionally render a summary (`html` table) of right/wrong.

## Workflow 3 — Teach, quiz, remediate
After a lesson: 3–6 questions covering the lesson's key ideas (each tied to a frame you showed). Grade. For each miss, `seek` to or re-render the relevant visual and re-explain differently, then ask one fresh question on that point. Don't repeat the same wording.

## Workflow 4 — Spaced review
Use `list_snapshots(workspace)` to see earlier lessons (quiz snapshots reload as fresh quizzes). Re-quiz on earlier material with new questions rather than identical ones. Mention progress against the previous score only if you recorded it in chat.

## Writing good questions
- One concept per question; 3–5 options; plausible distractors drawn from real misconceptions.
- Avoid "all of the above" and negatives; keep option lengths similar.
- Use `multiple` + `partial` only when a set of facts is genuinely independent.

## Gotchas
- A submission made before you call `wait_quiz` is kept as long as that same quiz is still on screen. Re-rendering discards it.
- `wait_quiz` times out after 10 minutes (`type: "timeout"`) and returns `ok:false` if no quiz is showing.
- Answers and scores are never saved to history, and quizzes are omitted from HTML export.
