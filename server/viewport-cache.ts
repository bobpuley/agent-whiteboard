// Global viewport-cache file — maps "<snapshot id>:<frame index>" -> user-adjusted
// Mermaid zoom/pan. Separate from the immutable snapshot JSON files (F19 / C3 in
// docs/02). Composite key (v0.26.1, bug B19 in docs/01 — FR21): each frame of a
// step-frames sequence persists its own manual viewport independently, consistent
// with each frame now getting its own auto-fit trigger (was a bare `id` key,
// shared across a whole sequence, pre-v0.26.1).
//
// NF49 (v1.4): reads/writes go through fs/promises instead of blocking the event
// loop, and the on-disk file is treated as a write-back cache — kept in memory
// after the first load and flushed to disk on a coalesced delay (see
// `scheduleFlush()`) instead of a full synchronous read-modify-write per
// zoom/pan event.

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getSnapshotsRoot } from "./paths.js";

export interface Viewport {
  scale: number;
  /** Normalized fraction of the canvas container's width. */
  positionX: number;
  /** Normalized fraction of the canvas container's height. */
  positionY: number;
}

function cachePath(): string {
  return join(getSnapshotsRoot(), "viewport-cache.json");
}

function cacheKey(id: string, frameIndex: number): string {
  return `${id}:${frameIndex}`;
}

// In-memory cache, lazily loaded on first access. `cachedForPath` guards
// against a stale in-memory cache surviving a change to the underlying
// snapshots root (WHITEBOARD_SNAPSHOTS_DIR) — reloads transparently if the
// resolved cache path differs from the one currently held in memory.
let cache: Record<string, Viewport> | undefined;
let cachedForPath: string | undefined;

async function loadCache(): Promise<Record<string, Viewport>> {
  const path = cachePath();
  if (cache !== undefined && cachedForPath === path) return cache;

  try {
    const raw = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    cache = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, Viewport>)
      : {};
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
    cache = {};
  }
  cachedForPath = path;
  return cache;
}

async function flushCache(): Promise<void> {
  if (cache === undefined) return;
  try {
    await mkdir(getSnapshotsRoot(), { recursive: true });
    await writeFile(cachePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error(
      "[agent-whiteboard] viewport-cache write failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Delay before a scheduled flush fires. Exported so tests can advance fake
 * timers by exactly this amount instead of hardcoding a duplicate constant.
 */
export const VIEWPORT_CACHE_FLUSH_DELAY_MS = 250;

let flushTimer: NodeJS.Timeout | undefined;

/**
 * Coalesces bursts of writes (continuous zoom/pan produces many `setViewport`
 * calls in quick succession) into a single disk write roughly
 * `VIEWPORT_CACHE_FLUSH_DELAY_MS` after the first update in a burst, instead
 * of a full synchronous rewrite per update. A timer already pending absorbs
 * every subsequent call in the same burst — it is not reset per call, so a
 * sustained stream of updates still flushes periodically rather than being
 * postponed indefinitely.
 */
function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushCache();
  }, VIEWPORT_CACHE_FLUSH_DELAY_MS);
}

export async function getViewport(id: string, frameIndex: number): Promise<Viewport | undefined> {
  const c = await loadCache();
  return c[cacheKey(id, frameIndex)];
}

export async function setViewport(id: string, frameIndex: number, viewport: Viewport): Promise<void> {
  const c = await loadCache();
  c[cacheKey(id, frameIndex)] = viewport;
  scheduleFlush();
}

/**
 * Immediately flushes the in-memory cache to disk, bypassing (and cancelling)
 * any pending debounced flush. Not needed in production — `setViewport`'s
 * own scheduled flush is sufficient — but lets tests assert on-disk state
 * deterministically without waiting on the real debounce delay or racing
 * fake timers against real fs/promises I/O.
 */
export async function flushViewportCacheNow(): Promise<void> {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  await flushCache();
}

/**
 * Drops the in-memory cache and cancels any pending flush, forcing the next
 * call to reload from disk. Not needed in production (the snapshots root
 * doesn't change at runtime); exists for tests whose fixtures recreate the
 * snapshots directory on the same path between cases (`cachedForPath`'s
 * path-based invalidation can't detect that on its own).
 */
export function resetViewportCacheForTest(): void {
  cache = undefined;
  cachedForPath = undefined;
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}

export async function deleteViewport(id: string): Promise<void> {
  await deleteViewports([id]);
}

/** Removes every per-frame entry for each given snapshot id (prefix match on "<id>:"). */
export async function deleteViewports(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const c = await loadCache();
  const prefixes = ids.map((id) => `${id}:`);
  let changed = false;
  for (const key of Object.keys(c)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      delete c[key];
      changed = true;
    }
  }
  if (changed) scheduleFlush();
}
