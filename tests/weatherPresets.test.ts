import { describe, expect, it } from 'vitest'
import {
  detectWeatherPreset,
  WEATHER_PRESET_DEFINITIONS
} from '../src/viewer/utils/weatherPresets'

describe('weatherPresets', () => {
  it('detects overcast preset values', () => {
    expect(detectWeatherPreset(WEATHER_PRESET_DEFINITIONS.overcast)).toBe('overcast')
  })

  it('returns custom when sliders diverge from any preset', () => {
    expect(
      detectWeatherPreset({
        ...WEATHER_PRESET_DEFINITIONS.overcast,
        fogDensity: 0.2
      })
    ).toBe('custom')
  })

  it('stormy preset includes cloud storminess for engine lighting', () => {
    expect(WEATHER_PRESET_DEFINITIONS.stormy.cloudStorminess).toBeGreaterThan(0)
    expect(WEATHER_PRESET_DEFINITIONS.stormy.fogColor).toBe('#8a9098')
  })
})
