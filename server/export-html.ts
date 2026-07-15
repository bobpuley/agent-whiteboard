import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { Window } from "happy-dom";
import katex from "katex";
import * as vl from "vega-lite";
import * as vega from "vega";
import DOMPurify from "dompurify";
import type { SnapshotRecord } from "./snapshot-reader.js";
import { badgeType } from "./snapshot-reader.js";

// ── Public interfaces ──────────────────────────────────────────────────────

export interface ValidatedExportItem {
  workspace: string;
  filename?: string;
  id?: string;
  record: SnapshotRecord;
}

export interface ExportResult {
  html: string;
  downloadFilename: string;
}

// ── Global DOM setup for happy-dom ────────────────────────────────────────

type GlobalKey =
  | "document" | "window" | "CSSStyleSheet" | "SVGElement" | "HTMLElement"
  | "Element" | "DOMParser" | "MutationObserver"
  | "requestAnimationFrame" | "cancelAnimationFrame";

function saveGlobals(): Map<GlobalKey, unknown> {
  const keys: GlobalKey[] = [
    "document", "window", "CSSStyleSheet", "SVGElement", "HTMLElement",
    "Element", "DOMParser", "MutationObserver",
    "requestAnimationFrame", "cancelAnimationFrame",
  ];
  const saved = new Map<GlobalKey, unknown>();
  for (const k of keys) saved.set(k, (global as Record<string, unknown>)[k]);
  return saved;
}

function setGlobals(win: Window): void {
  const g = global as Record<string, unknown>;
  const w = win as unknown as Record<string, unknown>;
  g["document"] = win.document;
  g["window"] = win;
  g["CSSStyleSheet"] = w["CSSStyleSheet"];
  g["SVGElement"] = w["SVGElement"];
  g["HTMLElement"] = w["HTMLElement"];
  g["Element"] = w["Element"];
  g["DOMParser"] = w["DOMParser"];
  g["MutationObserver"] = w["MutationObserver"];
  g["requestAnimationFrame"] = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
  g["cancelAnimationFrame"] = clearTimeout;
}

function restoreGlobals(saved: Map<GlobalKey, unknown>): void {
  for (const [k, v] of saved) {
    if (v === undefined) {
      delete (global as Record<string, unknown>)[k];
    } else {
      (global as Record<string, unknown>)[k] = v;
    }
  }
}

// ── Renderers ──────────────────────────────────────────────────────────────

function renderMermaidContainer(payload: string): string {
  return `<pre class="mermaid">${escapeHtml(payload)}</pre>`;
}

function renderKatex(payload: string): string {
  return katex.renderToString(payload, { displayMode: true, throwOnError: false });
}

