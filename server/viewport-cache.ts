// Global viewport-cache file — maps snapshot id -> user-adjusted Mermaid zoom/pan.
// Separate from the immutable snapshot JSON files (F19 / C3 in docs/02).

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Viewport {
  scale: number;
  /** Normalized fraction of the canvas container's width. */
  positionX: number;
  /** Normalized fraction of the canvas container's height. */
  positionY: number;
}

function snapshotsRoot(): string {
  return process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
}

function cachePath(): string {
  return join(snapshotsRoot(), "viewport-cache.json");
}

function readCache(): Record<string, Viewport> {
  try {
    const raw = readFileSync(cachePath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, Viewport>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Viewport>): void {
  try {
    mkdirSync(snapshotsRoot(), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error(
      "[agent-whiteboard] viewport-cache write failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export function getViewport(id: string): Viewport | undefined {
  return readCache()[id];
}

export function setViewport(id: string, viewport: Viewport): void {
  const cache = readCache();
  cache[id] = viewport;
  writeCache(cache);
}

export function deleteViewport(id: string): void {
  deleteViewports([id]);
}

export function deleteViewports(ids: string[]): void {
  if (ids.length === 0) return;
  const cache = readCache();
  let changed = false;
  for (const id of ids) {
    if (id in cache) {
      delete cache[id];
      changed = true;
    }
  }
  if (changed) writeCache(cache);
}
