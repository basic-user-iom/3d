import * as THREE from 'three'

/**
 * Shadow settings aligned with three.js `webgl_lights_physical` and directional
 * shadow best practices.
 *
 * Reference: https://threejs.org/examples/#webgl_lights_physical
 * The example uses PointLight shadows with default bias; directional contact
 * shadows follow the same PCFSoft + tight ortho frustum approach used in
 * `hdrShadowDemo.ts` and Three.js shadow tutorials.
 */

/** Recommended shadow map size for crisp contact shadows at product/car scale */
export const PHYSICAL_SHADOW_MAP_SIZE = 2048

/** Directional shadow depth bias (PCFSoftShadowMap) */
export const PHYSICAL_DIRECTIONAL_SHADOW_BIAS = -0.0001

/** Normal bias — lower at product scale keeps contact shadows anchored */
export const PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.02

/** Subtle PCF softness with renderer.shadowMap.type = PCFSoftShadowMap */
export const PHYSICAL_DIRECTIONAL_SHADOW_RADIUS = 1

/**
 * Point/spot cube-map shadows — three.js `webgl_lights_physical` uses defaults (sharp).
 * Do not reuse directional PCF radius; it blurs omnidirectional shadows into circular blobs.
 */
export const PHYSICAL_OMNI_SHADOW_BIAS = 0
export const PHYSICAL_OMNI_SHADOW_NORMAL_BIAS = 0
export const PHYSICAL_OMNI_SHADOW_RADIUS = 0

/** Initial far plane before scene bounds are known (decoupled from light attenuation distance). */
export const PHYSICAL_OMNI_SHADOW_FAR_INITIAL = 5000

/** Default spot cone half-angle when converting a point light for contact shadows (~45°). */
export const DEFAULT_SPOT_SHADOW_CONVERSION_ANGLE = Math.PI / 4

/**
 * CSM shader bias constants (scaled by cascade ortho extent in StreetsGLCSM).
 * Slightly tighter than legacy Streets GL values for sharper contact shadows.
 */
export const CSM_SHADER_BIAS_PHYSICAL = -0.0025
export const CSM_SHADER_NORMAL_BIAS_PHYSICAL = 0.0015

/** Depth-pass bias on cascade DirectionalLights during shadow map render */
export const CSM_LIGHT_SHADOW_BIAS_PHYSICAL = -0.0001
export const CSM_LIGHT_SHADOW_NORMAL_BIAS_PHYSICAL = 0.005

/** CSM fragment shader PCF radius — 0 = single-texel sharp shadows */
export const PHYSICAL_CSM_SHADOW_RADIUS = 0

/** Scene bounding-box extent (world units) treated as product/car scale */
export const TIGHT_FRUSTUM_MAX_DIM = 30

export interface ShadowFrustumParams {
  orthoHalfExtent: number
  near: number
  far: number
  offsetDistance: number
}

/**
 * Compute orthographic shadow camera frustum for a directional light.
 * Tighter frusta at car/product scale improve texel density (crisper shadows).
 */
export function computeTightShadowFrustum(
  maxDim: number,
  minDim: number,
  depthSize: number,
  useVisibleBounds: boolean
): ShadowFrustumParams {
  if (maxDim <= TIGHT_FRUSTUM_MAX_DIM) {
    const padding = Math.max(maxDim * 0.12, 0.5)
    const orthoHalfExtent = Math.max(maxDim * 1.15 + padding, minDim * 1.5, 3)
    const near = minDim < 0.5 ? 0.0005 : 0.001
    const far = Math.max(depthSize * 2 + maxDim * 2, maxDim * 4, 50)
    const offsetDistance = Math.max(maxDim * 1.5, 10)
    return { orthoHalfExtent, near, far, offsetDistance }
  }

  if (maxDim <= 100) {
    const baseMultiplier = useVisibleBounds ? 1.6 : 2.2
    const sizeFactor = maxDim > 50 ? Math.max(0.55, 1.0 - (maxDim - 50) / 200) : 1.0
    const boundsMultiplier = baseMultiplier * sizeFactor
    const shadowSize = Math.max(maxDim * boundsMultiplier, minDim * 1.5, 20)
    const padding = Math.min(Math.max(maxDim * 0.1, 5), 30)
    const orthoHalfExtent = Math.min(shadowSize + padding, 800)
    const near = minDim < 1.0 ? 0.0005 : 0.001
    const shadowProjectionMargin = maxDim * 1.5
    const far = useVisibleBounds
      ? Math.max(depthSize * 3 + shadowProjectionMargin, maxDim * 5, 500)
      : Math.max(depthSize * 4 + shadowProjectionMargin, maxDim * 8, 1500)
    const offsetDistance = Math.max(maxDim * 2, 100)
    return { orthoHalfExtent, near, far, offsetDistance }
  }

  const baseMultiplier = useVisibleBounds ? 2.5 : 3.5
  const sizeFactor = maxDim > 50 ? Math.max(0.6, 1.0 - (maxDim - 50) / 200) : 1.0
  const boundsMultiplier = baseMultiplier * sizeFactor
  const shadowSize = Math.max(maxDim * boundsMultiplier, minDim * 2.0, 50)
  const padding = Math.min(Math.max(maxDim * 0.15, 15), 100)
  let orthoHalfExtent = shadowSize + padding
  const adaptiveMaxSize = maxDim > 1000 ? Math.min(maxDim * 2.0, 15000) : 3000
  orthoHalfExtent = Math.min(orthoHalfExtent, Math.max(adaptiveMaxSize, 3000))
  const near = 0.001
  const shadowProjectionMargin = maxDim * 2
  const far = useVisibleBounds
    ? Math.max(depthSize * 3 + shadowProjectionMargin, maxDim * 6, 2000)
    : Math.max(depthSize * 5 + shadowProjectionMargin, maxDim * 10, 5000)
  const offsetDistance = Math.max(maxDim * 2, 500)
  return { orthoHalfExtent, near, far, offsetDistance }
}