async function renderVegaLite(payload: string): Promise<string> {
  const spec = JSON.parse(payload) as vl.TopLevelSpec;
  const vegaSpec = vl.compile(spec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  return view.toSVG();
}

function renderSvgPayload(payload: string, purify: ReturnType<typeof DOMPurify>): string {
  return purify.sanitize(payload, { USE_PROFILES: { svg: true } });
}

function renderHtmlPayload(payload: string, purify: ReturnType<typeof DOMPurify>): string {
  return purify.sanitize(payload, { USE_PROFILES: { html: true } });
}

/**
 * Contains any <style> tag embedded in rendered "html"/"svg" content to the
 * element it's meant to style, instead of leaking document-wide. A <style>
 * element is normally document-scoped regardless of DOM nesting — a payload
 * shipping its own theme stylesheet (e.g. a markdown->HTML converter's
 * readable-width CSS, `body { max-width: 900px }`) would otherwise silently
 * override the whole export's layout. `@scope` limits selector matching to
 * `anchorId`'s subtree: a `body {}` rule then matches nothing (no `<body>`
 * descendant exists there), while `table {}`/`code {}`/etc. still apply
 * correctly to the payload's own content. Real root cause of bug B20 ("main
 * too narrow") — see `01`/`03`/`04`. An earlier fix (`FORBID_TAGS: ["style"]`)
 * closed the leak but also discarded the payload's own legitimate table/code
 * formatting living in the same <style> block; scoping keeps both.
 */
function scopeEmbeddedStyles(html: string, anchorId: string): string {
  return html.replace(
    /<style>([\s\S]*?)<\/style>/gi,
    (_, css: string) => `<style>@scope (#${anchorId}) {\n${css}\n}</style>`
  );
}

// ── Rendered item types ────────────────────────────────────────────────────

interface RenderedHtml { kind: "html"; html: string }
interface RenderedStepFrames { kind: "stepFrames"; frames: RenderedFrame[] }
interface RenderedError { kind: "error"; message: string }
type RenderedContent = RenderedHtml | RenderedStepFrames | RenderedError;

interface RenderedFrame { label?: string; html: string }

interface RenderedItem {
  workspace: string;
  type: string;
  timestamp: string;
  title?: string;
  content: RenderedContent;
}

async function renderByType(
  type: string,
  payload: string,
  purify: ReturnType<typeof DOMPurify>
): Promise<string> {
  switch (type) {
    case "mermaid":
      return renderMermaidContainer(payload);
    case "katex":
      return renderKatex(payload);
    case "vega-lite":
      return renderVegaLite(payload);
    case "svg":
      return renderSvgPayload(payload, purify);
    case "html":
      return renderHtmlPayload(payload, purify);
    default:
      throw new Error(`unsupported render type: ${type}`);
  }
}

/**
 * Renders a snapshot's already-resolved `frames[]` (v0.26 Sprint 43 — no more
 * `JSON.parse(payload)` of a step-frames envelope; a sequence is just an
 * array with more than one element). A single frame renders as one content
 * block; multiple frames render as a step-frames section, each frame using
 * its own already-resolved `type` (no `frame_type` fallback needed).
 */
async function renderFrames(
  frames: Array<{ type: string; payload: string; label?: string }>,
  purify: ReturnType<typeof DOMPurify>
): Promise<RenderedContent> {
  if (frames.length > 1) {
    const rendered: RenderedFrame[] = [];
    for (const frame of frames) {
      try {
        const html = await renderByType(frame.type, frame.payload, purify);
        rendered.push({ label: frame.label, html });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rendered.push({ label: frame.label, html: `<p class="export-error">${escapeHtml(msg)}</p>` });
      }
    }
    return { kind: "stepFrames", frames: rendered };
  }

  try {
    const html = await renderByType(frames[0].type, frames[0].payload, purify);
    return { kind: "html", html };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: msg };
  }
}

// ── HTML assembly ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTimestampHuman(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

let cachedKatexCss: string | undefined;

function getKatexCss(): string {
  if (cachedKatexCss !== undefined) return cachedKatexCss;
  try {
    const req = createRequire(import.meta.url);
    const cssPath = req.resolve("katex/dist/katex.min.css");
    cachedKatexCss = readFileSync(cssPath, "utf-8");
  } catch {
    cachedKatexCss = "";
  }
  return cachedKatexCss;
}

let cachedMermaidBundle: string | undefined;

function getMermaidBundle(): string {
  if (cachedMermaidBundle !== undefined) return cachedMermaidBundle;
  const req = createRequire(import.meta.url);
  const bundlePath = req.resolve("mermaid/dist/mermaid.min.js");
  const source = readFileSync(bundlePath, "utf-8");
  // Guard against a literal "</script" sequence inside the bundle prematurely
  // closing the inline <script> tag when parsed as HTML.
  cachedMermaidBundle = source.replace(/<\/script/gi, "<\\/script");
  return cachedMermaidBundle;
}

