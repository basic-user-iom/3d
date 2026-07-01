import * as THREE from 'three'
import { collectSceneShadowBounds } from './shadowManager'

export interface HdrGroundShadowInput {
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
}

/** Auto-show shadow plane whenever the user has shadows on under HDR lighting. */
export function shouldAutoShowShadowPlaneForHdr(input: HdrGroundShadowInput): boolean {
  return input.hdrEnabled && input.shadowsEnabled
}

/**
 * HDR washes out MeshStandardMaterial ground planes via scene.environment IBL.
 * GroundedSkybox (ground projection) uses MeshBasicMaterial and cannot sample shadow maps.
 * Always use a transparent ShadowMaterial catcher when HDR + shadows are on (toggle only
 * controls visibility via effectiveShadowPlaneVisible).
 */
export function shouldUseHdrGroundShadowCatcher(
  input: HdrGroundShadowInput,
  _showShadowPlane?: boolean
): boolean {
  return shouldAutoShowShadowPlaneForHdr(input)
}

/** Standard 360 HDR — matches webexport ground contact height. */
export const STANDARD_HDR_SHADOW_PLANE_Y = -0.001

/** Ground projection — matches webexport GroundedSkybox surface level. */
export const GROUND_PROJECTION_SHADOW_PLANE_Y = -0.01

/** @deprecated Use shadowPlaneYForHdrMode instead */
export const HDR_SHADOW_CATCHER_PLANE_Y = STANDARD_HDR_SHADOW_PLANE_Y

export function shadowPlaneYForHdrMode(hdrGroundProjectionEnabled: boolean): number {
  return hdrGroundProjectionEnabled
    ? GROUND_PROJECTION_SHADOW_PLANE_Y
    : STANDARD_HDR_SHADOW_PLANE_Y
}

/** Shadow plane is shown when user toggles it on OR HDR + shadows auto-show it. */
export function effectiveShadowPlaneVisible(
  showShadowPlane: boolean,
  input: HdrGroundShadowInput
): boolean {
  return showShadowPlane || shouldAutoShowShadowPlaneForHdr(input)
}

export function shadowCatcherOpacity(shadowIntensity: number): number {
  return Math.min(1.0, 0.1 + (shadowIntensity / 2.0) * 0.9)
}

export function applyHdrGroundShadowCatcherMaterial(
  plane: THREE.Mesh,
  shadowIntensity: number,
  hdrGroundProjectionEnabled = false
): void {
  const opacity = shadowCatcherOpacity(shadowIntensity)
  const current = plane.material

  if (!(current instanceof THREE.ShadowMaterial)) {
    if (current instanceof THREE.Material) {
      current.dispose()
    }
    const shadowMaterial = new THREE.ShadowMaterial({
      opacity,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    })
    plane.material = shadowMaterial
  } else {
    current.opacity = opacity
    current.transparent = true
    current.side = THREE.DoubleSide
    if (current.depthWrite !== true) {
      current.depthWrite = true
    }
    current.needsUpdate = true
  }

  plane.receiveShadow = true
  plane.castShadow = false
  plane.position.y = shadowPlaneYForHdrMode(hdrGroundProjectionEnabled)
  plane.renderOrder = hdrGroundProjectionEnabled ? 100 : 0
}

export interface SyncHdrShadowPlaneOptions {
  showShadowPlane: boolean
  shadowIntensity: number
  input: HdrGroundShadowInput
  /** Skip bbox reposition (visibility/material only) */
  lightweight?: boolean
  frameCount?: number
}

/**
 * Keep HDR shadow plane state aligned with webexport: visible, ShadowMaterial catcher,
 * receiveShadow on, and positioned under the model for standard 360 HDR.
 */
export function syncHdrShadowPlaneInScene(
  scene: THREE.Scene,
  options: SyncHdrShadowPlaneOptions
): void {
  const { showShadowPlane, shadowIntensity, input, lightweight = false, frameCount = 0 } = options

  if (!shouldAutoShowShadowPlaneForHdr(input)) {
    return
  }

  const effectiveVisible = effectiveShadowPlaneVisible(showShadowPlane, input)
  const targetY = shadowPlaneYForHdrMode(input.hdrGroundProjectionEnabled)
  const shouldReposition = !lightweight && frameCount % 30 === 0
  const sceneBounds = shouldReposition ? collectSceneShadowBounds(scene) : null

  scene.traverse((obj) => {
    if (!obj.userData.isShadowPlane || !(obj instanceof THREE.Mesh)) {
      return
    }

    if (obj.userData.__hiddenForPathTracer) {
      return
    }

    if (!obj.visible && effectiveVisible) {
      obj.visible = true
    } else if (obj.visible !== effectiveVisible) {
      obj.visible = effectiveVisible
    }

    obj.receiveShadow = true
    obj.castShadow = false

    applyHdrGroundShadowCatcherMaterial(
      obj,
      shadowIntensity,
      input.hdrGroundProjectionEnabled
    )

    if (Math.abs(obj.position.y - targetY) > 0.01) {
      obj.position.y = targetY
    }

    if (input.hdrGroundProjectionEnabled) {
      if (Math.abs(obj.position.x) > 0.01 || Math.abs(obj.position.z) > 0.01) {
        obj.position.x = 0
        obj.position.z = 0
      }
      if (Math.abs(obj.scale.x - 1) > 0.01 || Math.abs(obj.scale.z - 1) > 0.01) {
        obj.scale.set(1, 1, 1)
      }
    } else if (sceneBounds && !sceneBounds.isEmpty()) {
      const center = sceneBounds.getCenter(new THREE.Vector3())
      const size = sceneBounds.getSize(new THREE.Vector3())
      const radiusX = size.x * 0.75
      const radiusZ = size.z * 0.75
      const targetScaleX = Math.max(radiusX / 5, 1)
      const targetScaleZ = Math.max(radiusZ / 5, 1)

      if (Math.abs(obj.position.x - center.x) > 0.05 || Math.abs(obj.position.z - center.z) > 0.05) {
        obj.position.x = center.x
        obj.position.z = center.z
      }
      if (Math.abs(obj.scale.x - targetScaleX) > 0.05 || Math.abs(obj.scale.z - targetScaleZ) > 0.05) {
        obj.scale.x = targetScaleX
        obj.scale.z = targetScaleZ
      }
    }
  })
}
