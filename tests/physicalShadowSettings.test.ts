import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  CSM_LIGHT_SHADOW_NORMAL_BIAS_PHYSICAL,
  CSM_SHADER_BIAS_PHYSICAL,
  applyAdaptiveDirectionalShadowBias,
  computeTightShadowFrustum,
  getPhysicalLightingPresetValues,
  PHYSICAL_DIRECTIONAL_SHADOW_BIAS,
  PHYSICAL_SHADOW_MAP_SIZE,
  TIGHT_FRUSTUM_MAX_DIM
} from '../src/viewer/utils/physicalShadowSettings'
import {
  CSM_LIGHT_SHADOW_NORMAL_BIAS,
  CSM_SHADER_BIAS
} from '../src/viewer/effects/StreetsGLCSM'

describe('physicalShadowSettings', () => {
  it('exports CSM constants aligned with physical reference', () => {
    expect(CSM_SHADER_BIAS).toBe(CSM_SHADER_BIAS_PHYSICAL)
    expect(CSM_LIGHT_SHADOW_NORMAL_BIAS).toBe(CSM_LIGHT_SHADOW_NORMAL_BIAS_PHYSICAL)
  })

  it('uses tighter ortho frustum at car/product scale', () => {
    const car = computeTightShadowFrustum(8, 2, 4, true)
    const building = computeTightShadowFrustum(120, 40, 80, false)

    expect(car.orthoHalfExtent).toBeLessThan(20)
    expect(building.orthoHalfExtent).toBeGreaterThan(car.orthoHalfExtent)
    expect(TIGHT_FRUSTUM_MAX_DIM).toBe(30)
  })

  it('physical preset matches three.js reference map size and bias', () => {
    const preset = getPhysicalLightingPresetValues()
    expect(preset.shadowMapSize).toBe(PHYSICAL_SHADOW_MAP_SIZE)
    expect(preset.shadowBiasOverride).toBe(PHYSICAL_DIRECTIONAL_SHADOW_BIAS)
    expect(preset.useAdaptiveShadowSettings).toBe(true)
  })

  it('adaptive bias stays near physical reference for product-scale scenes', () => {
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)

    applyAdaptiveDirectionalShadowBias(light, 8, 2)

    expect(light.shadow!.bias).toBeGreaterThan(-0.0005)
    expect(light.shadow!.bias).toBeLessThanOrEqual(-0.00002)
    expect(light.shadow!.normalBias).toBeLessThan(0.02)
  })
})
