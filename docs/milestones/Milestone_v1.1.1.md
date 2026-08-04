# Milestone v1.1.1 — Vega-Lite CSP `unsafe-eval` Fix (patch)

**Status:** in progress

> Opened 2026-08-04 via `/doc-creator-driver:intake` (bug report). Single bugfix — the live browser render path's CSP blocks Vega-Lite's client-side expression compiler (B23 in `01`, F31 in `03`, `04` §3). No new feature, so it stays a `.1` patch of v1.1 rather than a new minor milestone.

### Sprint 80 — Allow Vega-Lite's client-side expression compilation under CSP (B23, F31)
- [ ] **Add `'unsafe-eval'` to `script-src` in `server/app.ts`'s `CSP_HEADER`.** Change `"script-src 'self' 'unsafe-inline'"` to `"script-src 'self' 'unsafe-inline' 'unsafe-eval'"`. Leave every other directive (`default-src`, `style-src`, `img-src`, `connect-src`, `object-src`, `base-uri`, `frame-ancestors`) untouched.
  - *Acceptance:* running `tests/human_driven/showcase.js`'s client-managed slideshow section in a real browser and reaching slide "7b — Vega-Lite (6 s)" shows the chart with no CSP-related error in the browser console. The earlier server-driven slideshow's Vega-Lite slide ("6 / 6 — Vega-Lite") is also verified clean.
  - *Regression coverage:* a unit test on `createApp()`'s response headers (`tests/unit/server/app.test.ts` or wherever `CSP_HEADER` is currently asserted) updated to expect `'unsafe-eval'` in `script-src`.
  - *Explicitly out of scope:* `server/export-html.ts`'s two CSP strings (`cdn`/`offline` modes) — confirmed unaffected because exported Vega-Lite content is pre-rendered to static SVG server-side, not left as-is by oversight (see `04` §3).

---

## Definition of Done — v1.1.1
- `server/app.ts`'s `CSP_HEADER` grants `'unsafe-eval'` in `script-src`; every other directive unchanged.
- Live-browser verification: showcase slide "7b — Vega-Lite (6 s)" (and "6 / 6 — Vega-Lite") render with no CSP violation in the console.
- Unit test asserting the updated `CSP_HEADER` value.
- `01`/`03`/`04` entries for B23/F31 updated from "known gap" to resolved.
- Full unit + e2e suite green.
