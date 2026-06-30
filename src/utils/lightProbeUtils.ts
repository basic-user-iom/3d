import * as THREE from 'three'

/**
 * Spherical-harmonics helpers for HDR-derived light probes.
 * Three.js supports only one scene-level LightProbe; interior zones use cavity
 * dimming + optional RectAreaLight fill instead of per-zone probe blending.
 */

/** Scale applied to exterior probe SH to approximate sheltered interior irradiance */
export const INTERIOR_PROBE_SH_SCALE = 0.22

/** Probe intensity relative to HDR slider when replacing flat ambient fill */
export const EXTERIOR_PROBE_INTENSITY_SCALE = 0.4

/** Additional ambient reduction when a directional SH probe is active (HDR on) */
export const AMBIENT_MULTIPLIER_WITH_PROBE_SHADOWS = 0.45
export const AMBIENT_MULTIPLIER_WITH_PROBE_NO_SHADOWS = 0.25

/** HDR ambient floor — lower when sun shadows are on to preserve contrast */
export const HDR_AMBIENT_FLOOR_WITH_SHADOWS = 0.12
export const HDR_AMBIENT_FLOOR_NO_SHADOWS = 0.35

/** Flat ambient reduction when scene.environment (HDR IBL) is active */
export const HDR_AMBIENT_REDUCTION_WITH_SHADOWS = 0.65
export const HDR_AMBIENT_REDUCTION_NO_SHADOWS = 0.4

/** Scales material envMapIntensity when HDR + shadows (IBL diffuse fills shadow term) */
export const HDR_ENV_MAP_INTENSITY_SHADOW_MUL = 0.55

/** Probe intensity scale when shadows are enabled (less omnidirectional fill) */
export const PROBE_INTENSITY_SCALE_WITH_SHADOWS = 0.55

/** Low-res cube used for probe extraction — matches Sponza bake cubemapSize: 32 */
export const PROBE_CUBEMAP_SIZE = 32

export function scaleSphericalHarmonics(
  source: THREE.SphericalHarmonics3,
  factor: number
): THREE.SphericalHarmonics3 {
  const scaled = new THREE.SphericalHarmonics3()
  for (let i = 0; i < 9; i++) {
    scaled.coefficients[i].copy(source.coefficients[i]).multiplyScalar(factor)
  }
  return scaled
}

export function createScaledLightProbe(
  source: THREE.LightProbe,
  intensityScale: number,
  shScale = 1
): THREE.LightProbe {
  const sh = scaleSphericalHarmonics(source.sh, shScale)
  const probe = new THREE.LightProbe(sh, source.intensity * intensityScale)
  return probe
}

export function getAmbientMultiplierWithProbe(
  hasProbe: boolean,
  shadowsEnabled: boolean
): number {
  if (!hasProbe) return 1
  return shadowsEnabled
    ? AMBIENT_MULTIPLIER_WITH_PROBE_SHADOWS
    : AMBIENT_MULTIPLIER_WITH_PROBE_NO_SHADOWS
}

export function getProbeIntensityScaleForShadows(shadowsEnabled: boolean): number {
  return shadowsEnabled ? PROBE_INTENSITY_SCALE_WITH_SHADOWS : 1
}

/**
 * Unified HDR ambient fill — used by weather loop and ambient slider effect.
 * HDR never disables shadow maps; it reduces flat fill so sun shadows stay visible.
 */
export function computeHdrAmbientIntensity(options: {
  sliderAmbient: number
  shadowsEnabled: boolean
  probeActive: boolean
  hdrSunBoost?: number
}): number {
  const probeMul = getAmbientMultiplierWithProbe(options.probeActive, options.shadowsEnabled)
  const reduction = options.shadowsEnabled
    ? HDR_AMBIENT_REDUCTION_WITH_SHADOWS
    : HDR_AMBIENT_REDUCTION_NO_SHADOWS
  const floor = options.shadowsEnabled
    ? HDR_AMBIENT_FLOOR_WITH_SHADOWS
    : HDR_AMBIENT_FLOOR_NO_SHADOWS
  const sunBoost = options.hdrSunBoost ?? 1
  return Math.max(
    options.sliderAmbient * reduction * sunBoost * 0.85 * probeMul,
    floor * probeMul
  )
}

/** Target envMapIntensity for PBR materials when HDR IBL would wash out sun shadows. */
export function getEnvMapIntensityForHdrShadows(
  hdrIntensity: number,
  shadowsEnabled: boolean
): number {
  if (!shadowsEnabled) return hdrIntensity
  return hdrIntensity * HDR_ENV_MAP_INTENSITY_SHADOW_MUL
}

/**
 * Lower envMapIntensity on scene.environment-driven materials when shadows are on.
 * Skips user-controlled and interior-cavity materials.
 */
export function applyHdrShadowContrastToMaterials(
  scene: THREE.Scene,
  hdrIntensity: number,
  shadowsEnabled: boolean
): number {
  const target = getEnvMapIntensityForHdrShadows(hdrIntensity, shadowsEnabled)
  let updated = 0

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object.userData?.isGroundedSkybox || object.userData?.isShadowPlane) return

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const mat of materials) {
      if (
        !(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)
      ) {
        continue
      }
      if (mat.userData?.userControlledEnvMapIntensity) continue
      if (mat.userData?.cavityBaseEnvIntensity !== undefined) continue

      const current = mat.envMapIntensity ?? 1
      if (Math.abs(current - target) > 0.02) {
        mat.envMapIntensity = target
        updated++
      }
    }
  })

  return updated
}
