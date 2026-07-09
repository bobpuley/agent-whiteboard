// Global viewport-cache file — maps "<snapshot id>:<frame index>" -> user-adjusted
// Mermaid zoom/pan. Separate from the immutable snapshot JSON files (F19 / C3 in
// docs/02). Composite key (v0.26.1, bug B19 in docs/01 — FR21): each frame of a
// step-frames sequence persists its own manual viewport independently, consistent
// with each frame now getting its own auto-fit trigger (was a bare `id` key,
// shared across a whole sequence, pre-v0.26.1).

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
  } catch (err) {
    // ENOENT (no cache file yet, e.g. first run) is expected and not logged.
    // Anything else (corrupted JSON, permission error) silently discards all
    // persisted zoom/pan state, so it's worth a warning.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error(
        "[agent-whiteboard] viewport-cache read failed, resetting cache:",
        err instanceof Error ? err.message : String(err)
      );
    }
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

function cacheKey(id: string, frameIndex: number): string {
  return `${id}:${frameIndex}`;
}

export function getViewport(id: string, frameIndex: number): Viewport | undefined {
  return readCache()[cacheKey(id, frameIndex)];
}

export function setViewport(id: string, frameIndex: number, viewport: Viewport): void {
  const cache = readCache();
  cache[cacheKey(id, frameIndex)] = viewport;
  writeCache(cache);
}

export function deleteViewport(id: string): void {
  deleteViewports([id]);
}

/** Removes every per-frame entry for each given snapshot id (prefix match on "<id>:"). */
export function deleteViewports(ids: string[]): void {
  if (ids.length === 0) return;
  const cache = readCache();
  const prefixes = ids.map((id) => `${id}:`);
  let changed = false;
  for (const key of Object.keys(cache)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      delete cache[key];
      changed = true;
    }
  }
  if (changed) writeCache(cache);
}
