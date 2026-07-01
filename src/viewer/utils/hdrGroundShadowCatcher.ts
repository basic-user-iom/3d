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

/** Minimum ShadowMaterial opacity so contact shadows stay visible on dark HDR ground (matches webexport). */
export const MIN_SHADOW_CATCHER_OPACITY = 0.3

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
  const raw = 0.1 + (shadowIntensity / 2.0) * 0.9
  return Math.min(1.0, Math.max(MIN_SHADOW_CATCHER_OPACITY, raw))
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
    shadowMaterial.userData.baseOpacity = opacity
    plane.material = shadowMaterial
  } else {
    current.opacity = opacity
    current.transparent = true
    current.side = THREE.DoubleSide
    current.userData.baseOpacity = opacity
    if (current.depthWrite !== true) {
      current.depthWrite = true
    }
    current.needsUpdate = true
  }

  const material = plane.material as THREE.ShadowMaterial
  // Ground projection: composite shadow catcher over GroundedSkybox (MeshBasicMaterial, depthWrite=false).
  // depthTest=false ensures the catcher draws on the projected ground even when the depth buffer
  // holds car or sky geometry from the opaque pass (matches working webexport behaviour).
  if (hdrGroundProjectionEnabled) {
    material.depthTest = false
    material.depthWrite = true
  } else {
    material.depthTest = true
    material.depthWrite = true
  }
  material.visible = true
  if (material.opacity < MIN_SHADOW_CATCHER_OPACITY) {
    material.opacity = Math.max(MIN_SHADOW_CATCHER_OPACITY, material.userData.baseOpacity ?? MIN_SHADOW_CATCHER_OPACITY)
  }

  plane.receiveShadow = true
  plane.castShadow = false
  plane.frustumCulled = false
  if (targetY !== undefined) {
    plane.position.y = targetY
  }
  // Match webexport: renderOrder 0 (GroundedSkybox uses -1000; transparent ShadowMaterial sorts after opaque).
  plane.renderOrder = 0
}

export interface SyncHdrShadowPlaneOptions {
  showShadowPlane: boolean
  shadowIntensity: number
  input: HdrGroundShadowInput
  groundProjection?: GroundProjectionShadowParams
  /** Skip bbox reposition (visibility/material only) */
  lightweight?: boolean
  frameCount?: number
  /** Log shadow plane state once per second (frameCount % 60 === 0) */
  debugLog?: boolean
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

  if (hdrGroundProjectionEnabled && groundProjection) {
    const footprint = Math.max(radiusX, radiusZ) * 2
    const targetGeoSize = Math.max(groundProjection.radius * 2, footprint, 50)
    ensureShadowPlaneGeometrySize(plane, targetGeoSize, true)
    // Match webexport ground projection: full scale, centered under model X/Z.
    if (Math.abs(plane.scale.x - 1) > 0.01 || Math.abs(plane.scale.y - 1) > 0.01 || Math.abs(plane.scale.z - 1) > 0.01) {
      plane.scale.set(1, 1, 1)
    }
    if (Math.abs(plane.position.x - center.x) > 0.05 || Math.abs(plane.position.z - center.z) > 0.05) {
      plane.position.x = center.x
      plane.position.z = center.z
    }
    return
  }

  const targetScaleX = Math.max(radiusX / 5, 1)
  const targetScaleZ = Math.max(radiusZ / 5, 1)
  plane.scale.set(1, 1, 1)
  ensureShadowPlaneGeometrySize(plane, SHADOW_PLANE_BASE_GEOMETRY_SIZE)

  if (Math.abs(plane.position.x - center.x) > 0.05 || Math.abs(plane.position.z - center.z) > 0.05) {
    plane.position.x = center.x
    plane.position.z = center.z
  }
  if (Math.abs(plane.scale.x - targetScaleX) > 0.05 || Math.abs(plane.scale.z - targetScaleZ) > 0.05) {
    plane.scale.x = targetScaleX
    plane.scale.z = targetScaleZ
  }
}

/** Expand shadow camera bounds to include the HDR ground catcher plane. */
export function expandBoundsWithShadowCatcher(
  box: THREE.Box3,
  targetY: number,
  halfExtent = 50
): THREE.Box3 {
  const expanded = box.clone()
  expanded.expandByPoint(new THREE.Vector3(-halfExtent, targetY, -halfExtent))
  expanded.expandByPoint(new THREE.Vector3(halfExtent, targetY, halfExtent))
  return expanded
}

function logShadowPlaneState(plane: THREE.Mesh, frameCount: number): void {
  if (frameCount % 60 !== 0) return
  const mat = plane.material
  const materialName = mat instanceof THREE.Material ? mat.constructor.name : 'unknown'
  const opacity = mat instanceof THREE.ShadowMaterial ? mat.opacity : undefined
  console.log('[HdrShadowCatcher] shadow plane state', {
    visible: plane.visible,
    receiveShadow: plane.receiveShadow,
    castShadow: plane.castShadow,
    position: { x: plane.position.x, y: plane.position.y, z: plane.position.z },
    scale: { x: plane.scale.x, y: plane.scale.y, z: plane.scale.z },
    renderOrder: plane.renderOrder,
    materialType: materialName,
    opacity,
    depthTest: mat instanceof THREE.Material && 'depthTest' in mat ? (mat as THREE.Material).depthTest : undefined,
    inScene: !!plane.parent
  })
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
    frameCount = 0,
    debugLog = false
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

    // Every-frame integrity (matches webexport render loop)
    if (!obj.visible && effectiveVisible) {
      obj.visible = true
    } else if (obj.visible !== effectiveVisible) {
      obj.visible = effectiveVisible
    }

    obj.receiveShadow = true
    obj.castShadow = false
    obj.frustumCulled = false

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
    } else if (input.hdrGroundProjectionEnabled && groundProjection) {
      const targetGeoSize = Math.max(groundProjection.radius * 2, 50)
      ensureShadowPlaneGeometrySize(obj, targetGeoSize, true)
      if (Math.abs(obj.scale.x - 1) > 0.01) {
        obj.scale.set(1, 1, 1)
      }
    }

    if (debugLog) {
      logShadowPlaneState(obj, frameCount)
    }
  })
}

/** Force sun shadow maps + renderer shadowMap when HDR ground projection shadows are active. */
export function forceHdrSunShadowState(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | null | undefined,
  shadowsEnabled: boolean
): { sunFound: boolean; sunCastShadow: boolean } {
  let sunFound = false
  let sunCastShadow = false

  if (renderer?.shadowMap && shadowsEnabled) {
    if (!renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true
    }
    renderer.shadowMap.autoUpdate = true
  }

  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.userData.isSun) {
      sunFound = true
      if (shadowsEnabled && !obj.castShadow) {
        obj.castShadow = true
      }
      sunCastShadow = obj.castShadow
      if (obj.castShadow && obj.shadow) {
        obj.shadow.needsUpdate = true
        obj.shadow.camera?.updateProjectionMatrix()
      }
    }
  })

  if (renderer?.shadowMap && shadowsEnabled) {
    renderer.shadowMap.needsUpdate = true
  }

  return { sunFound, sunCastShadow }
}
