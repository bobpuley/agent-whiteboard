import { readFileSync } from "fs";
import { createRequire } from "module";
import { Window } from "happy-dom";
import mermaid from "mermaid";
import katex from "katex";
import * as vl from "vega-lite";
import * as vega from "vega";
import DOMPurify from "dompurify";

// ── Public interfaces ──────────────────────────────────────────────────────

export interface ValidatedExportItem {
  workspace: string;
  filename: string;
  record: {
    type: string;
    payload: string;
    timestamp: string;
    options?: { title?: string };
  };
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

async function renderMermaid(payload: string, win: Window): Promise<string> {
  const id = `mermaid-export-${Math.random().toString(36).slice(2)}`;
  mermaid.initialize({ startOnLoad: false });

  // DOMPurify methods (sanitize, addHook, …) are absent on the shared Node.js
  // module export because it was created without a DOM at import time. Temporarily
  // copy all methods from a properly-initialized instance onto the shared export so
  // mermaid can call them, then restore originals in the finally block.
  const sharedDp = DOMPurify as unknown as Record<string, unknown>;
  const tempPurify = DOMPurify(win as unknown as Window & typeof globalThis) as unknown as Record<string, unknown>;
  const savedDpProps = new Map<string, unknown>();
  for (const key of Object.keys(tempPurify)) {
    savedDpProps.set(key, sharedDp[key]);
    const val = tempPurify[key];
    sharedDp[key] = typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(tempPurify) : val;
  }

  // Intercept Element.remove() to capture the full rendered SVG before
  // mermaid removes its temporary container div.
  const elementProto = (win as unknown as Record<string, Record<string, unknown>>)["Element"]["prototype"] as Record<string, unknown>;
  const origRemove = elementProto["remove"] as (() => void) | undefined;
  let capturedSvg: string | null = null;

  elementProto["remove"] = function (this: unknown) {
    const el = this as Element;
    if (el.tagName === "DIV") {
      const svg = el.querySelector?.("svg");
      if (svg) capturedSvg = (svg as Element).outerHTML ?? null;
    }
    origRemove?.call(this);
  };

  let resultSvg: string | null = null;
  try {
    const result = await mermaid.render(id, payload);
    // Use result.svg if it contains real content (> 300 chars is a non-trivial SVG).
    if (result?.svg && result.svg.length > 300) resultSvg = result.svg;
  } catch (err) {
    if (!capturedSvg) throw err;
  } finally {
    for (const [key, prev] of savedDpProps) {
      if (prev === undefined) {
        delete sharedDp[key];
      } else {
        sharedDp[key] = prev;
      }
    }
    if (origRemove !== undefined) {
      elementProto["remove"] = origRemove;
    } else {
      delete elementProto["remove"];
    }
  }

  const svgOutput = resultSvg ?? capturedSvg;
  if (svgOutput) return fixSvgViewBox(svgOutput);
  throw new Error("mermaid render produced no SVG output");
}

function fixSvgViewBox(svg: string): string {
  // Remove the max-width inline style that mermaid sets based on zero layout
  let result = svg.replace(/style="max-width:\s*[^"]*"/, 'style="max-width: 100%"');

  // Collect all x/y/width/height from rect elements to compute a real viewBox
  const rectMatches = [...result.matchAll(/<rect[^>]+>/g)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasCoords = false;

  for (const m of rectMatches) {
    const tag = m[0];
    const x = parseFloat(tag.match(/\bx="([^"]+)"/)?.[1] ?? "NaN");
    const y = parseFloat(tag.match(/\by="([^"]+)"/)?.[1] ?? "NaN");
    const w = parseFloat(tag.match(/\bwidth="([^"]+)"/)?.[1] ?? "NaN");
    const h = parseFloat(tag.match(/\bheight="([^"]+)"/)?.[1] ?? "NaN");
    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      hasCoords = true;
    }
  }

  if (hasCoords && isFinite(minX)) {
    const pad = 16;
    const vbX = Math.floor(minX - pad);
    const vbY = Math.floor(minY - pad);
    const vbW = Math.ceil(maxX - minX + pad * 2);
    const vbH = Math.ceil(maxY - minY + pad * 2);
    result = result.replace(/viewBox="[^"]*"/, `viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`);
  }

  return result;
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
  win: Window,
  purify: ReturnType<typeof DOMPurify>
): Promise<string> {
  switch (type) {
    case "mermaid":
      return renderMermaid(payload, win);
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

async function renderContent(
  type: string,
  payload: string,
  win: Window,
  purify: ReturnType<typeof DOMPurify>
): Promise<RenderedContent> {
  if (type === "step-frames") {
    let spec: { frame_type: string; frames: Array<{ label?: string; payload: string }> };
    try {
      spec = JSON.parse(payload) as typeof spec;
    } catch {
      return { kind: "error", message: "step-frames: invalid JSON payload" };
    }
    const frames: RenderedFrame[] = [];
    for (const frame of spec.frames) {
      try {
        const html = await renderByType(spec.frame_type, frame.payload, win, purify);
        frames.push({ label: frame.label, html });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        frames.push({ label: frame.label, html: `<p class="export-error">${escapeHtml(msg)}</p>` });
      }
    }
    return { kind: "stepFrames", frames };
  }

  try {
    const html = await renderByType(type, payload, win, purify);
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

function getKatexCss(): string {
  try {
    const req = createRequire(import.meta.url);
    const cssPath = req.resolve("katex/dist/katex.min.css");
    return readFileSync(cssPath, "utf-8");
  } catch {
    return "";
  }
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
  main { flex: 1; padding: 32px 40px; min-width: 0; }
  .workspace-section { margin-bottom: 48px; }
  .workspace-heading { font-size: 20px; font-weight: 700; color: #222; margin: 0 0 20px; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0; }
  .item-section { margin-bottom: 28px; padding: 20px; background: #fff; border: 1px solid #e8e8e8; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .item-heading { font-size: 15px; font-weight: 600; color: #333; margin: 0 0 4px; }
  .item-meta { font-size: 12px; color: #888; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }
  .type-badge { background: #e8f4fd; color: #2980b9; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .frame-section { margin-top: 16px; padding: 12px 16px; border: 1px solid #f0f0f0; border-radius: 4px; background: #fafafa; }
  .frame-heading { font-size: 12px; color: #777; margin: 0 0 10px; font-style: italic; }
  .export-error { color: #c0392b; background: #fdf0f0; padding: 10px 14px; border-radius: 4px; border-left: 3px solid #e74c3c; font-size: 13px; margin: 0; }
  svg { max-width: 100%; height: auto; }
`.trim();

function assembleHtml(items: RenderedItem[], hasKatex: boolean): string {
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
      tocHtml += `<li><a href="#${itemId}">${escapeHtml(label)}</a></li>`;

      mainHtml += `<section class="item-section" id="${itemId}">`;
      mainHtml += `<h3 class="item-heading">${escapeHtml(item.title ?? "—")}</h3>`;
      mainHtml += `<p class="item-meta"><span class="type-badge">${escapeHtml(item.type)}</span><span>${escapeHtml(formatTimestampHuman(item.timestamp))}</span></p>`;

      const { content } = item;
      if (content.kind === "error") {
        mainHtml += `<p class="export-error">${escapeHtml(content.message)}</p>`;
      } else if (content.kind === "stepFrames") {
        for (let i = 0; i < content.frames.length; i++) {
          const frame = content.frames[i];
          const frameId = `${itemId}-frame-${i}`;
          mainHtml += `<section class="frame-section" id="${frameId}">`;
          mainHtml += `<h4 class="frame-heading">${escapeHtml(frame.label ?? `Frame ${i + 1}`)}</h4>`;
          mainHtml += frame.html;
          mainHtml += `</section>`;
        }
      } else {
        mainHtml += content.html;
      }

      mainHtml += `</section>`;
    }

    tocHtml += `</ul></li>`;
    mainHtml += `</section>`;
  }

  const katexBlock = hasKatex ? `<style>${getKatexCss()}</style>\n` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Whiteboard Export</title>
<style>${LAYOUT_CSS}</style>
${katexBlock}</head>
<body>
<nav>
<h2>Contents</h2>
<ul>${tocHtml}</ul>
</nav>
<main>${mainHtml}</main>
</body>
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
    const sanitized = workspaces[0].replace(/[^a-zA-Z0-9_.\-]/g, "-").slice(0, 24);
    return `${sanitized}-${ts}.html`;
  }
  return `export-${ts}.html`;
}

// ── Public entrypoint ──────────────────────────────────────────────────────

export async function generateExportHtml(
  items: ValidatedExportItem[]
): Promise<ExportResult> {
  const win = new Window();
  const savedGlobals = saveGlobals();
  setGlobals(win);

  const purify = DOMPurify(win as unknown as Window & typeof globalThis);

  const rendered: RenderedItem[] = [];
  try {
    for (const { workspace, record } of items) {
      const content = await renderContent(record.type, record.payload, win, purify);
      rendered.push({
        workspace,
        type: record.type,
        timestamp: record.timestamp,
        title: record.options?.title,
        content,
      });
    }
  } finally {
    restoreGlobals(savedGlobals);
    win.close();
  }

  const hasKatex = items.some(({ record }) => {
    if (record.type === "katex") return true;
    if (record.type === "step-frames") {
      try {
        const spec = JSON.parse(record.payload) as { frame_type?: string };
        return spec.frame_type === "katex";
      } catch { return false; }
    }
    return false;
  });

  const html = assembleHtml(rendered, hasKatex);
  const uniqueWorkspaces = [...new Set(items.map((i) => i.workspace))];
  const downloadFilename = buildDownloadFilename(uniqueWorkspaces);

  return { html, downloadFilename };
}
