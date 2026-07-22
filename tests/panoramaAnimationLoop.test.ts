import { describe, expect, it, vi } from 'vitest'
import { createPanoramaAnimationLoop } from '../src/panorama/panoramaAnimationLoop'
import { createFakeRaf } from './helpers/lifecycleAccounting'

function createRafMock() {
  return createFakeRaf()
}

describe('panoramaAnimationLoop (LIFE-3)', () => {
  it('schedules frames while active and cancels on stop', () => {
    const raf = createRafMock()
    const onFrame = vi.fn()
    const loop = createPanoramaAnimationLoop(onFrame, {
      schedule: raf.schedule,
      cancel: raf.cancel
    })

    loop.start()
    expect(loop.isActive()).toBe(true)
    expect(raf.pendingCount()).toBe(1)

    raf.flush(16)
    expect(onFrame).toHaveBeenCalledTimes(1)
    expect(raf.pendingCount()).toBe(1)

    loop.stop()
    expect(loop.isDisposed()).toBe(true)
    expect(loop.isActive()).toBe(false)
    expect(raf.cancel).toHaveBeenCalledTimes(1)
    expect(raf.pendingCount()).toBe(0)

    raf.flush(32)
    expect(onFrame).toHaveBeenCalledTimes(1)
  })

  it('no-ops frame callbacks after dispose even if a stale handle fires', () => {
    const raf = createRafMock()
    const onFrame = vi.fn()
    const loop = createPanoramaAnimationLoop(onFrame, {
      schedule: raf.schedule,
      cancel: raf.cancel
    })

    loop.start()
    const staleCallbacks = [...raf.pending.values()]
    // Simulate a race where cancel did not prevent an already-queued callback.
    raf.pending.clear()
    loop.stop()

    for (const callback of staleCallbacks) {
      callback(48)
    }

    expect(onFrame).not.toHaveBeenCalled()
    expect(raf.pendingCount()).toBe(0)
  })

  it('does not reschedule when stop() runs during onFrame', () => {
    const raf = createRafMock()
    const loop = createPanoramaAnimationLoop(
      () => {
        loop.stop()
      },
      { schedule: raf.schedule, cancel: raf.cancel }
    )

    loop.start()
    raf.flush(16)

    expect(loop.isDisposed()).toBe(true)
    expect(raf.pendingCount()).toBe(0)
  })

  it('repeated start/stop cycles keep exactly one pending frame while active', () => {
    const raf = createRafMock()
    const onFrame = vi.fn()

    for (let i = 0; i < 5; i++) {
      const loop = createPanoramaAnimationLoop(onFrame, {
        schedule: raf.schedule,
        cancel: raf.cancel
      })
      loop.start()
      expect(raf.pendingCount()).toBe(1)
      loop.start() // idempotent
      expect(raf.pendingCount()).toBe(1)
      raf.flush(i)
      expect(raf.pendingCount()).toBe(1)
      loop.stop()
      expect(raf.pendingCount()).toBe(0)
    }

    expect(onFrame).toHaveBeenCalledTimes(5)
  })
})
