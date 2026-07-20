import { describe, expect, it, vi } from 'vitest'
import {
  createEmptyGuidedTour,
  createGuidedTourStep,
  resolveCameraDurationSec,
  resolveStepCameraFov
} from '../src/panorama/guidedTourTypes'
import {
  playGuidedTour,
  previewGuidedTourStep,
  resolvePopupHoldSec,
  waitMs
} from '../src/panorama/guidedTourPlayback'
import type { GuidedTourPlaybackHandlers } from '../src/panorama/guidedTourPlayback'

function createHandlers(
  overrides: Partial<GuidedTourPlaybackHandlers> = {}
): GuidedTourPlaybackHandlers {
  return {
    getActivePanoramaId: () => 'pano-1',
    switchPanorama: vi.fn(),
    animateCamera: vi.fn(async () => undefined),
    setHotspotVisible: vi.fn(),
    openInfoPopup: vi.fn(),
    closeInfoPopup: vi.fn(),
    setBirdsEnabled: vi.fn(),
    setParticlesEnabled: vi.fn(),
    setSpoutEnabled: vi.fn(),
    waitForPanoramaTransition: vi.fn(async () => undefined),
    isCurrentSession: () => true,
    ...overrides
  }
}

describe('guidedTourTypes', () => {
  it('creates empty tours and steps with defaults', () => {
    const tour = createEmptyGuidedTour('Demo')
    expect(tour.name).toBe('Demo')
    expect(tour.steps).toEqual([])

    const step = createGuidedTourStep({
      camera: { yaw: 1, pitch: 0.2, fov: 50 },
      durationSec: 3
    })
    expect(step.camera?.fov).toBe(50)
    expect(resolveCameraDurationSec(step)).toBe(2)
    expect(resolveStepCameraFov(step)).toBe(50)
  })
})