/** Adaptive bias tuned from physical reference values and scene scale */
export function applyAdaptiveDirectionalShadowBias(
  light: THREE.DirectionalLight,
  maxDim: number,
  minDim: number
): void {
  if (!light.shadow) return

  const shadowMapSize = light.shadow.mapSize.width
  const resolutionScale = Math.max(0.5, PHYSICAL_SHADOW_MAP_SIZE / shadowMapSize)
  const sceneScaleFactor = Math.min(Math.max(maxDim / 50, 0.25), 1.5)
  const aspectRatio = maxDim > 0 ? minDim / maxDim : 1

  const baseBias =
    maxDim <= TIGHT_FRUSTUM_MAX_DIM
      ? PHYSICAL_DIRECTIONAL_SHADOW_BIAS
      : PHYSICAL_DIRECTIONAL_SHADOW_BIAS * 2

  const adaptiveBias = baseBias * resolutionScale * sceneScaleFactor * (0.5 + aspectRatio * 0.5)
  light.shadow.bias = THREE.MathUtils.clamp(adaptiveBias, -0.0005, -0.00002)

  const normalBiasBase =
    maxDim <= TIGHT_FRUSTUM_MAX_DIM ? 0.008 : minDim < 1.0 ? 0.02 : 0.012

  const calculatedNormalBias = normalBiasBase * Math.max(aspectRatio, 0.15) * resolutionScale
  light.shadow.normalBias = THREE.MathUtils.clamp(
    Math.max(calculatedNormalBias, maxDim <= TIGHT_FRUSTUM_MAX_DIM ? 0.004 : 0.008),
    0.004,
    0.05
  )
}

export function applyPhysicalDirectionalShadowDefaults(light: THREE.DirectionalLight): void {
  if (!light.shadow) return
  light.shadow.bias = PHYSICAL_DIRECTIONAL_SHADOW_BIAS
  light.shadow.normalBias = PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS
  light.shadow.radius = PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
}

const BOX_CORNER_SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1]
]

/** Default ground plane Y for HDR shadow catcher and racetrack scenes */
export const SHADOW_GROUND_PLANE_Y = 0

/**
 * Shadow range for point/spot lights: farthest scene corner from the light plus margin.
 * Must not use light.distance (attenuation) — that produces a spherical cutoff that reads
 * as a hard circle on flat ground receivers.
 */
export function computeOmnidirectionalShadowFar(
  lightPosition: THREE.Vector3,
  sceneBox: THREE.Box3,
  margin = 0.25,
  groundY = SHADOW_GROUND_PLANE_Y
): number {
  if (sceneBox.isEmpty()) return PHYSICAL_OMNI_SHADOW_FAR_INITIAL

  const center = sceneBox.getCenter(new THREE.Vector3())
  const size = sceneBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const halfSize = size.clone().multiplyScalar(0.5)

  let maxDist = lightPosition.distanceTo(center)
  for (const [sx, sy, sz] of BOX_CORNER_SIGNS) {
    const corner = center.clone().add(
      new THREE.Vector3(sx * halfSize.x, sy * halfSize.y, sz * halfSize.z)
    )
    maxDist = Math.max(maxDist, lightPosition.distanceTo(corner))
  }

  const cornerFar = Math.max(maxDist * (1 + margin), maxDim * 2, 50)

  // Spherical shadow maps clip at camera.far — if far is shorter than the light-to-ground
  // distance, flat receivers show a perfect circular cutoff (classic point-light artifact).
  const heightAboveGround = Math.max(lightPosition.y - groundY, 0.01)
  let maxHorizReach = 0
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const cornerX = center.x + sx * halfSize.x
      const cornerZ = center.z + sz * halfSize.z
      maxHorizReach = Math.max(
        maxHorizReach,
        Math.hypot(cornerX - lightPosition.x, cornerZ - lightPosition.z)
      )
    }
  }
  const groundReachFar = Math.hypot(heightAboveGround, maxHorizReach) * (1 + margin)

  return Math.max(cornerFar, groundReachFar)
}

