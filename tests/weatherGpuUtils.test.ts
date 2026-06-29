import { describe, expect, it } from 'vitest'
import {
  getAdaptiveIqRaymarchSteps,
  getCsmShadowMapSizeForQuality,
  getEffectivePixelRatio
} from '../src/viewer/utils/weatherGpuUtils'

describe('weatherGpuUtils', () => {
  describe('getCsmShadowMapSizeForQuality', () => {
    it('uses 1024 for low quality only', () => {
      expect(getCsmShadowMapSizeForQuality('low')).toBe(1024)
      expect(getCsmShadowMapSizeForQuality('medium')).toBe(2048)
      expect(getCsmShadowMapSizeForQuality('high')).toBe(2048)
      expect(getCsmShadowMapSizeForQuality('ultra')).toBe(2048)
    })
  })

  describe('getAdaptiveIqRaymarchSteps', () => {
    it('preserves full steps on high and ultra presets', () => {
      expect(getAdaptiveIqRaymarchSteps('high', 0.75)).toBe(80)
      expect(getAdaptiveIqRaymarchSteps('ultra', 0.5)).toBe(96)
    })

    it('enforces iq-aligned minimum on low/medium when clouds are visible', () => {
      const sparse = getAdaptiveIqRaymarchSteps('low', 0.2)
      const dense = getAdaptiveIqRaymarchSteps('low', 0.9)
      expect(sparse).toBe(64)
      expect(dense).toBe(64)
      expect(getAdaptiveIqRaymarchSteps('medium', 0.5)).toBe(64)
    })

    it('uses minimal steps when coverage is near zero', () => {
      expect(getAdaptiveIqRaymarchSteps('high', 0)).toBe(24)
    })
  })

  describe('getEffectivePixelRatio', () => {
    it('caps fill rate on wide 4K layouts', () => {
      const ratio = getEffectivePixelRatio(2, 2, 3840)
      expect(ratio).toBe(1)
    })

    it('respects maxPixelRatio on smaller canvases', () => {
      expect(getEffectivePixelRatio(3, 2, 1920)).toBe(2)
    })
  })
})
