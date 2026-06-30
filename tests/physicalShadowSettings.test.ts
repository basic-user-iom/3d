import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  PHYSICAL_DIRECTIONAL_SHADOW_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS,
  PHYSICAL_CSM_SHADOW_RADIUS,
  CSM_SHADER_BIAS_PHYSICAL,
  computeTightShadowFrustum,
  applyAdaptiveDirectionalShadowBias,
  getPhysicalLightingPresetValues
} from '../src/viewer/utils/physicalShadowSettings'

describe('physicalShadowSettings', () => {
  it('exports webgl_lights_physical-aligned directional defaults', () => {
    expect(PHYSICAL_DIRECTIONAL_SHADOW_BIAS).toBe(-0.0001)
    expect(PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS).toBe(0.02)
    expect(PHYSICAL_DIRECTIONAL_SHADOW_RADIUS).toBe(1)
  })

  it('uses sharp CSM shader PCF by default', () => {
    expect(PHYSICAL_CSM_SHADOW_RADIUS).toBe(0)
    expect(CSM_SHADER_BIAS_PHYSICAL).toBeLessThan(0)
  })

  it('tightens frustum for car-scale scenes', () => {
    const tight = computeTightShadowFrustum(8, 2, 4, false)
    const large = computeTightShadowFrustum(200, 50, 80, false)
    expect(tight.orthoHalfExtent).toBeLessThan(large.orthoHalfExtent)
    expect(tight.near).toBeLessThanOrEqual(0.001)
  })

  it('clamps adaptive bias for product-scale lights', () => {
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.shadow.mapSize.set(2048, 2048)
    applyAdaptiveDirectionalShadowBias(light, 10, 3)
    expect(light.shadow.bias).toBeGreaterThan(-0.0005)
    expect(light.shadow.bias).toBeLessThanOrEqual(-0.00002)
    expect(light.shadow.normalBias).toBeGreaterThanOrEqual(0.004)
  })

  it('preset matches physical reference map size and overrides', () => {
    const preset = getPhysicalLightingPresetValues()
    expect(preset.shadowMapSize).toBe(2048)
    expect(preset.useAdaptiveShadowSettings).toBe(true)
    expect(preset.shadowBiasOverride).toBe(PHYSICAL_DIRECTIONAL_SHADOW_BIAS)
  })
})