/**
 * Point-light shadow far — always reach the ground plane.
 * Tightening far below ground reach creates a visible circular cutoff on flat receivers.
 */
export function computePointLightShadowFar(
  lightPosition: THREE.Vector3,
  sceneBox: THREE.Box3,
  margin = 0.25,
  groundY = SHADOW_GROUND_PLANE_Y
): number {
  return computeOmnidirectionalShadowFar(lightPosition, sceneBox, margin, groundY)
}

/** Scale cube-map shadow strength so fill lights do not dominate sun shadows. */
export function computePointLightShadowIntensity(
  lightIntensity: number,
  diminishForHdrSun: boolean
): number {
  if (!diminishForHdrSun) return 1
  return THREE.MathUtils.clamp(lightIntensity / 10, 0.04, 0.15)
}

export function applyPointLightShadowIntensity(
  light: THREE.PointLight,
  lightIntensity: number,
  diminishForHdrSun: boolean
): void {
  if (!light.shadow) return
  light.shadow.intensity = computePointLightShadowIntensity(lightIntensity, diminishForHdrSun)
}

export function applyPhysicalOmnidirectionalShadowDefaults(light: THREE.PointLight): void {
  if (!light.shadow) return
  light.shadow.bias = PHYSICAL_OMNI_SHADOW_BIAS
  light.shadow.normalBias = PHYSICAL_OMNI_SHADOW_NORMAL_BIAS
  light.shadow.radius = PHYSICAL_OMNI_SHADOW_RADIUS
}

/** Spot shadows benefit from slight directional-style bias for ground contact silhouettes. */
export function applyPhysicalSpotShadowDefaults(light: THREE.SpotLight): void {
  if (!light.shadow) return
  light.shadow.bias = PHYSICAL_DIRECTIONAL_SHADOW_BIAS
  light.shadow.normalBias = 0.005
  light.shadow.radius = 0
  light.shadow.focus = 1
}

/**
 * Spot shadow far: reach past the scene bbox along the light→target axis.
 * Unlike omnidirectional far, this stays tight so the depth map resolves the model.
 */
export function computeSpotLightShadowFar(
  lightPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  sceneBox: THREE.Box3,
  margin = 0.15
): number {
  if (sceneBox.isEmpty()) return PHYSICAL_OMNI_SHADOW_FAR_INITIAL

  const center = sceneBox.getCenter(new THREE.Vector3())
  const size = sceneBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const halfDiag = size.length() * 0.5
  const lightToTarget = Math.max(lightPosition.distanceTo(targetPosition), 0.01)

  let maxDist = lightPosition.distanceTo(center) + halfDiag
  for (const [sx, sy, sz] of BOX_CORNER_SIGNS) {
    const corner = center.clone().add(
      new THREE.Vector3(sx * size.x * 0.5, sy * size.y * 0.5, sz * size.z * 0.5)
    )
    maxDist = Math.max(maxDist, lightPosition.distanceTo(corner))
  }

  return Math.max(
    maxDist * (1 + margin),
    lightToTarget + maxDim * 0.75,
    lightToTarget + 2,
    5
  )
}

export function spotShadowCameraFovDegrees(angleRadians: number, focus = 1): number {
  return THREE.MathUtils.radToDeg(2 * angleRadians * focus)
}

export interface PhysicalLightingPresetValues {
  shadowMapSize: number
  useAdaptiveShadowSettings: boolean
  shadowBiasOverride: number
  shadowNormalBiasOverride: number
}

/** Store values for the optional “Physical lighting” preset in the Lighting panel */
export function getPhysicalLightingPresetValues(): PhysicalLightingPresetValues {
  return {
    shadowMapSize: PHYSICAL_SHADOW_MAP_SIZE,
    useAdaptiveShadowSettings: true,
    shadowBiasOverride: PHYSICAL_DIRECTIONAL_SHADOW_BIAS,
    shadowNormalBiasOverride: PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS
  }
}
