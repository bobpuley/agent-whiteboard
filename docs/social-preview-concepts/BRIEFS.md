# Social Preview Redesign — Concepts (FR30 / v1.1)

3 concepts × 3 styles = 9 candidates for `docs/social-preview.png` (1280×640). Each concept has an SVG mockup at `<concept>/<style>.svg` in this directory. Palette is drawn from the app's actual theme tokens (`client/src/theme.css`): ink `#1a1a1a`/`#333333`, accent blue `#2980b9`, warm highlight `#f5a623` for the "agent is doing something here" accent, on white/off-white.

The current `docs/social-preview.png` is just the app icon mark scaled up — none of these concepts reuse it directly; all depict the actual product mechanic instead (terminal-driven agent + browser canvas + click-driven interactivity), per the FR30 brief.

---

## Concept A — Terminal / Canvas Duo

The literal product shape: a dark terminal pane on the left (the agent's real interface — where the developer runs Claude Code) and a light canvas pane on the right showing a rendered flowchart. A cursor is mid-click on one canvas node; a short command line in the terminal implies the agent just rendered it. Reads instantly as "CLI agent drives a second-screen visual" — the core pitch in `00_north-star.md`.

- **stylized** — flat geometric panels, solid fills, no gradients or shadows; icon-like, close in spirit to the current mark.
- **handmade** — sketchy/marker-drawn panels and nodes with slightly wobbly strokes, warm paper background — leans into "whiteboard" literally.
- **pro** — soft shadows, subtle gradients, glassy panel edges; polished SaaS-marketing-image treatment.

## Concept B — Node Action Popup

A close-up hero shot of a single diagram node with a floating action menu open beside it (mirrors the real `NodeActionPopup.svelte` UX) — 3 action rows, one under a cursor. A small spark glyph (reused from the app mark) sits near the popup to signal "the agent decides what's in this menu." This concept is the most direct depiction of FR30's second bullet: "the agent can control what actions the user can perform, starting from a rendered graph."

- **stylized** — flat popup card, bold single-weight strokes, high-contrast accent on the active row.
- **handmade** — hand-drawn popup with a doodled cursor and a squiggle connecting the spark to the menu, like an annotated whiteboard sketch.
- **pro** — realistic elevated card with drop shadow and blur backdrop, refined type-like bars, looks like an actual product screenshot crop.

## Concept C — Conversation Loop

More abstract/conceptual: a circular arrow connecting a small terminal glyph to a small graph glyph, passing through a cursor/click glyph — visualizing the bidirectional loop from `00_north-star.md` ("agent renders → user clicks → agent adapts"). No literal UI chrome, reads well at a glance as a brand mark rather than a screenshot.

- **stylized** — flat glyphs on the loop path, generous whitespace, brand-mark energy (closest to a "logo, but bigger" feel while still being new).
- **handmade** — the loop arrow itself is a loose hand-drawn circle/sketch stroke, glyphs doodled.
- **pro** — the loop rendered as a smooth gradient ring with glyphs as small polished icon chips sitting on it, shadowed.

---

## How to review

Open each SVG directly (any browser or image viewer renders SVG natively). Pick one `<concept>/<style>.svg` to finalize into `docs/social-preview.png` — that PNG export is a follow-up step once a selection is made (see `02_assumptions-and-risks.md`, v1.1 section).
