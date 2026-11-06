# Milestone v1.8 — Quiz Support (Sprints 89–91)

**Status:** planned

> New feature (FR33 in `01`, 2026-11-06). Requirements `03` §10, architecture `04` §10.

### Sprint 89 — Quiz payload, scoring, validation (F44, F45, F47, NF57)

- [ ] **F44/F45 — Payload validation.** `server/quiz.ts` validates the schema and derives inline/deferred mode; wire `quiz` into the render path (MCP + REST) and snapshot writer.
  - *DoD:* valid payloads render/persist; mixed keys, duplicate ids, bad weights rejected identically over MCP and REST.
- [ ] **F47 — `scoreQuiz`.** Shared pure scoring function for `all_or_nothing` and `partial`.
  - *DoD:* unit tests cover exact-set, partial weights, wrong picks earning nothing, `points` totals.

### Sprint 90 — Quiz renderer & inline evaluation (F44, F46, F48)

- [ ] **F44 — `Quiz.svelte` + registry entry.** Radio/checkbox controls, Submit disabled until all answered.
  - *DoD:* renders in light and dark theme; keyboard operable.
- [ ] **F46 — Inline result view.** On Submit, show per-question result and total score.
  - *DoD:* score matches `scoreQuiz`; shown only after Submit.

### Sprint 91 — Deferred handoff, persistence & export (F48, F49, F50, NF57)

- [ ] **F48/F49 — `/quiz/submit`, `/wait-quiz`, MCP `wait_quiz`.** Payload-carrying long-poll with 10-minute timeout and submit-before-wait retention; in-quiz "Sent ✓"/retry state.
  - *DoD:* agent receives questions and answers; timeout and late-wait cases tested; MCP/REST parity.
- [ ] **F50 — History reload & export behaviour.** Quiz reloads as fresh; HTML export skips with note.
  - *DoD:* no answers in snapshot; export does not crash on a workspace containing a quiz.
- [ ] **Docs.** README tool/endpoint tables and showcase entry for `quiz`/`wait_quiz`.

---

## Definition of Done — v1.8
- All tasks above shipped with passing acceptance criteria from `03` §10.
- Full unit test suite green, `svelte-check`/`eslint`/`npm run build` clean.
- Manual test pass: inline and deferred quiz end to end with a real agent, light and dark theme.
