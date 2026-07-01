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

/** webexport sun bias for contact shadows on the flat ground catcher */
export const HDR_GROUND_SUN_SHADOW_BIAS = 0.00015
export const HDR_GROUND_SUN_SHADOW_NORMAL_BIAS = 0.1

/** True when a GroundedSkybox is present (store flag can lag behind HDRSystem). */
export function sceneHasGroundProjection(scene: THREE.Scene): boolean {
  let found = false
  scene.traverse((obj) => {
    if (found) return
    if (obj.userData?.isGroundedSkybox || (obj as THREE.Object3D & { isGroundedSkybox?: boolean }).isGroundedSkybox) {
      found = true
    }
  })
  return found
}

/** Store flag OR live GroundedSkybox in the scene. */
export function resolveGroundProjectionActive(
  hdrGroundProjectionEnabled: boolean,
  scene?: THREE.Scene | null
): boolean {
  return hdrGroundProjectionEnabled || (scene ? sceneHasGroundProjection(scene) : false)
}

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
  material.userData.isHdrGroundShadowCatcher = true
  // Match webexport: depthTest=true so the catcher is occluded by car/scene geometry above the ground.
  // GroundedSkybox uses depthWrite=false, so ground pixels retain far depth and the catcher still composites.
  material.depthTest = true
  material.depthWrite = true
  if (hdrGroundProjectionEnabled) {
    material.polygonOffset = true
    material.polygonOffsetFactor = -1
    material.polygonOffsetUnits = -1
  } else {
    material.polygonOffset = false
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

export interface HdrShadowStatusSnapshot {
  sunFound: boolean
  sunCastShadow: boolean
  rendererShadowMapEnabled: boolean
  groundProjectionActive: boolean
  shadowPlaneFound: boolean
  shadowPlaneVisible: boolean
  shadowPlaneMaterial: string
  shadowPlaneReceiveShadow: boolean
  shadowPlaneY: number | null
}

function findShadowPlaneInScene(scene: THREE.Scene): THREE.Mesh | null {
  let plane: THREE.Mesh | null = null
  scene.traverse((obj) => {
    if (!plane && obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
      plane = obj
    }
  })
  return plane
}

let lastHdrShadowStatusLogKey = ''

/** One-time log when HDR + shadows state changes — helps debug missing contact shadows. */
export function logHdrShadowStatusOnce(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | null | undefined,
  options: {
    sunFound: boolean
    sunCastShadow: boolean
    input: HdrGroundShadowInput
    showShadowPlane: boolean
    groundProjectionActive: boolean
  }
): HdrShadowStatusSnapshot | null {
  if (!shouldAutoShowShadowPlaneForHdr(options.input)) {
    return null
  }

  const plane = findShadowPlaneInScene(scene)
  const mat = plane?.material
  const materialName = mat instanceof THREE.Material ? mat.constructor.name : 'none'
  const snapshot: HdrShadowStatusSnapshot = {
    sunFound: options.sunFound,
    sunCastShadow: options.sunCastShadow,
    rendererShadowMapEnabled: renderer?.shadowMap?.enabled ?? false,
    groundProjectionActive: options.groundProjectionActive,
    shadowPlaneFound: !!plane,
    shadowPlaneVisible: plane?.visible ?? false,
    shadowPlaneMaterial: materialName,
    shadowPlaneReceiveShadow: plane?.receiveShadow ?? false,
    shadowPlaneY: plane ? plane.position.y : null
  }

  const logKey = JSON.stringify(snapshot)
  if (logKey === lastHdrShadowStatusLogKey) {
    return snapshot
  }
  lastHdrShadowStatusLogKey = logKey

  console.log('[HdrShadowCatcher] HDR ground shadows active', {
    ...snapshot,
    showShadowPlane: options.showShadowPlane,
    effectiveShadowPlaneVisible: effectiveShadowPlaneVisible(options.showShadowPlane, options.input),
    storeGroundProjectionFlag: options.input.hdrGroundProjectionEnabled,
    sceneHasGroundedSkybox: sceneHasGroundProjection(scene)
  })

  return snapshot
}

/** Sync sun + catcher after HDR load or model load (handles async HDR / GroundedSkybox timing). */
export function refreshHdrGroundShadowState(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | null | undefined,
  options: {
    showShadowPlane: boolean
    shadowIntensity: number
    shadowsEnabled: boolean
    hdrEnabled: boolean
    hdrGroundProjectionEnabled: boolean
    groundProjection?: GroundProjectionShadowParams
    lightweight?: boolean
    frameCount?: number
  }
): HdrShadowStatusSnapshot | null {
  if (!options.hdrEnabled || !options.shadowsEnabled) {
    return null
  }

  const groundProjectionActive = resolveGroundProjectionActive(
    options.hdrGroundProjectionEnabled,
    scene
  )
  const input: HdrGroundShadowInput = {
    hdrEnabled: options.hdrEnabled,
    hdrGroundProjectionEnabled: groundProjectionActive,
    shadowsEnabled: options.shadowsEnabled
  }

  const sunState = forceHdrSunShadowState(scene, renderer, options.shadowsEnabled, {
    groundProjectionActive
  })

  syncHdrShadowPlaneInScene(scene, {
    showShadowPlane: options.showShadowPlane,
    shadowIntensity: options.shadowIntensity,
    input,
    groundProjection: groundProjectionActive ? options.groundProjection : undefined,
    lightweight: options.lightweight ?? false,
    frameCount: options.frameCount ?? 0,
    debugLog: true
  })

  return logHdrShadowStatusOnce(scene, renderer, {
    sunFound: sunState.sunFound,
    sunCastShadow: sunState.sunCastShadow,
    input,
    showShadowPlane: options.showShadowPlane,
    groundProjectionActive
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

  const groundProjectionActive = resolveGroundProjectionActive(
    input.hdrGroundProjectionEnabled,
    scene
  )
  const effectiveVisible = effectiveShadowPlaneVisible(showShadowPlane, input)
  const targetY = shadowPlaneYForHdrMode(groundProjectionActive, groundProjection)
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
      groundProjectionActive,
      targetY
    )

    if (groundProjectionActive) {
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
        groundProjectionActive,
        groundProjection
      )
    } else if (groundProjectionActive && groundProjection) {
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

function findHdrSunDirectionalLights(scene: THREE.Scene): THREE.DirectionalLight[] {
  const marked: THREE.DirectionalLight[] = []
  let fallback: THREE.DirectionalLight | null = null

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.DirectionalLight)) return
    const name = (obj.name || '').toLowerCase()
    if (obj.userData.isSun || name.includes('sun')) {
      if (!obj.userData.isSun) {
        obj.userData.isSun = true
      }
      marked.push(obj)
    } else if (!fallback) {
      fallback = obj
    }
  })

  if (marked.length > 0) return marked
  if (fallback) {
    fallback.userData.isSun = true
    return [fallback]
  }
  return []
}

