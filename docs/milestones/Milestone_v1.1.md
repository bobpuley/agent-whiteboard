# Milestone v1.1 — Modal Default Workspace & Social Preview Refresh (Sprint 79)

**Status:** in progress

### Sprint 79 — Default workspace selection + social preview redesign
- [x] Extend `resetState()` in `client/src/DeleteExportModal.svelte`: when `workspaces.length > 1`, find the workspace with `isCurrent === true` and, if found, auto-select it and set `step = 2` (same treatment as the existing `workspaces.length === 1` branch). Fall back to today's picker (`step = 1`, `selectedWorkspace = null`) if no workspace is flagged current.
- [x] Verify the existing `goBack()` / `canGoBack` control still lets the user reach the step-1 picker to choose a different workspace. (Fixed a latent reactive-ordering bug this change exposed: `canGoBack`'s `$:` declaration read `step` before the block that sets it via `resetState()` — moved it after, per the existing ordering comment in the file.)
- [x] Add/update a test covering: 2+ workspaces present, one flagged `isCurrent` → modal opens on step 2 for that workspace, for both `mode="delete"` and `mode="export"`.
- [x] Produce 3 concepts × 3 styles (stylized, handmade, pro) for the social preview redesign as SVG mockups, each with a short written brief, reflecting user/agent interactivity (agent driving a rendered graph, user acting on it) rather than the bare app icon mark. Delivered at `docs/social-preview-concepts/{A-terminal-canvas-duo,B-node-action-popup,C-conversation-loop}/{stylized,handmade,pro}.svg` + `docs/social-preview-concepts/BRIEFS.md`.
- [x] Present the 9 mockups to the user for selection. User picked concept A (terminal/canvas duo), handmade style, with the action-popup mechanic from concept B merged in per follow-up feedback.
- [x] Once a concept/style is picked, produce the final `docs/social-preview.png` (1280×640) from it. Rendered from the finalized `docs/social-preview-concepts/A-terminal-canvas-duo/handmade.svg`.

---

## Definition of Done — v1.1
- Opening the delete or export modal with 2+ workspaces lands directly on the current workspace's snapshot list; single-workspace behavior is unchanged; the picker remains reachable via "back".
- 9 SVG mockups + 9 written briefs delivered for the social preview redesign; user has selected a concept/style (or explicitly deferred selection).
- All existing tests pass; new test covers the default-selection behavior.
