import * as THREE from 'three'
import { collectSceneShadowBounds } from './shadowManager'

export interface HdrGroundShadowInput {
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
}

/** Ground projection slider values used to place the shadow catcher on the projected surface. */
export interface GroundProjectionShadowParams {
  height: number
  radius: number
  positionY: number
}

export function groundProjectionShadowParamsFromStore(store: {
  hdrGroundProjectionHeight: number
  hdrGroundProjectionRadius: number
  hdrGroundProjectionPositionY: number
}): GroundProjectionShadowParams {
  return {
    height: store.hdrGroundProjectionHeight,
    radius: store.hdrGroundProjectionRadius,
    positionY: store.hdrGroundProjectionPositionY
  }
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

/** Ground projection base offset — ground surface = skybox.y - height, skybox.y = height - 0.01 + positionY. */
export const GROUND_PROJECTION_SHADOW_PLANE_Y = -0.01

/** @deprecated Use shadowPlaneYForHdrMode instead */
export const HDR_SHADOW_CATCHER_PLANE_Y = STANDARD_HDR_SHADOW_PLANE_Y

/**
 * World Y of the projected ground contact surface.
 * Matches GroundedSkybox setup: position.y = height - 0.01 + positionY, surface at position.y - height.
 */
export function groundProjectionShadowPlaneY(params: GroundProjectionShadowParams): number {
  return GROUND_PROJECTION_SHADOW_PLANE_Y + params.positionY
}

export function shadowPlaneYForHdrMode(
  hdrGroundProjectionEnabled: boolean,
  groundProjection?: GroundProjectionShadowParams
): number {
  if (hdrGroundProjectionEnabled) {
    return groundProjection
      ? groundProjectionShadowPlaneY(groundProjection)
      : GROUND_PROJECTION_SHADOW_PLANE_Y
  }
  return STANDARD_HDR_SHADOW_PLANE_Y
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
  hdrGroundProjectionEnabled = false,
  targetY?: number
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
  if (targetY !== undefined) {
    plane.position.y = targetY
  }
  // Render after GroundedSkybox (renderOrder -1000) so shadows composite on the projected ground.
  plane.renderOrder = hdrGroundProjectionEnabled ? 100 : 0
}

export interface SyncHdrShadowPlaneOptions {
  showShadowPlane: boolean
  shadowIntensity: number
  input: HdrGroundShadowInput
  groundProjection?: GroundProjectionShadowParams
  /** Skip bbox reposition (visibility/material only) */
  lightweight?: boolean
  frameCount?: number
}

const SHADOW_PLANE_BASE_GEOMETRY_SIZE = 10000

function ensureShadowPlaneGeometrySize(
  plane: THREE.Mesh,
  targetWorldSize: number,
  exact = false
): void {
  const geometry = plane.geometry
  if (!(geometry instanceof THREE.PlaneGeometry)) {
    return
  }

  const currentSize = Math.max(geometry.parameters.width, geometry.parameters.height)
  const sizeDelta = Math.abs(currentSize - targetWorldSize)
  if (!exact && currentSize >= targetWorldSize) {
    return
  }
  if (exact && sizeDelta < 1) {
    return
  }

  geometry.dispose()
  plane.geometry = new THREE.PlaneGeometry(targetWorldSize, targetWorldSize)
}

function fitShadowPlaneToBounds(
  plane: THREE.Mesh,
  sceneBounds: THREE.Box3,
  hdrGroundProjectionEnabled: boolean,
  groundProjection?: GroundProjectionShadowParams
): void {
  const center = sceneBounds.getCenter(new THREE.Vector3())
  const size = sceneBounds.getSize(new THREE.Vector3())
  const radiusX = size.x * 0.75
  const radiusZ = size.z * 0.75
  const targetScaleX = Math.max(radiusX / 5, 1)
  const targetScaleZ = Math.max(radiusZ / 5, 1)

  if (hdrGroundProjectionEnabled && groundProjection) {
    const footprint = Math.max(radiusX, radiusZ) * 2
    const targetGeoSize = Math.max(groundProjection.radius * 2, footprint, 50)
    ensureShadowPlaneGeometrySize(plane, targetGeoSize, true)
  } else {
    plane.scale.set(1, 1, 1)
    ensureShadowPlaneGeometrySize(plane, SHADOW_PLANE_BASE_GEOMETRY_SIZE)
  }

  if (Math.abs(plane.position.x - center.x) > 0.05 || Math.abs(plane.position.z - center.z) > 0.05) {
    plane.position.x = center.x
    plane.position.z = center.z
  }
  if (Math.abs(plane.scale.x - targetScaleX) > 0.05 || Math.abs(plane.scale.z - targetScaleZ) > 0.05) {
    plane.scale.x = targetScaleX
    plane.scale.z = targetScaleZ
  }
}

/**
 * Keep HDR shadow plane state aligned with webexport: visible, ShadowMaterial catcher,
 * receiveShadow on, and positioned under the model on the projected ground surface.
 */
export function syncHdrShadowPlaneInScene(
  scene: THREE.Scene,
  options: SyncHdrShadowPlaneOptions
): void {
  const {
    showShadowPlane,
    shadowIntensity,
    input,
    groundProjection,
    lightweight = false,
    frameCount = 0
  } = options

  if (!shouldAutoShowShadowPlaneForHdr(input)) {
    return
  }

  const effectiveVisible = effectiveShadowPlaneVisible(showShadowPlane, input)
  const targetY = shadowPlaneYForHdrMode(input.hdrGroundProjectionEnabled, groundProjection)
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
      input.hdrGroundProjectionEnabled,
      targetY
    )

    if (input.hdrGroundProjectionEnabled) {
      if (Math.abs(obj.position.y - targetY) > 0.001) {
        obj.position.y = targetY
      }
    } else if (sceneBounds && !sceneBounds.isEmpty()) {
      const carMinY = sceneBounds.min.y
      const standardY = carMinY - 0.1
      if (Math.abs(obj.position.y - standardY) > 0.05) {
        obj.position.y = standardY
      }
    } else if (Math.abs(obj.position.y - targetY) > 0.01) {
      obj.position.y = targetY
    }

    if (sceneBounds && !sceneBounds.isEmpty()) {
      fitShadowPlaneToBounds(
        obj,
        sceneBounds,
        input.hdrGroundProjectionEnabled,
        groundProjection
      )
    }
  })
}
