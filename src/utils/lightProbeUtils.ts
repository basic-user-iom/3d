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
