import { describe, expect, it } from 'vitest'
import {
  getAdaptiveIqRaymarchSteps,
  getCsmCascadeCountForQuality,
  getCsmMaxFarForQuality,
  getCsmShadowMapSizeForQuality,
  getEffectiveMaxFps,
  getEffectivePixelRatio,
  getWeatherMaxPixelRatio
} from '../src/viewer/utils/weatherGpuUtils'

describe('weatherGpuUtils', () => {
  describe('getCsmShadowMapSizeForQuality', () => {
    it('scales shadow maps down on low and medium tiers', () => {
      expect(getCsmShadowMapSizeForQuality('low')).toBe(512)
      expect(getCsmShadowMapSizeForQuality('medium')).toBe(1024)
      expect(getCsmShadowMapSizeForQuality('high')).toBe(2048)
      expect(getCsmShadowMapSizeForQuality('ultra')).toBe(2048)
    })
  })

  describe('getCsmMaxFarForQuality', () => {
    it('scales shadow far plane per tier', () => {
      expect(getCsmMaxFarForQuality('low')).toBe(3000)
      expect(getCsmMaxFarForQuality('medium')).toBe(4000)
      expect(getCsmMaxFarForQuality('high')).toBe(5000)
      expect(getCsmMaxFarForQuality('ultra')).toBe(5000)
    })
  })

  describe('getCsmCascadeCountForQuality', () => {
    it('reduces cascade count on low and medium tiers', () => {
      expect(getCsmCascadeCountForQuality('low')).toBe(1)
      expect(getCsmCascadeCountForQuality('medium')).toBe(2)
      expect(getCsmCascadeCountForQuality('high')).toBe(3)
      expect(getCsmCascadeCountForQuality('ultra')).toBe(3)
    })
  })

  describe('getAdaptiveIqRaymarchSteps', () => {
    it('preserves full steps on high and ultra presets', () => {
      expect(getAdaptiveIqRaymarchSteps('high', 0.75)).toBe(80)
      expect(getAdaptiveIqRaymarchSteps('ultra', 0.5)).toBe(96)
    })

    it('uses reduced steps on low and medium when clouds are visible', () => {
      const sparseLow = getAdaptiveIqRaymarchSteps('low', 0.2)
      const denseLow = getAdaptiveIqRaymarchSteps('low', 0.9)
      expect(sparseLow).toBeGreaterThanOrEqual(32)
      expect(sparseLow).toBeLessThanOrEqual(48)
      expect(denseLow).toBeGreaterThanOrEqual(32)
      expect(denseLow).toBeLessThanOrEqual(48)
      expect(getAdaptiveIqRaymarchSteps('medium', 0.5)).toBeGreaterThanOrEqual(48)
      expect(getAdaptiveIqRaymarchSteps('medium', 0.5)).toBeLessThanOrEqual(56)
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

    it('applies weather quality tier caps', () => {
      expect(getWeatherMaxPixelRatio('low', 3)).toBe(1.5)
      expect(getEffectivePixelRatio(2, 3, 1920, 'low')).toBe(1.5)
      expect(getEffectivePixelRatio(2, 3, 1920, 'medium')).toBe(2)
    })
  })

  describe('getEffectiveMaxFps', () => {
    it('caps unlimited FPS to 60 on low weather quality', () => {
      expect(getEffectiveMaxFps('low', 0, true)).toBe(60)
      expect(getEffectiveMaxFps('low', 30, true)).toBe(30)
      expect(getEffectiveMaxFps('high', 0, true)).toBe(0)
      expect(getEffectiveMaxFps('low', 0, false)).toBe(0)
    })
  })
})
