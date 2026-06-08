// In-process event bus for user interaction signals.

import { EventEmitter } from 'node:events'

const bus = new EventEmitter()

const WAIT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

// ── Done signal ───────────────────────────────────────────────────────────────

/** Signal that the user clicked Done — wakes all pending waitForDone() calls. */
export function signalDone(): void {
  bus.emit('done')
}

/** Resolve when the user clicks Done (or after the timeout). */
export function waitForDone(): Promise<void> {
  return new Promise<void>((resolve) => {
    const onDone = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      bus.off('done', onDone)
      resolve()
    }, WAIT_TIMEOUT_MS)
    bus.once('done', onDone)
  })
}

// ── Click signal ──────────────────────────────────────────────────────────────

export interface ClickEvent {
  type: 'node' | 'edge' | 'timeout'
  id: string
  label: string
  action: string | null
}

// At most one pending waitForClick() at a time.
let clickResolve: ((event: ClickEvent) => void) | null = null
let clickTimer: ReturnType<typeof setTimeout> | null = null

/** Signal that the user clicked a node/edge — resolves the pending waitForClick(). No-op if none pending. */
export function signalClick(event: ClickEvent): void {
  if (!clickResolve) return
  const resolve = clickResolve
  clickResolve = null
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  resolve(event)
}

/**
 * Resolve when the user clicks a node/edge (or after the timeout).
 * At most one call may be pending — a second call cancels and replaces the first.
 */
export function waitForClick(): Promise<ClickEvent> {
  // Cancel any existing listener.
  if (clickResolve) {
    clickResolve({ type: 'timeout', id: '', label: '', action: null })
    clickResolve = null
  }
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }

  return new Promise<ClickEvent>((resolve) => {
    clickResolve = resolve
    clickTimer = setTimeout(() => {
      clickResolve = null
      clickTimer = null
      resolve({ type: 'timeout', id: '', label: '', action: null })
    }, WAIT_TIMEOUT_MS)
  })
}

/** Reset click state — for use in tests only. */
export function resetClick(): void {
  if (clickResolve) {
    clickResolve({ type: 'timeout', id: '', label: '', action: null })
    clickResolve = null
  }
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
}
