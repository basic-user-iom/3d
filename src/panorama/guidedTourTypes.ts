/** Guided / automated tour — waypoint-style sequence (3DVista Auto Pilot inspired). */

export type GuidedTourEasing = 'linear' | 'easeInOut'

export interface GuidedTourCameraTarget {
  /** Horizontal look angle in radians. */
  yaw: number
  /** Vertical look angle in radians. */
  pitch: number
  /** Perspective FOV in degrees. Defaults to 75 when omitted. */
  fov?: number
}

export interface GuidedTourHotspotAction {
  hotspotId: string
  /** Show or hide the hotspot marker. */
  visible?: boolean
  /** Open the info popup for this hotspot (info type). */
  openPopup?: boolean
  /** Auto-close popup after this many seconds (user-controllable). */
  popupDurationSec?: number
}

export interface GuidedTourEffectsAction {
  birds?: boolean
  particles?: boolean
  spout?: boolean
}

/**
 * One timeline step / keyframe.
 * Camera animates first (if set), then actions run, then the step dwells for `durationSec`.
 */
export interface GuidedTourStep {
  id: string
  label?: string
  /**
   * Dwell time in seconds after the camera move (and actions) complete.
   * Use 0 to advance immediately after actions.
   */
  durationSec: number
  /** Optional camera target. Capture via “Set camera from current view”. */
  camera?: GuidedTourCameraTarget | null
  /** Seconds to animate toward `camera`. Defaults to 2 when camera is set. */
  cameraDurationSec?: number
  easing?: GuidedTourEasing
  hotspotActions?: GuidedTourHotspotAction[]
  effects?: GuidedTourEffectsAction
  /** Switch to this panorama before camera/actions (with existing transition). */
  targetPanoramaId?: string | null
}

export interface GuidedTour {
  id: string
  name: string
  steps: GuidedTourStep[]
}

export const DEFAULT_GUIDED_CAMERA_FOV = 75
export const DEFAULT_GUIDED_CAMERA_DURATION_SEC = 2
export const DEFAULT_GUIDED_POPUP_DURATION_SEC = 4
export const DEFAULT_GUIDED_STEP_DURATION_SEC = 1

export function createGuidedTourId(): string {
  return `gt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createGuidedTourStepId(): string {
  return `gts-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyGuidedTour(name = 'Guided tour'): GuidedTour {
  return {
    id: createGuidedTourId(),
    name,
    steps: []
  }
}

export function createGuidedTourStep(
  partial: Partial<GuidedTourStep> & { camera?: GuidedTourCameraTarget | null } = {}
): GuidedTourStep {
  return {
    id: createGuidedTourStepId(),
    label: partial.label ?? 'Step',
    durationSec: partial.durationSec ?? DEFAULT_GUIDED_STEP_DURATION_SEC,
    camera: partial.camera ?? null,
    cameraDurationSec: partial.cameraDurationSec,
    easing: partial.easing ?? 'easeInOut',
    hotspotActions: partial.hotspotActions ? [...partial.hotspotActions] : [],
    effects: partial.effects ? { ...partial.effects } : undefined,
    targetPanoramaId: partial.targetPanoramaId ?? null
  }
}

export function resolveCameraDurationSec(step: GuidedTourStep): number {
  if (!step.camera) return 0
  const raw = step.cameraDurationSec
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw
  return DEFAULT_GUIDED_CAMERA_DURATION_SEC
}

export function resolveStepCameraFov(step: GuidedTourStep): number {
  const fov = step.camera?.fov
  if (typeof fov === 'number' && Number.isFinite(fov) && fov > 5 && fov < 140) return fov
  return DEFAULT_GUIDED_CAMERA_FOV
}

export function summarizeGuidedTourStep(step: GuidedTourStep): string {
  const parts: string[] = []
  if (step.targetPanoramaId) parts.push('pano')
  if (step.camera) parts.push('cam')
  if (step.effects) {
    const on = Object.entries(step.effects)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    const off = Object.entries(step.effects)
      .filter(([, v]) => v === false)
      .map(([k]) => k)
    if (on.length) parts.push(`+${on.join('/')}`)
    if (off.length) parts.push(`−${off.join('/')}`)
  }
  if (step.hotspotActions?.length) {
    const pop = step.hotspotActions.some((a) => a.openPopup)
    parts.push(pop ? 'hotspot+popup' : 'hotspot')
  }
  if (parts.length === 0) parts.push('wait')
  return parts.join(' · ')
}