describe('playGuidedTour', () => {
  it('runs camera, hotspot, effects, and panorama switch in order', async () => {
    const order: string[] = []
    const handlers = createHandlers({
      switchPanorama: vi.fn(async () => {
        order.push('switch')
      }),
      animateCamera: vi.fn(async () => {
        order.push('camera')
      }),
      setHotspotVisible: vi.fn((id, visible) => {
        order.push(`hotspot:${id}:${visible}`)
      }),
      openInfoPopup: vi.fn((id) => {
        order.push(`popup:${id}`)
      }),
      setBirdsEnabled: vi.fn((enabled) => {
        order.push(`birds:${enabled}`)
      }),
      waitForPanoramaTransition: vi.fn(async () => {
        order.push('transition')
      })
    })

    const tour = createEmptyGuidedTour()
    tour.steps = [
      createGuidedTourStep({
        targetPanoramaId: 'pano-2',
        camera: { yaw: 0.5, pitch: 0.1, fov: 45 },
        cameraDurationSec: 0,
        durationSec: 0,
        effects: { birds: true },
        hotspotActions: [
          { hotspotId: 'hs-1', visible: true, openPopup: true, popupDurationSec: 0 }
        ]
      })
    ]

    const ac = new AbortController()
    await playGuidedTour(tour, handlers, { signal: ac.signal })

    expect(order).toEqual([
      'switch',
      'transition',
      'birds:true',
      'camera',
      'hotspot:hs-1:true',
      'popup:hs-1'
    ])
    expect(handlers.closeInfoPopup).toHaveBeenCalled()
  })

  it('stops cleanly when aborted', async () => {
    const ac = new AbortController()
    const handlers = createHandlers({
      animateCamera: vi.fn(async () => {
        ac.abort()
        await waitMs(20, ac.signal)
      })
    })

    const tour = createEmptyGuidedTour()
    tour.steps = [
      createGuidedTourStep({
        camera: { yaw: 0, pitch: 0 },
        cameraDurationSec: 1,
        durationSec: 5
      })
    ]

    await playGuidedTour(tour, handlers, { signal: ac.signal })
    expect(handlers.closeInfoPopup).toHaveBeenCalled()
  })

  it('aborted superseded session does not close the new session popup', async () => {
    const ac = new AbortController()
    let current = true
    const handlers = createHandlers({
      isCurrentSession: () => current,
      animateCamera: vi.fn(async () => {
        current = false
        ac.abort()
        await waitMs(20, ac.signal)
      })
    })

    const tour = createEmptyGuidedTour()
    tour.steps = [
      createGuidedTourStep({
        camera: { yaw: 0, pitch: 0 },
        cameraDurationSec: 1,
        durationSec: 0
      })
    ]

    await playGuidedTour(tour, handlers, { signal: ac.signal })
    // play() start + runStep start — aborted catch must not add another close.
    expect(handlers.closeInfoPopup).toHaveBeenCalledTimes(2)
  })

  it('resolvePopupHoldSec uses the longest open-popup duration', () => {
    const step = createGuidedTourStep({
      durationSec: 1,
      hotspotActions: [
        { hotspotId: 'hs-a', openPopup: true, popupDurationSec: 3 },
        { hotspotId: 'hs-b', openPopup: true, popupDurationSec: 12 },
        { hotspotId: 'hs-c', visible: true }
      ]
    })
    expect(resolvePopupHoldSec(step)).toBe(12)
  })

  it('waits for popup auto-close when it exceeds step dwell', async () => {
    const handlers = createHandlers()
    const tour = createEmptyGuidedTour()
    tour.steps = [
      createGuidedTourStep({
        camera: { yaw: 0, pitch: 0 },
        cameraDurationSec: 0,
        durationSec: 0.05,
        hotspotActions: [
          { hotspotId: 'hs-1', openPopup: true, popupDurationSec: 0.25 }
        ]
      })
    ]

    const started = performance.now()
    const ac = new AbortController()
    await playGuidedTour(tour, handlers, { signal: ac.signal })
    const elapsed = performance.now() - started

    expect(handlers.openInfoPopup).toHaveBeenCalledWith('hs-1', 0.25)
    expect(elapsed).toBeGreaterThanOrEqual(200)
  })

  it('previewGuidedTourStep applies one step without dwell', async () => {
    const order: string[] = []
    const handlers = createHandlers({
      animateCamera: vi.fn(async () => {
        order.push('camera')
      }),
      setHotspotVisible: vi.fn((id, visible) => {
        order.push(`hotspot:${id}:${visible}`)
      }),
      setBirdsEnabled: vi.fn((enabled) => {
        order.push(`birds:${enabled}`)
      })
    })

    const step = createGuidedTourStep({
      camera: { yaw: 1, pitch: 0.2, fov: 40 },
      cameraDurationSec: 0,
      durationSec: 99,
      effects: { birds: false },
      hotspotActions: [{ hotspotId: 'hs-2', visible: false }]
    })

    const ac = new AbortController()
    await previewGuidedTourStep(step, handlers, {
      signal: ac.signal,
      cameraDurationSecOverride: 0.5
    })

    expect(order).toEqual(['birds:false', 'camera', 'hotspot:hs-2:false'])
    expect(handlers.animateCamera).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 500, fov: 40 })
    )
  })

  it('waits for effects ready in parallel with the camera tween', async () => {
    const order: string[] = []
    let resolveReady!: () => void
    const readyGate = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    const handlers = createHandlers({
      animateCamera: vi.fn(async () => {
        order.push('camera-start')
        await waitMs(30, new AbortController().signal)
        order.push('camera-end')
      }),
      setParticlesEnabled: vi.fn((enabled) => {
        order.push(`particles:${enabled}`)
      }),
      waitForEffectsReady: vi.fn(async () => {
        order.push('wait-start')
        await readyGate
        order.push('wait-end')
      })
    })

    const step = createGuidedTourStep({
      camera: { yaw: 0, pitch: 0 },
      cameraDurationSec: 0.05,
      durationSec: 0,
      effects: { particles: true }
    })

    const ac = new AbortController()
    const run = previewGuidedTourStep(step, handlers, { signal: ac.signal })
    await waitMs(10, new AbortController().signal)
    expect(order).toEqual(['particles:true', 'camera-start', 'wait-start'])
    resolveReady()
    await run
    expect(order.slice(0, 3)).toEqual(['particles:true', 'camera-start', 'wait-start'])
    expect(order).toContain('camera-end')
    expect(order).toContain('wait-end')
    expect(order.indexOf('particles:true')).toBeLessThan(order.indexOf('camera-start'))
  })
})
