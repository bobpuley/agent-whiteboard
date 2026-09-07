# Milestone v1.6 — Workspace Export/Import for Sharing (Sprints 85–86)

**Status:** in progress

> New feature (FR31 in `01_input-ideas.md`, 2026-09-07), not a Design Debt Log promotion. Design resolved via a `/grill-me` interview before this file was written — see `02`'s v1.6 section (assumptions/risks) and `03`'s §8 (requirements F34–F40, NF55) and `04`'s §8 (architecture) for the full decision record. Ships as npm **`1.1.0`** — the first milestone under the new versioning rule (`05`'s versioning note): npm's semver bump follows what actually shipped, not the milestone label.

### Sprint 85 — Delete confirm wording + zip export (F34–F36)

- [x] **F34 — Delete confirmation mentions the workspace name.** `DeleteExportModal.svelte`'s whole-workspace confirm button reads `Click again to delete "<workspace-name>"` instead of the generic "Click again to confirm".
  - *DoD:* opening delete for a workspace named `"my-course"` and arming the confirm shows that exact text; existing delete tests updated/passing.
- [ ] **F35 — Export format toggle in the export modal.** Step 2 of export mode gains an HTML/Zip segmented control, defaulting to HTML; both whole-workspace and selected-snapshot export actions respect the current selection.
  - *DoD:* toggling to Zip and exporting (either action) downloads a `.zip`, not `.html`; toggling back to HTML preserves today's exact existing behavior unchanged.
- [ ] **F36 — Zip export pipeline.** New `server/export-zip.ts` (`generateExportZip`) + `POST /export-zip` (`server/routes/export.ts`) producing a zip of the selected snapshot JSON files plus a `manifest.json` (workspace name, export timestamp, app version, included filenames); viewport-cache data excluded; rejects mixed-workspace item lists with 400.
  - *DoD:* downloaded zip's `manifest.json` matches the schema in `04`'s §8 exactly for a known export; no viewport-cache file present anywhere in the zip; a manually crafted cross-workspace `items` array is rejected with 400.

> **Implementation note:** ships export first, fully working end-to-end (including the client format toggle and download), before starting import — import's `manifest.json` validation and merge-matching logic in Sprint 86 both depend on this sprint's exact manifest shape being final.

### Sprint 86 — Import: entry point, collision handling, merge logic (F37–F40, NF55)

- [ ] **F37 — Import entry point.** New `ImportModal.svelte` + toolbar button, plus drag-and-drop of a `.zip` onto the same drop target; client reads `manifest.json` out of the selected file locally (via `jszip`) before any upload.
  - *DoD:* selecting or dropping a valid exported zip opens the modal with the workspace name already resolved from the manifest, with no network request yet.
- [ ] **F38 — Name-collision prompt.** If the manifest's workspace name matches an existing workspace, show Merge / Import as new (editable, pre-filled `"<name> (n)"`) / Cancel; otherwise skip straight to import.
  - *DoD:* importing a zip with a colliding name shows the three-way prompt; "import as new" with an edited name creates a distinct workspace, unchanged original.
- [ ] **F39 — Server import pipeline + merge/dedup logic.** New `server/import-zip.ts` + `POST /import` (`server/routes/import.ts`, multipart upload via `extract-zip`); implements the create/merge modes and the id/timestamp dedup rule from `03`'s F39 exactly (no match → add; same id+timestamp → skip; same id, different timestamp → newer wins).
  - *DoD:* re-importing the same zip reports everything as skipped and writes no new files; a destination/incoming pair sharing an id with different timestamps ends with exactly one file for that id afterward, matching the newer timestamp.
- [ ] **NF55 — Import safety: size cap + path-traversal/zip-bomb defense.** `POST /import` enforces a 50MB `bodyLimit` override, validates `manifest.json` before extracting anything else, and rejects any zip entry that would resolve outside the destination directory.
  - *DoD:* a >50MB upload is rejected before extraction; a zip crafted with a `../../` entry is rejected with no file written outside the workspace directory (test using a hand-built malicious archive, not just a well-formed one).
- [ ] **F40 — Post-import focus + summary.** On success, the client loads the newest imported/updated snapshot (switching active workspace as a side effect of the existing `POST /snapshots/load`) and shows `{added, updated, skipped}` counts instead of a bare success message.
  - *DoD:* after import, the app is showing content from the imported workspace with no further user action; the shown summary's counts match the server response exactly.

> **Implementation note:** NF55's zip-bomb/path-traversal tests need a deliberately malicious fixture archive (not reused from any real export) — build it once as a test fixture rather than hand-crafting bytes inline per test.

---

## Definition of Done — v1.6
- All 8 tasks above (F34–F40, NF55) shipped with passing acceptance criteria from `03`.
- Full unit test suite green, `tsc --noEmit`/`svelte-check`/`eslint`/`npm run build` clean.
- No MCP tool contract changes; existing snapshot JSON file format unchanged (export/import operate on it as-is).
- Manual test pass: export a workspace as zip, import it into a *different* whiteboard instance (a second `WHITEBOARD_SNAPSHOTS_DIR`), confirm it renders correctly there — the actual cross-instance sharing use case this milestone exists for.
