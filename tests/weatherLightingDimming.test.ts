import { describe, expect, it } from 'vitest'

/**
 * Documents expected weather-dimming multipliers applied in ViewerCanvas weather effect.
 * Standalone/standard sun branches must preserve these (not reset intensity to 1.0).
 */
function weatherDimmingForPreset(
  preset: string,
  fogDensity: number,
  cloudDensity: number,
  rainIntensity: number,
  cloudStorminess: number
): number {
  let weatherDimming = 1.0
  if (preset === 'overcast') {
    weatherDimming = 0.25 - fogDensity * 0.08
  } else if (preset === 'foggy') {
    weatherDimming = 0.25 - fogDensity * 0.1
  } else if (preset === 'stormy') {
    weatherDimming = 0.15 - cloudStorminess * 0.03
  } else {
    weatherDimming =
      1.0 - cloudDensity * 0.5 - rainIntensity * 0.3 - cloudStorminess * 0.3
  }
  return Math.max(0.1, weatherDimming)
}

describe('weather lighting dimming', () => {
  it('stormy preset dims sun below clear', () => {
    const stormy = weatherDimmingForPreset('stormy', 0.25, 0.9, 0.75, 0.65)
    const clear = weatherDimmingForPreset('clear', 0, 0, 0, 0)
    expect(stormy).toBeLessThan(clear)
    expect(stormy).toBeGreaterThanOrEqual(0.1)
  })

  it('overcast preset respects fog density', () => {
    const lightFog = weatherDimmingForPreset('overcast', 0.15, 0.75, 0, 0.2)
    const heavyFog = weatherDimmingForPreset('overcast', 0.55, 0.75, 0, 0.2)
    expect(heavyFog).toBeLessThan(lightFog)
  })

  it('never drops below 10% sun intensity floor', () => {
    const dim = weatherDimmingForPreset('stormy', 1, 1, 1, 1)
    expect(dim).toBeGreaterThanOrEqual(0.1)
  })
})
