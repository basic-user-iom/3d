import {
  DEFAULT_GUIDED_POPUP_DURATION_SEC,
  resolveCameraDurationSec,
  resolveStepCameraFov,
  type GuidedTour,
  type GuidedTourEasing,
  type GuidedTourStep
} from './guidedTourTypes'

export interface GuidedTourCameraCommand {
  yaw: number
  pitch: number
  fov: number
  durationMs: number
  easing: GuidedTourEasing
}

export interface GuidedTourPlaybackHandlers {
  getActivePanoramaId: () => string | null
  switchPanorama: (panoramaId: string) => void | Promise<void>
  /** Animate camera; should resolve when the tween finishes (or immediately if duration 0). */
  animateCamera: (command: GuidedTourCameraCommand) => Promise<void>
  setHotspotVisible: (hotspotId: string, visible: boolean) => void
  openInfoPopup: (hotspotId: string, autoCloseSec?: number) => void
  closeInfoPopup: () => void
  setBirdsEnabled: (enabled: boolean) => void
  setParticlesEnabled: (enabled: boolean) => void
  setSpoutEnabled: (enabled: boolean) => void
  /**
   * Optional: wait until effects this step enables report ready/unsupported/error.
   * Lets WebGPU overlays warm up during the camera tween instead of after landing.
   */
  waitForEffectsReady?: (step: GuidedTourStep) => Promise<void>
  /** Optional: wait for panorama transition (~550ms). */
  waitForPanoramaTransition?: () => Promise<void>
  /** Return false when this playback session was superseded (e.g. tour restarted). */
  isCurrentSession?: () => boolean
}

export interface GuidedTourPlaybackOptions {
  signal: AbortSignal
  onStepIndex?: (index: number) => void
  /** Called after tour finishes normally (not on abort). */
  onComplete?: () => void
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const err = new Error('Guided tour aborted')
    err.name = 'AbortError'
    throw err
  }
}

export function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    assertNotAborted(signal)
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const err = new Error('Guided tour aborted')
      err.name = 'AbortError'
      reject(err)
      return
    }
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      const err = new Error('Guided tour aborted')
      err.name = 'AbortError'
      reject(err)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function applyEffects(step: GuidedTourStep, handlers: GuidedTourPlaybackHandlers): void {
  if (!step.effects) return
  if (typeof step.effects.birds === 'boolean') handlers.setBirdsEnabled(step.effects.birds)
  if (typeof step.effects.particles === 'boolean') {
    handlers.setParticlesEnabled(step.effects.particles)
  }
  if (typeof step.effects.spout === 'boolean') handlers.setSpoutEnabled(step.effects.spout)
}

function applyHotspotActions(step: GuidedTourStep, handlers: GuidedTourPlaybackHandlers): void {
  for (const action of step.hotspotActions ?? []) {
    if (typeof action.visible === 'boolean') {
      handlers.setHotspotVisible(action.hotspotId, action.visible)
    }
    if (action.openPopup) {
      handlers.openInfoPopup(action.hotspotId, action.popupDurationSec)
    }
  }
}

/** Longest info-popup hold for this step (0 when no popup opens). */
export function resolvePopupHoldSec(step: GuidedTourStep): number {
  let maxHold = 0
  for (const action of step.hotspotActions ?? []) {
    if (!action.openPopup) continue
    const sec =
      typeof action.popupDurationSec === 'number' && Number.isFinite(action.popupDurationSec)
        ? action.popupDurationSec
        : DEFAULT_GUIDED_POPUP_DURATION_SEC
    maxHold = Math.max(maxHold, Math.max(0, sec))
  }
  return maxHold
}

export interface RunGuidedTourStepOptions {
  signal: AbortSignal
  /** Skip post-action dwell (`durationSec`). Useful for editor step scrubbing. */
  skipDwell?: boolean
  /**
   * Override camera tween length (seconds). When omitted, uses the step's
   * `cameraDurationSec` / default. Preview scrubbing often passes a short value.
   */
  cameraDurationSecOverride?: number
}

