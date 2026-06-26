export type WeatherQuality = 'low' | 'medium' | 'high' | 'ultra'

const IQ_RAYMARCH_BASE: Record<WeatherQuality, number> = {
  low: 48,
  medium: 56,
  high: 72,
  ultra: 88
}

/** CSM shadow map size per weather quality preset (Three.js power-of-two sizes only). */
export function getCsmShadowMapSizeForQuality(quality: WeatherQuality): number {
  return quality === 'low' ? 1024 : 2048
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
  if (cloudDensity <= 0.004) {
    return Math.min(base, 24)
  }
  if (quality === 'high' || quality === 'ultra') {
    return base
  }
  const densityScale = 0.72 + Math.min(1, cloudDensity) * 0.28
  return Math.max(40, Math.round(base * densityScale))
}

/** Cap effective pixel ratio on large displays to limit fill rate (e.g. 4K). */
export function getEffectivePixelRatio(
  devicePixelRatio: number,
  maxPixelRatio: number,
  canvasCssWidth: number
): number {
  const capped = Math.min(devicePixelRatio, maxPixelRatio)
  const maxRenderWidth = 3840
  if (canvasCssWidth > 0 && canvasCssWidth * capped > maxRenderWidth) {
    return Math.max(1, maxRenderWidth / canvasCssWidth)
  }
  return capped
}
