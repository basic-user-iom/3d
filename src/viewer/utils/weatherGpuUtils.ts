export type WeatherQuality = 'low' | 'medium' | 'high' | 'ultra'

const IQ_RAYMARCH_BASE: Record<WeatherQuality, number> = {
  low: 40,
  medium: 56,
  high: 80,
  ultra: 96
}

const IQ_RAYMARCH_MIN: Record<WeatherQuality, number> = {
  low: 32,
  medium: 48,
  high: 64,
  ultra: 64
}

/** CSM shadow map size per weather quality preset (Three.js power-of-two sizes only). */
export function getCsmShadowMapSizeForQuality(quality: WeatherQuality): number {
  if (quality === 'low') return 512
  if (quality === 'medium') return 1024
  return 2048
}

/** CSM cascade count per weather quality preset. */
export function getCsmCascadeCountForQuality(quality: WeatherQuality): number {
  if (quality === 'low') return 1
  if (quality === 'medium') return 2
  return 3
}

/** Max pixel ratio cap per weather quality tier (applied on top of store maxPixelRatio). */
export function getWeatherMaxPixelRatio(quality: WeatherQuality, storeMax: number): number {
  if (quality === 'low') return Math.min(storeMax, 1.5)
  if (quality === 'medium') return Math.min(storeMax, 2.0)
  return storeMax
}

/** Prefer integrated / low-power GPU when weather quality is Low. */
export function prefersLowPowerGpu(quality: WeatherQuality): boolean {
  return quality === 'low'
}

/**
 * When weather runs on Low and FPS is unlimited (0), cap at 60 to reduce sustained GPU load.
 * User-configured caps (>0) and VSync (-1) are left unchanged.
 */
export function getEffectiveMaxFps(
  quality: WeatherQuality,
  configuredMaxFps: number,
  standaloneWeatherActive: boolean
): number {
  if (!standaloneWeatherActive || quality !== 'low') return configuredMaxFps
  if (configuredMaxFps === 0) return 60
  return configuredMaxFps
}

/**
 * Adaptive iq cloud raymarch steps from quality preset and coverage.
 * High/Ultra presets keep full step counts for visual fidelity.
 */
export function getAdaptiveIqRaymarchSteps(
  quality: WeatherQuality,
  cloudDensity: number
): number {
  const base = IQ_RAYMARCH_BASE[quality]
  const minSteps = IQ_RAYMARCH_MIN[quality]
  if (cloudDensity <= 0.004) {
    return Math.min(base, 24)
  }
  if (quality === 'high' || quality === 'ultra') {
    return Math.max(minSteps, base)
  }
  const densityScale = 0.72 + Math.min(1, cloudDensity) * 0.28
  return Math.max(minSteps, Math.round(base * densityScale))
}

/** Cap effective pixel ratio on large displays to limit fill rate (e.g. 4K). */
export function getEffectivePixelRatio(
  devicePixelRatio: number,
  maxPixelRatio: number,
  canvasCssWidth: number,
  weatherQuality?: WeatherQuality
): number {
  const tierCap = weatherQuality
    ? getWeatherMaxPixelRatio(weatherQuality, maxPixelRatio)
    : maxPixelRatio
  const capped = Math.min(devicePixelRatio, tierCap)
  const maxRenderWidth = 3840
  if (canvasCssWidth > 0 && canvasCssWidth * capped > maxRenderWidth) {
    return Math.max(1, maxRenderWidth / canvasCssWidth)
  }
  return capped
}