async function runStep(
  step: GuidedTourStep,
  handlers: GuidedTourPlaybackHandlers,
  options: RunGuidedTourStepOptions
): Promise<void> {
  const { signal, skipDwell = false, cameraDurationSecOverride } = options
  assertNotAborted(signal)
  // Drop any prior step's info card before moving the camera for this step.
  handlers.closeInfoPopup()

  const targetPano = step.targetPanoramaId?.trim() || null
  if (targetPano && targetPano !== handlers.getActivePanoramaId()) {
    await Promise.resolve(handlers.switchPanorama(targetPano))
    assertNotAborted(signal)
    if (handlers.waitForPanoramaTransition) {
      await handlers.waitForPanoramaTransition()
    } else {
      await waitMs(600, signal)
    }
  }

  // Enable authored effect layers before the camera tween so overlays (esp. WebGPU
  // particles/birds) can initialize while the view is still moving — not only after land.
  applyEffects(step, handlers)

  const cameraDurationSec =
    typeof cameraDurationSecOverride === 'number' && Number.isFinite(cameraDurationSecOverride)
      ? Math.max(0, cameraDurationSecOverride)
      : resolveCameraDurationSec(step)
  const cameraPromise = step.camera
    ? handlers.animateCamera({
        yaw: step.camera.yaw,
        pitch: step.camera.pitch,
        fov: resolveStepCameraFov(step),
        durationMs: Math.round(cameraDurationSec * 1000),
        easing: step.easing ?? 'easeInOut'
      })
    : Promise.resolve()
  const effectsReadyPromise = handlers.waitForEffectsReady?.(step) ?? Promise.resolve()
  await Promise.all([cameraPromise, effectsReadyPromise])
  assertNotAborted(signal)

  applyHotspotActions(step, handlers)

  if (skipDwell) return

  // Stay until both the step dwell and any info-popup auto-close finish — otherwise
  // the next camera move yanks the view away and the popup vanishes early.
  const dwellSec = Math.max(step.durationSec ?? 0, resolvePopupHoldSec(step))
  const dwellMs = Math.max(0, dwellSec * 1000)
  if (dwellMs > 0) {
    await waitMs(dwellMs, signal)
  }
}

/**
 * Apply a single guided-tour step (panorama switch → camera → effects/hotspots).
 * Used for editor "preview this step" scrubbing; skips dwell by default.
 */
export async function previewGuidedTourStep(
  step: GuidedTourStep,
  handlers: GuidedTourPlaybackHandlers,
  options: RunGuidedTourStepOptions
): Promise<void> {
  if (handlers.isCurrentSession?.() !== false) {
    handlers.closeInfoPopup()
  }
  try {
    await runStep(step, handlers, { skipDwell: true, ...options })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (handlers.isCurrentSession?.() !== false) {
        handlers.closeInfoPopup()
      }
      return
    }
    throw error
  }
}

/**
 * Play a guided tour sequentially. Rejects with AbortError when stopped via signal.
 */
export async function playGuidedTour(
  tour: GuidedTour,
  handlers: GuidedTourPlaybackHandlers,
  options: GuidedTourPlaybackOptions
): Promise<void> {
  const { signal, onStepIndex, onComplete } = options
  handlers.closeInfoPopup()

  try {
    for (let i = 0; i < tour.steps.length; i++) {
      assertNotAborted(signal)
      onStepIndex?.(i)
      await runStep(tour.steps[i], handlers, { signal })
    }
    if (handlers.isCurrentSession?.() !== false) {
      handlers.closeInfoPopup()
      onStepIndex?.(-1)
      onComplete?.()
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Superseded sessions must not clear the new tour's info card.
      if (handlers.isCurrentSession?.() !== false) {
        handlers.closeInfoPopup()
        onStepIndex?.(-1)
      }
      return
    }
    throw error
  }
}
