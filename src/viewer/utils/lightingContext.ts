/**
 * Authoritative lighting / shadow mode resolution.
 * Use this instead of ad-hoc boolean checks scattered across ViewerCanvas and panels.
 */

import type { WeatherQuality } from './weatherGpuUtils'
import { getCsmShadowMapSizeForQuality } from './weatherGpuUtils'

/** Active raster lighting branch (path tracer replaces the main loop). */
export type LightingMode = 'standard' | 'standalone-weather' | 'streets-gl' | 'path-tracer'

/** Which subsystem owns shadow depth maps for the current frame. */
export type ShadowAuthority = 'standard' | 'csm' | 'streets-gl' | 'path-tracer' | 'none'

export interface LightingContextInput {
  enableStandaloneWeather: boolean
  streetsGLIframeOverlay: boolean
  pathTracerActive: boolean
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  /** True when viewerRef.csmShadowSystem?.isEnabled() */
  csmEnabled?: boolean
  shadowsEnabled?: boolean
  /** Config flags from directionalLights store */
  sunLightCastShadowConfig?: boolean
  nonSunShadowCastingCount?: number
}

export interface LightingConflict {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export function resolveLightingMode(input: LightingContextInput): LightingMode {
  if (input.pathTracerActive) return 'path-tracer'
  if (input.streetsGLIframeOverlay) return 'streets-gl'
  if (input.enableStandaloneWeather && !input.streetsGLIframeOverlay) return 'standalone-weather'
  return 'standard'
}

export function getShadowAuthority(mode: LightingMode, csmEnabled = false): ShadowAuthority {
  switch (mode) {
    case 'path-tracer':
      return 'path-tracer'
    case 'streets-gl':
      return 'streets-gl'
    case 'standalone-weather':
      return csmEnabled ? 'csm' : 'none'
    case 'standard':
    default:
      return 'standard'
  }
}

/** Sun directional light must not cast legacy shadow maps when CSM is active. */
export function shouldSunUseLegacyShadowMaps(
  mode: LightingMode,
  csmEnabled: boolean
): boolean {
  if (mode === 'standalone-weather' && csmEnabled) return false
  if (mode === 'streets-gl') return false
  if (mode === 'path-tracer') return false
  return true
}

/** Manual LightingPanel shadow map size is ignored — weather quality tiers own CSM resolution. */
export function shouldUseWeatherShadowMapTiers(mode: LightingMode, csmEnabled: boolean): boolean {
  return mode === 'standalone-weather' && csmEnabled
}

export function getAuthoritativeShadowMapSize(
  mode: LightingMode,
  weatherQuality: WeatherQuality,
  storeShadowMapSize: number,
  csmEnabled: boolean
): number {
  if (shouldUseWeatherShadowMapTiers(mode, csmEnabled)) {
    return getCsmShadowMapSizeForQuality(weatherQuality)
  }
  return storeShadowMapSize
}

/**
 * Resolve whether a directional light should cast Three.js shadow maps this frame.
 */
export function resolveDirectionalCastShadow(options: {
  mode: LightingMode
  csmEnabled: boolean
  isSun: boolean
  enabled: boolean
  castShadowConfig: boolean
  shadowsEnabled: boolean
}): boolean {
  if (!options.enabled) return false

  if (options.isSun) {
    return (
      shouldSunUseLegacyShadowMaps(options.mode, options.csmEnabled) &&
      options.shadowsEnabled &&
      options.castShadowConfig
    )
  }

  // Non-sun lights: respect per-light castShadow when CSM is not stealing the sun pass
  if (options.mode === 'streets-gl' || options.mode === 'path-tracer') {
    return false
  }

  return options.castShadowConfig && options.shadowsEnabled
}

/** True when sun/CSM already provides contact shadows and point-light cubes should stay subtle. */
export function shouldDiminishPointLightShadows(input: {
  hdrEnabled: boolean
  shadowsEnabled: boolean
  sunLightCastShadowConfig: boolean
  mode: LightingMode
  csmEnabled: boolean
}): boolean {
  if (!input.hdrEnabled || !input.shadowsEnabled || !input.sunLightCastShadowConfig) {
    return false
  }
  if (input.mode === 'streets-gl' || input.mode === 'path-tracer') return false
  if (input.mode === 'standalone-weather') return input.csmEnabled
  return input.mode === 'standard'
}

export function resolvePointLightCastShadow(options: {
  mode: LightingMode
  enabled: boolean
  castShadowConfig: boolean
  shadowsEnabled: boolean
  /** When HDR + sun shadows are active, point cube-map shadows are suppressed. */
  diminishForHdrSun?: boolean
}): boolean {
  if (!options.enabled || !options.shadowsEnabled) return false
  if (options.mode === 'streets-gl' || options.mode === 'path-tracer') return false
  // Omnidirectional cube-map shadows on flat HDR ground read as a hard circle and hide sun silhouettes.
  if (options.diminishForHdrSun) return false
  return options.castShadowConfig
}

export function detectLightingConflicts(input: LightingContextInput): LightingConflict[] {
  const mode = resolveLightingMode(input)
  const authority = getShadowAuthority(mode, input.csmEnabled)
  const conflicts: LightingConflict[] = []

  if (input.enableStandaloneWeather && input.streetsGLIframeOverlay) {
    conflicts.push({
      severity: 'error',
      code: 'WEATHER_STREETS_GL_BOTH',
      message: 'Standalone weather and Streets GL overlay are mutually exclusive'
    })
  }

  if (input.hdrGroundProjectionEnabled && input.enableStandaloneWeather) {
    conflicts.push({
      severity: 'warning',
      code: 'HDR_GROUND_WEATHER',
      message: 'HDR ground projection conflicts with standalone weather — auto-disabled when weather turns on'
    })
  }

  if (authority === 'csm' && input.sunLightCastShadowConfig) {
    conflicts.push({
      severity: 'warning',
      code: 'SUN_LEGACY_SHADOW_WITH_CSM',
      message: 'Sun legacy shadow maps are suppressed while CSM is active'
    })
  }

  if (mode === 'standard' && input.csmEnabled) {
    conflicts.push({
      severity: 'warning',
      code: 'CSM_LEAK_STANDARD_MODE',
      message: 'CSM system is enabled while lighting mode is standard — destroy CSM on mode exit'
    })
  }

  if (input.hdrEnabled && mode === 'standalone-weather') {
    conflicts.push({
      severity: 'info',
      code: 'HDR_WEATHER_AMBIENT',
      message: 'HDR IBL + weather sun — ambient is auto-reduced to avoid washing interiors'
    })
  }

  if (input.hdrEnabled && input.shadowsEnabled) {
    conflicts.push({
      severity: 'info',
      code: 'HDR_SHADOW_CONTRAST',
      message:
        'HDR on with shadows — sun/CSM shadow maps stay active; IBL ambient, probe, and envMapIntensity are reduced for contrast'
    })
  }

  if (
    input.hdrEnabled &&
    input.shadowsEnabled &&
    (input.nonSunShadowCastingCount ?? 0) > 0 &&
    input.sunLightCastShadowConfig
  ) {
    conflicts.push({
      severity: 'info',
      code: 'HDR_POINT_SHADOW_DIMINISHED',
      message:
        'HDR + sun shadows — point-light cube shadows are auto-disabled so sun contact shadows stay visible on the ground'
    })
  }

  if ((input.nonSunShadowCastingCount ?? 0) > 0 && authority === 'csm') {
    conflicts.push({
      severity: 'info',
      code: 'EXTRA_SHADOWS_WITH_CSM',
      message: 'Additional shadow-casting lights may stack with CSM sun shadows'
    })
  }

  return conflicts
}

/** Streets GL + standalone weather cannot both be on. Returns fields to apply to the store. */
export function resolveStreetsGLWeatherExclusion(
  enablingStreetsGL: boolean,
  enablingStandaloneWeather: boolean,
  current: { streetsGLIframeOverlay: boolean; enableStandaloneWeather: boolean }
): Partial<{ streetsGLIframeOverlay: boolean; enableStandaloneWeather: boolean }> | null {
  if (enablingStreetsGL && !current.streetsGLIframeOverlay && current.enableStandaloneWeather) {
    return { streetsGLIframeOverlay: true, enableStandaloneWeather: false }
  }
  if (enablingStandaloneWeather && !current.enableStandaloneWeather && current.streetsGLIframeOverlay) {
    return { enableStandaloneWeather: true, streetsGLIframeOverlay: false }
  }
  return null
}
