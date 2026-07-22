/**
 * Panorama viewer animation-loop helper (LIFE-3).
 * Ensures RAF is cancelled on unmount and frame callbacks no-op once disposed.
 */

export type PanoramaAnimationFrameCallback = (time: number) => void

export type PanoramaAnimationLoopOptions = {
  /** Injected for tests; defaults to requestAnimationFrame. */
  schedule?: (callback: FrameRequestCallback) => number
  /** Injected for tests; defaults to cancelAnimationFrame. */
  cancel?: (handle: number) => void
}

export type PanoramaAnimationLoop = {
  /** Start the loop. No-op if already active or disposed. */
  start: () => void
  /** Mark disposed, cancel any pending frame, and prevent further callbacks. */
  stop: () => void
  isActive: () => boolean
  isDisposed: () => boolean
}

/**
 * Create a single-owner RAF loop that can be cancelled cleanly on unmount.
 */
export function createPanoramaAnimationLoop(
  onFrame: PanoramaAnimationFrameCallback,
  options: PanoramaAnimationLoopOptions = {}
): PanoramaAnimationLoop {
  const schedule = options.schedule ?? requestAnimationFrame
  const cancel = options.cancel ?? cancelAnimationFrame

  let rafId: number | null = null
  let active = false
  let disposed = false

  const tick: FrameRequestCallback = (time) => {
    rafId = null
    if (disposed || !active) return

    onFrame(time)

    // stop() may have run during onFrame — only reschedule while still active.
    if (disposed || !active) return
    rafId = schedule(tick)
  }

  return {
    start() {
      if (disposed || active) return
      active = true
      rafId = schedule(tick)
    },
    stop() {
      active = false
      disposed = true
      if (rafId !== null) {
        cancel(rafId)
        rafId = null
      }
    },
    isActive() {
      return active && !disposed
    },
    isDisposed() {
      return disposed
    }
  }
}
