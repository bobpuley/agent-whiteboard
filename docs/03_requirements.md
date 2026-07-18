# 03 — Requirements (v0.33)

> **v0.32 complete** — all v0.32 requirements implemented; ACs green.
> Archived: [`docs/v0.32/03_requirements.md`](v0.32/03_requirements.md).

---

## 1. Dark Theme & Theme Selector (FR27 in `01`)

| ID  | Requirement | Priority |
|-----|-------------|----------|
| F24 | The board chrome (toolbar, panels, controls, canvas background UI) supports two visual themes, **Light** and **Dark**, implemented via CSS custom properties scoped to board-chrome components only. | v0.33 |
| F25 | A theme toggle control in the board toolbar switches between Light and Dark. Selected theme persists in `localStorage` and is restored on reload. First-time users (no saved preference) default to **Light**. | v0.33 |
| F26 | Rendered content (the `Html`/`Mermaid` renderers inside `#html-renderer-root`, and exported HTML in both `cdn` and `offline` modes) is **unaffected** by the board theme — no board theme CSS variable is readable from or applied to rendered-content scope. | v0.33 |

**Acceptance criteria (draft, to refine in `04`/milestone task):**
- Toggling the theme control switches all board-chrome colors (toolbar, panels, modals, history panel) between Light and Dark with no unstyled/hardcoded-color elements left behind.
- Reloading the page after selecting Dark restores Dark without user action.
- A fresh browser profile (no localStorage entry) renders Light.
- Rendered HTML/Mermaid content on the canvas, and HTML produced by `export-html` (both modes), is byte-for-byte identical regardless of board theme.
