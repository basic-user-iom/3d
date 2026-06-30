import { describe, it, expect } from 'vitest'
import {
  detectLightingConflicts,
  getShadowAuthority,
  resolveDirectionalCastShadow,
  resolveLightingMode,
  resolveStreetsGLWeatherExclusion,
  shouldSunUseLegacyShadowMaps,
  shouldUseWeatherShadowMapTiers
} from '../src/viewer/utils/lightingContext'

describe('lightingContext', () => {
  const base = {
    enableStandaloneWeather: false,
    streetsGLIframeOverlay: false,
    pathTracerActive: false,
    hdrEnabled: false,
    hdrGroundProjectionEnabled: false,
    csmEnabled: false,
    shadowsEnabled: true
  }

  describe('resolveLightingMode', () => {
    it('path tracer takes priority', () => {
      expect(
        resolveLightingMode({ ...base, pathTracerActive: true, enableStandaloneWeather: true })
      ).toBe('path-tracer')
    })

    it('streets GL over standalone weather', () => {
      expect(
        resolveLightingMode({
          ...base,
          streetsGLIframeOverlay: true,
          enableStandaloneWeather: true
        })
      ).toBe('streets-gl')
    })

    it('standalone weather when enabled without streets GL', () => {
      expect(resolveLightingMode({ ...base, enableStandaloneWeather: true })).toBe(
        'standalone-weather'
      )
    })

    it('standard is default', () => {
      expect(resolveLightingMode(base)).toBe('standard')
    })
  })

  describe('shadow authority', () => {
    it('CSM owns shadows in standalone weather', () => {
      expect(getShadowAuthority('standalone-weather', true)).toBe('csm')
    })

    it('streets GL owns shadows in overlay mode', () => {
      expect(getShadowAuthority('streets-gl', false)).toBe('streets-gl')
    })
  })

  describe('legacy sun shadow guard', () => {
    it('suppresses sun legacy maps when CSM active', () => {
      expect(shouldSunUseLegacyShadowMaps('standalone-weather', true)).toBe(false)
    })

    it('allows sun legacy maps in standard mode', () => {
      expect(shouldSunUseLegacyShadowMaps('standard', false)).toBe(true)
    })
  })

  describe('resolveDirectionalCastShadow', () => {
    it('sun does not cast when CSM active', () => {
      expect(
        resolveDirectionalCastShadow({
          mode: 'standalone-weather',
          csmEnabled: true,
          isSun: true,
          enabled: true,
          castShadowConfig: true,
          shadowsEnabled: true
        })
      ).toBe(false)
    })

    it('non-sun can still cast in standalone weather', () => {
      expect(
        resolveDirectionalCastShadow({
          mode: 'standalone-weather',
          csmEnabled: true,
          isSun: false,
          enabled: true,
          castShadowConfig: true,
          shadowsEnabled: true
        })
      ).toBe(true)
    })

    it('no shadows in streets GL mode', () => {
      expect(
        resolveDirectionalCastShadow({
          mode: 'streets-gl',
          csmEnabled: false,
          isSun: true,
          enabled: true,
          castShadowConfig: true,
          shadowsEnabled: true
        })
      ).toBe(false)
    })

    it('HDR enabled does not suppress sun legacy shadow maps in standard mode', () => {
      expect(
        resolveDirectionalCastShadow({
          mode: 'standard',
          csmEnabled: false,
          isSun: true,
          enabled: true,
          castShadowConfig: true,
          shadowsEnabled: true
        })
      ).toBe(true)
    })

    it('HDR + weather uses CSM — sun legacy maps still suppressed', () => {
      expect(
        resolveDirectionalCastShadow({
          mode: 'standalone-weather',
          csmEnabled: true,
          isSun: true,
          enabled: true,
          castShadowConfig: true,
          shadowsEnabled: true
        })
      ).toBe(false)
    })
  })

  describe('weather shadow map tiers', () => {
    it('uses weather tiers when CSM active in standalone mode', () => {
      expect(shouldUseWeatherShadowMapTiers('standalone-weather', true)).toBe(true)
    })

    it('does not use weather tiers in standard mode', () => {
      expect(shouldUseWeatherShadowMapTiers('standard', true)).toBe(false)
    })
  })

  describe('detectLightingConflicts', () => {
    it('flags mutual exclusion error', () => {
      const conflicts = detectLightingConflicts({
        ...base,
        enableStandaloneWeather: true,
        streetsGLIframeOverlay: true
      })
      expect(conflicts.some((c) => c.code === 'WEATHER_STREETS_GL_BOTH')).toBe(true)
    })

    it('warns when sun legacy shadow config fights CSM', () => {
      const conflicts = detectLightingConflicts({
        ...base,
        enableStandaloneWeather: true,
        csmEnabled: true,
        sunLightCastShadowConfig: true
      })
      expect(conflicts.some((c) => c.code === 'SUN_LEGACY_SHADOW_WITH_CSM')).toBe(true)
    })

    it('info when HDR on with shadows for contrast tuning', () => {
      const conflicts = detectLightingConflicts({
        ...base,
        hdrEnabled: true,
        shadowsEnabled: true
      })
      expect(conflicts.some((c) => c.code === 'HDR_SHADOW_CONTRAST')).toBe(true)
    })
  })

  describe('resolveStreetsGLWeatherExclusion', () => {
    it('disables weather when enabling streets GL', () => {
      const patch = resolveStreetsGLWeatherExclusion(true, false, {
        streetsGLIframeOverlay: false,
        enableStandaloneWeather: true
      })
      expect(patch).toEqual({
        streetsGLIframeOverlay: true,
        enableStandaloneWeather: false
      })
    })

    it('disables streets GL when enabling standalone weather', () => {
      const patch = resolveStreetsGLWeatherExclusion(false, true, {
        streetsGLIframeOverlay: true,
        enableStandaloneWeather: false
      })
      expect(patch).toEqual({
        enableStandaloneWeather: true,
        streetsGLIframeOverlay: false
      })
    })

    it('returns null when no conflict', () => {
      expect(
        resolveStreetsGLWeatherExclusion(true, false, {
          streetsGLIframeOverlay: false,
          enableStandaloneWeather: false
        })
      ).toBeNull()
    })
  })
})
