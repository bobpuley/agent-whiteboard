# Milestone v0.18 — Stability & Correctness Fixes (Sprint 31)

**Status:** in progress

> Objective: fix nine bugs (B6–B14, `01_input-ideas.md`) surfaced by a Node.js/TS + frontend code review pass on 2026-07-04, triaged against the project's actual local-only, single-trusted-user scope (`02` A1/A2) via a `/grill-me` interview during intake. Three reviewer findings (unrestricted `output_path`, no auth, server-side sanitization) were confirmed as already-decided trade-offs and dismissed — not part of this milestone. A separate, non-behavioral "Design Debt Log" (`01`) captures tech-debt/maintainability findings from the same review that are explicitly out of scope here — no observed broken behavior, not a bug.

---

## Context

Two specialized code reviews ran against `./server` and `./client`. Of 31 raw findings, three were dismissed as already-covered by documented decisions (`02` L6, A1, F6/C1), ~17 were classified as tech debt with no observed broken behavior (Design Debt Log, `01`), and 9 were confirmed as genuine, scope-independent bugs — data loss, silent incorrect state, or a real shipped type error — and scheduled here.

---

## Requirements Addressed

- **B6–B14** (`01`) — see `03` §5c "Known Gaps" for the requirement each bug violates
- **K1, G1b, L4** (`02`) — updated with gap notes for B6, B7, B14 respectively
- Client TypeScript build gate (`04`, TypeScript configuration section) — updated for B10

---

### Sprint 31 — Stability & Correctness Fixes

- [x] **T1 (B6, HIGH) — `server/app.ts`:** replace `validateWorkspaceForDelete()`'s ad hoc inline check with the existing `isValidWorkspaceName()` from `validate.ts`, and additionally assert `resolve(join(root, workspace)).startsWith(resolve(root) + sep)` before the `rmSync` call in `POST /snapshots/delete-workspace`. Apply the same fix to the other ad hoc workspace checks in `app.ts` (`GET /snapshots`, `POST /snapshots/load`, `POST /export-html`) so they all route through the one correct implementation.
- [x] **T2 (B7, HIGH) — `server/snapshot.ts`:** include a disambiguating component in `saveSnapshot()`'s filename — the snapshot's own `id` (already generated) or millisecond precision — so two writes in the same second never collide.
- [x] **T3 (B8, HIGH) — `client/src/renderers/{Mermaid,Katex,VegaLite,Html}.svelte`:** guard each async render with a generation token; discard a render's result if a newer render has started since. Consider extracting the shared `onMount`/`afterUpdate`/`lastRendered` pattern into one helper so the fix lives in one place instead of four (noted as a natural side-benefit; the Design Debt Log already lists this duplication separately).
  - Applied the generation-token guard to `Mermaid.svelte` and `VegaLite.svelte` — the two renderers with a genuine `await` between kicking off a render and touching the DOM/view, the actual precondition for this race. `Katex.svelte` and `Html.svelte` render fully synchronously (`katex.render()` and `DOMPurify.sanitize()` never yield), so a newer `afterUpdate` cannot interleave with an older call already in flight — there's no race to guard against there, so they're intentionally left unchanged rather than adding a dead guard.
  - **Test coverage note:** attempted an e2e regression test (large diagrams/datasets to force a real async race) but found neither renderer's real-world timing reliably reproducible as a black-box test: Mermaid's `mermaid.render()` resolves in single-digit ms even at several thousand nodes (and hits a built-in 500-edge parse limit before layout cost becomes material), and `vega-embed`'s `embed()` clears/replaces its container synchronously up front — so a superseded call's late-arriving output lands on an already-detached element, not the visible DOM, even without this fix. No automated regression test added for this one; the fix (a standard generation-counter/stale-closure guard) was verified by code inspection and by running the full existing unit + e2e suites with no regressions.
- [ ] **T4 (B9, MEDIUM) — `client/src/App.svelte`:** wrap `handleDone()`'s `fetch` in `try`/`catch`; on failure, leave `doneSent` false and surface an error state (or allow retry) instead of an unhandled rejection.
- [ ] **T5 (B10, MEDIUM) — build tooling:** add `svelte-check` as a dev dependency, add a `typecheck` script (`svelte-check --tsconfig client/tsconfig.json`), wire it into `npm run build`. Fix `HistoryPanel.svelte:24`'s invalid `res.json<T>()` call as part of closing the gap (`const data = (await res.json()) as {...}`).
- [ ] **T6 (B11, LOW) — `client/src/ws.ts` + `App.svelte`:** validate `cmd.type` against the known set of renderer types before casting; log a clear diagnostic (and consider a visible "unsupported content type" fallback) instead of silently failing the `{#if}` chain.
- [ ] **T7 (B12, LOW) — `client/src/DeleteExportModal.svelte` + `HistoryPanel.svelte`:** add `aria-modal="true"`, an `Escape` key handler, and basic focus trap/restore to both dialogs.
- [ ] **T8 (B13, LOW) — `client/src/App.svelte` + `HistoryPanel.svelte`:** extract a shared `fetchSnapshots()` helper for `GET /snapshots/all`; surface fetch failures to the user in both call sites instead of `App.svelte`'s silent empty-list fallback.
- [ ] **T9 (B14, MEDIUM) — `server/export-html.ts`:** serialize calls to `generateExportHtml()` with a simple async queue (`exportQueue = exportQueue.then(() => generateExportHtmlInner(items))`) so overlapping calls from `POST /export-html` and the `export_html` MCP tool can't corrupt each other's global DOM state.

> **Implementation note:** T1's fix is also the root-cause fix for the workspace-validation duplication flagged in the Design Debt Log — reusing `isValidWorkspaceName()` everywhere closes both the bug and (partially) the duplication debt in one change.

---

## Definition of Done — v0.18

- `POST /snapshots/delete-workspace` with `{"workspace": "."}` is rejected with a validation error; no data is deleted.
- Two snapshot writes in the same wall-clock second produce two distinct files on disk.
- Rapid step-frames navigation (or any fast back-to-back `render()`/`step()`/`seek()` sequence) never displays a stale frame; an in-flight render that's superseded is discarded.
- A failed `POST /user-done` no longer leaves the Done button's state machine stuck; the failure is caught.
- `npm run build` fails on a client-side TypeScript error; `HistoryPanel.svelte`'s `res.json<T>()` call is fixed.
- An unrecognized WebSocket message `type` produces a diagnosable log/console message instead of silent no-op.
- `DeleteExportModal` and `HistoryPanel` dialogs close on `Escape` and trap `Tab` focus within their visible controls.
- A failed `GET /snapshots/all` shows a visible error in both `App.svelte`'s and `HistoryPanel.svelte`'s call sites.
- Two concurrent `generateExportHtml()` calls (e.g. simulated in a test) do not corrupt each other's output.
- `02`, `03`, `04` updated to reflect resolved status for B6–B14; existing tests pass; new regression tests added per bug where practical (especially T1/T2/T9, which are the highest-severity/most-testable).
