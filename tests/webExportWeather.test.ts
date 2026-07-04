import { describe, expect, it } from 'vitest'
import {
  generateWebExportWeatherRuntimeJs,
  isWeatherExportActive,
  isWebExportStandaloneSkyActive,
  normalizeWebExportWeatherConfig,
  WEB_EXPORT_FOG_DENSITY_SCALE,
  WEB_EXPORT_MIN_CAMERA_FAR,
  WEB_EXPORT_SKY_SPHERE_RADIUS
} from '../src/utils/webExportWeatherRuntime'

describe('webExportWeatherRuntime', () => {
  it('detects inactive weather when all sliders are zero', () => {
    expect(isWeatherExportActive({})).toBe(false)
    expect(
      isWeatherExportActive({
        fogDensity: 0,
        rainIntensity: 0,
        snowIntensity: 0,
        cloudDensity: 0
      })
    ).toBe(false)
  })

  it('detects active weather from fog, rain, snow, or clouds', () => {
    expect(isWeatherExportActive({ fogDensity: 0.2 })).toBe(true)
    expect(isWeatherExportActive({ rainIntensity: 0.5 })).toBe(true)
    expect(isWeatherExportActive({ snowIntensity: 0.3 })).toBe(true)
    expect(isWeatherExportActive({ cloudDensity: 0.4 })).toBe(true)
  })

  it('detects active weather when standalone mode is enabled', () => {
    expect(
      isWeatherExportActive({
        enableStandaloneWeather: true,
        fogDensity: 0,
        rainIntensity: 0,
        snowIntensity: 0,
        cloudDensity: 0
      })
    ).toBe(true)
  })

  it('normalizes legacy weatherPreset field to preset', () => {
    const config = normalizeWebExportWeatherConfig({
      weatherPreset: 'stormy',
      enableStandaloneWeather: true,
      fogDensity: 0.25
    })
    expect(config.preset).toBe('stormy')
    expect(config.enableStandaloneWeather).toBe(true)
    expect(config.fogDensity).toBe(0.25)
    expect(config.timeOfDay).toBe(12)
  })

  it('detects standalone sky mode (matches editor DynamicSky path)', () => {
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: true, dynamicSkyEnabled: true },
        { groundProjectionEnabled: false }
      )
    ).toBe(true)
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: true, dynamicSkyEnabled: true },
        { groundProjectionEnabled: true }
      )
    ).toBe(false)
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: false, fogDensity: 0.5 },
        {}
      )
    ).toBe(false)
  })

  it('embeds runtime JS with fog scale and init/update functions', () => {
    const js = generateWebExportWeatherRuntimeJs()
    expect(js).toContain(String(WEB_EXPORT_FOG_DENSITY_SCALE))
    expect(js).toContain(String(WEB_EXPORT_SKY_SPHERE_RADIUS))
    expect(js).toContain(String(WEB_EXPORT_MIN_CAMERA_FAR))
    expect(js).toContain('function initializeWebExportWeather')
    expect(js).toContain('function updateWebExportWeather')
    expect(js).toContain('function webExportIsStandaloneSkyActive')
    expect(js).toContain('enableStandaloneWeather')
    expect(js).toContain('new Sky()')
    expect(js).toContain('Weather initialized ✓')
  })
})