/** webexport-matched sun bias for flat ShadowMaterial ground catcher. */
export function applyHdrGroundSunShadowBias(light: THREE.DirectionalLight): void {
  if (!light.shadow) return
  light.shadow.bias = HDR_GROUND_SUN_SHADOW_BIAS
  light.shadow.normalBias = HDR_GROUND_SUN_SHADOW_NORMAL_BIAS
}

/** Force sun shadow maps + renderer shadowMap when HDR ground projection shadows are active. */
export function forceHdrSunShadowState(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer | null | undefined,
  shadowsEnabled: boolean,
  options?: { groundProjectionActive?: boolean }
): { sunFound: boolean; sunCastShadow: boolean } {
  let sunFound = false
  let sunCastShadow = false
  const groundProjectionActive = options?.groundProjectionActive ?? sceneHasGroundProjection(scene)

  if (renderer?.shadowMap && shadowsEnabled) {
    if (!renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true
    }
    renderer.shadowMap.autoUpdate = true
  }

  const sunLights = findHdrSunDirectionalLights(scene)
  for (const light of sunLights) {
    sunFound = true
    if (shadowsEnabled) {
      light.castShadow = true
      sunCastShadow = true
      if (light.shadow) {
        if (groundProjectionActive) {
          applyHdrGroundSunShadowBias(light)
        }
        light.shadow.needsUpdate = true
        light.shadow.camera?.updateProjectionMatrix()
      }
    } else {
      sunCastShadow = light.castShadow
    }
  }

  if (renderer?.shadowMap && shadowsEnabled) {
    renderer.shadowMap.needsUpdate = true
  }

  return { sunFound, sunCastShadow }
}
