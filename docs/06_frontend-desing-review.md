# Frontend Design Review — Component Responsibility Audit

> Change request from a 2026-07-12 design pass over four client files, requested directly (not routed through the Design Debt Log in `01_input-ideas.md`, since this is a standalone review doc rather than a review-pass log entry). Follows the same finding format (severity + file:line) as the 2026-07-04/2026-07-09 review passes for consistency.

## Scope

| File | Lines | Role |
|---|---|---|
| `client/src/renderers/Mermaid.svelte` | 580 | Mermaid diagram renderer (canvas type: `mermaid`) |
| `client/src/HistoryPanel.svelte` | 364 | Snapshot history side panel |
| `client/src/DeleteExportModal.svelte` | 687 | Delete/export workspace modal (dual-mode) |
| `client/src/App.svelte` | 365 | Top-level layout + store/registry orchestration |

## Goal

Each file should implement only its own responsibility; logic needed by more than one file should live in one shared place, not be copy-pasted; file/module names should describe what the code does.

## Findings

- **F1 (🔴 four responsibilities in one file)** — `Mermaid.svelte` mixes: (1) Mermaid source→SVG rendering (`loadMermaid`/`renderDiagram`, lines 332–408), (2) a generic pan/zoom camera with server-side viewport persistence (lines 37–154), (3) click-to-server-action routing plus a popup menu UI (lines 156–287), and (4) autonomous node→frame navigation wiring (lines 289–330). Only (1) and the Mermaid-DOM-parsing helpers in (3)/(4) (`extractNodeId`/`extractNodeLabel`/`extractEdgeId`, lines 158–177) are actually Mermaid-specific — the camera and the popup are generic UI wearing a Mermaid costume. The file's name promises "renders mermaid diagrams"; it actually delivers a zoomable canvas + click router + popup host that happens to render mermaid diagrams.
- **F2 (🟡 verbatim duplication)** — `formatTimestamp()` is byte-identical in `HistoryPanel.svelte:50-63` and `DeleteExportModal.svelte:84-97`.
- **F3 (🟡 near-verbatim duplication)** — the snapshot-row display (title + type badge + timestamp) is duplicated as both markup and CSS: `HistoryPanel.svelte:121-133` (markup) / `:335-363` (CSS) vs. `DeleteExportModal.svelte:282-301` (markup) / `:554-581` (CSS). Same visual unit, two independent copies to keep in sync.
- **F4 (🟢 repeated pattern, not literal duplication)** — the "POST JSON, swallow network error" fetch pattern is hand-rolled at every call site instead of going through a shared helper: `Mermaid.svelte` (`/node-click` ×2, `/seek`, `/viewport`), `HistoryPanel.svelte` (`/snapshots/load`), `DeleteExportModal.svelte` (`/snapshots/delete-workspace`, `/snapshots/delete-files`, `/export-html`). Each site re-implements its own try/catch and error-message extraction.
- **Not a finding** — `App.svelte` is a clean orchestrator (renderer registry, store wiring, layout). No responsibility violation. (A prior "god component" finding against an earlier, larger `App.svelte` was already resolved via the v0.20/v0.21 milestones — see Design Debt Log in `01_input-ideas.md`.)
- **Not a finding** — `DeleteExportModal.svelte`'s dual delete/export `mode` is a parameterized shared shell, not copy-paste duplication. Splitting it into two components would duplicate the step-1/step-2 shell instead of removing duplication.

## Proposed refactor

| Change | Resolves | Notes |
|---|---|---|
| `lib/formatTimestamp.ts` | F2 | pure function, both panels import it |
| `lib/SnapshotRow.svelte` (title + type badge + timestamp) | F3 | shared by `HistoryPanel` and `DeleteExportModal`; also collapses the CSS duplication in one move |
| Split `Mermaid.svelte` → `renderers/Mermaid.svelte` (rendering only) + `renderers/mermaid/panZoom.ts` + `renderers/mermaid/nodeInteractions.ts` + `renderers/mermaid/NodeActionPopup.svelte` | F1 | `Mermaid.svelte` then only does what its name says; the other three are independently nameable/testable even though only Mermaid consumes them today |
| `lib/snapshotActions.ts` (`deleteWorkspace`, `deleteFiles`, `exportItems`) | F4 (modal side) | pulls fetch mechanics out of `DeleteExportModal.svelte`, leaving it as pure step/UI orchestration |

Out of scope: `App.svelte` (no violation found), splitting `DeleteExportModal` into two components (would duplicate the shell instead of removing duplication), and a fully generic fetch helper for `Mermaid.svelte`'s three call sites (F4 there is lower-value — three call sites, no shared shape — deferred unless a fourth appears).
