import * as THREE from 'three'
import type { OrbitControls } from 'three-stdlib'

const MOVEMENT_EPSILON_SQ = 1e-10

export interface FrameMotionState {
  cameraPosition: THREE.Vector3
  cameraQuaternion: THREE.Quaternion
  controlsTarget: THREE.Vector3
}

export interface SceneActivityFlags {
  enableStandaloneWeather?: boolean
  windIntensity?: number
  cloudDensity?: number
  rainIntensity?: number
  snowIntensity?: number
}

export interface RenderLoopViewerState {
  animationMixers?: THREE.AnimationMixer[]
  csmShadowSystem?: { isEnabled?: () => boolean }
  dynamicSky?: unknown
  particleSystems?: unknown[]
  waterSystem?: unknown
  standaloneWaterSystem?: unknown
  transformControls?: unknown
}

export function createFrameMotionState(): FrameMotionState {
  return {
    cameraPosition: new THREE.Vector3(),
    cameraQuaternion: new THREE.Quaternion(),
    controlsTarget: new THREE.Vector3()
  }
}

export function captureFrameMotionState(
  state: FrameMotionState,
  camera: THREE.Camera,
  controls: OrbitControls
): void {
  state.cameraPosition.copy(camera.position)
  state.cameraQuaternion.copy(camera.quaternion)
  state.controlsTarget.copy(controls.target)
}

export function hasFrameMotion(
  previous: FrameMotionState,
  camera: THREE.Camera,
  controls: OrbitControls
): boolean {
  if (camera.position.distanceToSquared(previous.cameraPosition) > MOVEMENT_EPSILON_SQ) {
    return true
  }
  if (controls.target.distanceToSquared(previous.controlsTarget) > MOVEMENT_EPSILON_SQ) {
    return true
  }
  if (1 - Math.abs(camera.quaternion.dot(previous.cameraQuaternion)) > MOVEMENT_EPSILON_SQ) {
    return true
  }
  return false
}

export function hasActiveAnimationMixers(viewer: RenderLoopViewerState | null | undefined): boolean {
  if (!viewer?.animationMixers?.length) return false

  for (const mixer of viewer.animationMixers) {
    const actions = (mixer as THREE.AnimationMixer & { _actions?: THREE.AnimationAction[] })._actions
    if (!actions) continue
    for (const action of actions) {
      if (action.isRunning() && !action.paused) {
        return true
      }
    }
  }
  return false
}

/** True while OrbitControls damping still has pending deltas (needs update() each frame). */
export function hasOrbitControlsDamping(controls: OrbitControls): boolean {
  if (!controls.enableDamping) return false
  const c = controls as OrbitControls & {
    sphericalDelta?: THREE.Spherical
    panOffset?: THREE.Vector3
    zoomOffset?: number
  }
  if (c.sphericalDelta && (c.sphericalDelta.theta ** 2 + c.sphericalDelta.phi ** 2) > MOVEMENT_EPSILON_SQ) {
    return true
  }
  if (c.panOffset && c.panOffset.lengthSq() > MOVEMENT_EPSILON_SQ) return true
  if (Math.abs(c.zoomOffset ?? 0) > MOVEMENT_EPSILON_SQ) return true
  return false
}

/**
 * Schedule the render loop via requestAnimationFrame when idle.
 * Never invokes animate synchronously — avoids re-entry when OrbitControls
 * dispatches "change" from update() during an active frame.
 */
export function restartAnimationLoopIfIdle(
  pendingFrameId: number | undefined,
  scheduleAnimationFrame: () => void,
  onWake?: () => void
): void {
  onWake?.()
  if (pendingFrameId !== undefined) return
  scheduleAnimationFrame()
}

export function needsContinuousSceneUpdates(
  viewer: RenderLoopViewerState | null | undefined,
  controls?: OrbitControls,
  activity?: SceneActivityFlags
): boolean {
  if (controls && hasOrbitControlsDamping(controls)) return true
  if (!viewer) return false
  if ((viewer.transformControls as { dragging?: boolean } | null | undefined)?.dragging) return true
  if (hasActiveAnimationMixers(viewer)) return true
  if (viewer.particleSystems?.length) return true
  if (viewer.waterSystem) return true
  if (viewer.standaloneWaterSystem) return true

  const rain = activity?.rainIntensity ?? 0
  const snow = activity?.snowIntensity ?? 0
  if (rain > 0 || snow > 0) return true

  // CSM shadows update on camera motion — no idle redraw required.
  // Dynamic sky: animate only when wind or visible volumetric clouds need motion.
  if (viewer.dynamicSky && activity?.enableStandaloneWeather) {
    const wind = activity.windIntensity ?? 0
    const clouds = activity.cloudDensity ?? 0
    if (wind > 0.01) return true
    if (clouds > 0.01 && wind > 0.001) return true
  }

  return false
}
