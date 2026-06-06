// In-process event bus for user interaction signals.

import { EventEmitter } from 'node:events'

const bus = new EventEmitter()

const WAIT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

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