const LAYOUT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; display: flex; background: #f9f9f9; }
  nav { width: 240px; min-width: 200px; padding: 24px 16px; background: #fff; border-right: 1px solid #e0e0e0; position: sticky; top: 0; height: 100vh; overflow-y: auto; flex-shrink: 0; }
  nav h2 { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px; }
  nav ul { list-style: none; margin: 0; padding: 0; }
  nav li { margin: 2px 0; }
  nav a { font-size: 13px; color: #2980b9; text-decoration: none; display: block; padding: 2px 0 2px 8px; }
  nav a:hover { text-decoration: underline; }
  nav .toc-ws { font-weight: 600; color: #333; font-size: 12px; margin-top: 10px; padding-left: 0 !important; }
  nav .toc-ws > a { font-weight: 600; color: #333; padding-left: 0; }
  nav .toc-frames { padding-left: 12px; }
  nav .toc-frames a { font-size: 12px; color: #5b8ab8; }
  main { flex: 1; padding: 32px 40px; min-width: 0; }
  .workspace-section { margin-bottom: 48px; }
  .workspace-heading { font-size: 20px; font-weight: 700; color: #222; margin: 0 0 20px; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0; }
  .item-section { margin-bottom: 28px; padding: 20px; background: #fff; border: 1px solid #e8e8e8; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow-x: auto; }
  .item-heading { font-size: 15px; font-weight: 600; color: #333; margin: 0 0 4px; }
  .item-meta { font-size: 12px; color: #888; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }
  .type-badge { background: #e8f4fd; color: #2980b9; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .frame-section { margin-top: 16px; padding: 12px 16px; border: 1px solid #f0f0f0; border-radius: 4px; background: #fafafa; overflow-x: auto; }
  .frame-heading { font-size: 12px; color: #777; margin: 0 0 10px; font-style: italic; }
  .export-error { color: #c0392b; background: #fdf0f0; padding: 10px 14px; border-radius: 4px; border-left: 3px solid #e74c3c; font-size: 13px; margin: 0; }
  svg { max-width: 100%; height: auto; }
  table { max-width: 100%; border-collapse: collapse; }
  pre, code { max-width: 100%; }
`.trim();

function assembleHtml(items: RenderedItem[], hasKatex: boolean, hasMermaid: boolean): string {
  // Group by workspace, order workspaces by earliest item timestamp.
  const wsMap = new Map<string, RenderedItem[]>();
  for (const item of items) {
    if (!wsMap.has(item.workspace)) wsMap.set(item.workspace, []);
    wsMap.get(item.workspace)!.push(item);
  }
  for (const list of wsMap.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  const workspaces = [...wsMap.entries()].sort(
    ([, al], [, bl]) => al[0].timestamp.localeCompare(bl[0].timestamp)
  );

  let counter = 0;
  const nextId = () => `item-${++counter}`;

  let tocHtml = "";
  let mainHtml = "";

  for (const [ws, wsList] of workspaces) {
    const wsAnchor = `ws-${ws.replace(/[^a-zA-Z0-9]/g, "-")}`;
    tocHtml += `<li class="toc-ws"><a href="#${wsAnchor}">${escapeHtml(ws)}</a><ul>`;
    mainHtml += `<section class="workspace-section" id="${wsAnchor}">`;
    mainHtml += `<h2 class="workspace-heading">${escapeHtml(ws)}</h2>`;

    for (const item of wsList) {
      const itemId = nextId();
      const label = item.title ?? formatTimestampHuman(item.timestamp);
      const { content } = item;

      if (content.kind === "stepFrames") {
        // Parent link points at frame 0's anchor — same target as that
        // frame's own submenu entry below (B22 in `01`).
        tocHtml += `<li><a href="#${itemId}-frame-0">${escapeHtml(label)}</a><ul class="toc-frames">`;
        for (let i = 0; i < content.frames.length; i++) {
          const frameLabel = content.frames[i].label ?? `Frame ${i + 1}`;
          tocHtml += `<li><a href="#${itemId}-frame-${i}">${escapeHtml(frameLabel)}</a></li>`;
        }
        tocHtml += `</ul></li>`;
      } else {
        tocHtml += `<li><a href="#${itemId}">${escapeHtml(label)}</a></li>`;
      }

      mainHtml += `<section class="item-section" id="${itemId}">`;
      mainHtml += `<h3 class="item-heading">${escapeHtml(item.title ?? "—")}</h3>`;
      mainHtml += `<p class="item-meta"><span class="type-badge">${escapeHtml(item.type)}</span><span>${escapeHtml(formatTimestampHuman(item.timestamp))}</span></p>`;

      if (content.kind === "error") {
        mainHtml += `<p class="export-error">${escapeHtml(content.message)}</p>`;
      } else if (content.kind === "stepFrames") {
        for (let i = 0; i < content.frames.length; i++) {
          const frame = content.frames[i];
          const frameId = `${itemId}-frame-${i}`;
          mainHtml += `<section class="frame-section" id="${frameId}">`;
          mainHtml += `<h4 class="frame-heading">${escapeHtml(frame.label ?? `Frame ${i + 1}`)}</h4>`;
          mainHtml += scopeEmbeddedStyles(frame.html, frameId);
          mainHtml += `</section>`;
        }
      } else {
        mainHtml += scopeEmbeddedStyles(content.html, itemId);
      }

      mainHtml += `</section>`;
    }

    tocHtml += `</ul></li>`;
    mainHtml += `</section>`;
  }

  const katexBlock = hasKatex ? `<style>${getKatexCss()}</style>\n` : "";
  const mermaidBlock = hasMermaid
    ? `<script>${getMermaidBundle()}</script>
<script>
document.addEventListener("DOMContentLoaded", function () {
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  mermaid.run({ querySelector: ".mermaid" });
});
</script>
`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'">
<title>Whiteboard Export</title>
<style>${LAYOUT_CSS}</style>
${katexBlock}</head>
<body>
<nav>
<h2>Contents</h2>
<ul>${tocHtml}</ul>
</nav>
<main>${mainHtml}</main>
${mermaidBlock}</body>
</html>`;
}

// ── Download filename ──────────────────────────────────────────────────────

function buildDownloadFilename(workspaces: string[]): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  if (workspaces.length === 1) {
    const sanitized = workspaces[0].replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 24);
    return `${sanitized}-${ts}.html`;
  }
  return `export-${ts}.html`;
}

function itemsIncludeType(items: ValidatedExportItem[], type: string): boolean {
  return items.some(({ record }) => record.frames.some((f) => f.type === type));
}

// ── Agent-facing disk write (v0.15) ─────────────────────────────────────────

/**
 * Write an assembled export HTML string to disk and return the absolute path.
 * `outputPath`, if provided, is used as-is (parent directories created as needed) —
 * relative paths resolve against the server process's cwd, not the caller's.
 * Otherwise defaults to `<snapshotsRoot>/<workspace>/exports/<downloadFilename>`.
 */
export function writeExportHtmlToDisk(
  workspace: string,
  html: string,
  downloadFilename: string,
  outputPath: string | undefined,
  snapshotsRoot: string
): string {
  const targetPath = outputPath ?? join(snapshotsRoot, workspace, "exports", downloadFilename);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, html, "utf-8");
  return resolve(targetPath);
}

// ── Public entrypoint ──────────────────────────────────────────────────────

async function generateExportHtmlInner(
  items: ValidatedExportItem[]
): Promise<ExportResult> {
  const win = new Window();
  const savedGlobals = saveGlobals();
  setGlobals(win);

  const purify = DOMPurify(win as unknown as Window & typeof globalThis);

  const rendered: RenderedItem[] = [];
  try {
    for (const { workspace, record } of items) {
      const content = await renderFrames(record.frames, purify);
      rendered.push({
        workspace,
        type: badgeType(record.frames),
        timestamp: record.timestamp,
        title: record.title,
        content,
      });
    }
  } finally {
    restoreGlobals(savedGlobals);
    win.close();
  }

  const hasKatex = itemsIncludeType(items, "katex");
  const hasMermaid = itemsIncludeType(items, "mermaid");

  const html = assembleHtml(rendered, hasKatex, hasMermaid);
  const uniqueWorkspaces = [...new Set(items.map((i) => i.workspace))];
  const downloadFilename = buildDownloadFilename(uniqueWorkspaces);

  return { html, downloadFilename };
}

// generateExportHtmlInner() patches global DOM state (document, window, ...)
// for the duration of a call so happy-dom-backed rendering works, then
// restores it in a `finally`. That save/set/restore isn't reentrant: two
// overlapping calls (POST /export-html and the export_html MCP tool can run
// concurrently) each save/restore against whatever the *other* call happened
// to have in place at that moment, which can leave global DOM state pointing
// at an already-closed Window once both settle (B14). A simple queue forces
// calls to run one at a time, in the order they were made, so only one
// call's globals are ever active at once.
let exportQueue: Promise<unknown> = Promise.resolve();

export function generateExportHtml(items: ValidatedExportItem[]): Promise<ExportResult> {
  const result = exportQueue.then(() => generateExportHtmlInner(items));
  // Chain the queue off a version that never rejects, so one failed export
  // doesn't permanently wedge every export queued after it; the caller of
  // generateExportHtml() still sees the original rejection via `result`.
  exportQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
