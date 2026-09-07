// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { hasMermaidKeyword } from "./validate.js";
import { registerRenderRoutes } from "./routes/render.js";
import { registerSlideshowRoutes } from "./routes/slideshow.js";
import { registerSnapshotRoutes } from "./routes/snapshots.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerImportRoutes } from "./routes/import.js";

// Re-export for tests that reference MERMAID_KEYWORDS / isValidMermaid directly.
export { MERMAID_KEYWORDS } from "./validate.js";
export function isValidMermaid(payload: string): boolean {
  return hasMermaidKeyword(payload);
}

// Defense-in-depth only (see M3 in docs/02_assumptions-and-risks.md) — SVG/HTML
// payloads are already sanitized client-side via DOMPurify before render, and
// server-side for HTML exports. 'unsafe-inline' on script/style is required
// because the self-contained HTML export embeds the full mermaid.js bundle
// and generated CSS inline (F17 in docs/03) — a nonce/hash scheme would be
// more restrictive but isn't worth the complexity for a backstop control.
// 'unsafe-eval' is required for Vega-Lite's client-side expression compiler
// (new Function(...) for scales/signals — B23/F31 in docs/01/03).
const CSP_HEADER =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; " +
  "frame-ancestors 'none'";

// NF48 (docs/03 §6): caps every JSON-accepting route's request body so an
// oversized payload gets a fast 413 instead of running unbounded input
// through synchronous rendering (mermaid/katex/vega-lite parsing).
const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface CreateAppOptions {
  // Absolute path to the built client (dist/client). When provided and it
  // exists on disk, the server serves it directly — the npx/production run
  // path, with no Vite dev server involved. Omitted in dev mode (npm run dev
  // uses Vite's own dev server on :5173 and proxies API calls here), so this
  // stays undefined for every existing caller of createApp().
  staticRoot?: string;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("Content-Security-Policy", CSP_HEADER);
  });

  // /import (NF55) enforces its own larger, route-specific limit inside
  // registerImportRoutes() — excluded here so the two caps don't stack (a
  // second, stricter bodyLimit later in the chain would otherwise still
  // reject anything over MAX_BODY_SIZE_BYTES regardless of the route's own
  // override).
  app.use("*", async (c, next) => {
    if (c.req.path === "/import") return next();
    return bodyLimit({ maxSize: MAX_BODY_SIZE_BYTES })(c, next);
  });

  registerRenderRoutes(app);
  registerSlideshowRoutes(app);
  registerSnapshotRoutes(app);
  registerExportRoutes(app);
  registerImportRoutes(app);

  // ── Static client (v1.0 — NF33) ──────────────────────────────────────────
  // Mounted last so it never shadows an API route above; only serves GET
  // requests that didn't match anything else (assets, and "/" -> index.html).
  if (options.staticRoot !== undefined && existsSync(options.staticRoot)) {
    app.get("*", serveStatic({ root: options.staticRoot }));
  }

  return app;
}
