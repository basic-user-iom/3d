import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  PHYSICAL_DIRECTIONAL_SHADOW_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS,
  PHYSICAL_CSM_SHADOW_RADIUS,
  PHYSICAL_OMNI_SHADOW_FAR_INITIAL,
  CSM_SHADER_BIAS_PHYSICAL,
  computeOmnidirectionalShadowFar,
  computePointLightShadowFar,
  computePointLightShadowIntensity,
  applyPointLightShadowIntensity,
  computeTightShadowFrustum,
  applyAdaptiveDirectionalShadowBias,
  applyPhysicalOmnidirectionalShadowDefaults,
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

  it('computes omnidirectional shadow far from scene bounds, not attenuation distance', () => {
    const lightPos = new THREE.Vector3(0, 10, 0)
    const sceneBox = new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 3, 5)
    )
    const far = computeOmnidirectionalShadowFar(lightPos, sceneBox)
    // Farthest corner from (0,10,0) is roughly (±5,0,±5) ≈ 11.2 + margin
    expect(far).toBeGreaterThan(11)
    // Must exceed a tight attenuation distance that would clip shadows into a circle
    expect(far).toBeGreaterThan(15)
    expect(computeOmnidirectionalShadowFar(lightPos, new THREE.Box3())).toBe(
      PHYSICAL_OMNI_SHADOW_FAR_INITIAL
    )
  })

  it('extends omnidirectional far to reach the ground plane under the light', () => {
    const lightPos = new THREE.Vector3(0, 80, 0)
    const tinyScene = new THREE.Box3(
      new THREE.Vector3(-2, 0, -2),
      new THREE.Vector3(2, 2, 2)
    )
    const far = computeOmnidirectionalShadowFar(lightPos, tinyScene)
    expect(far).toBeGreaterThanOrEqual(80)
  })

  it('tightens point-light shadow far for large HDR scenes', () => {
    const lightPos = new THREE.Vector3(0, 12, 0)
    const racetrackBox = new THREE.Box3(
      new THREE.Vector3(-200, 0, -200),
      new THREE.Vector3(200, 5, 200)
    )
    const fullFar = computeOmnidirectionalShadowFar(lightPos, racetrackBox)
    const pointFar = computePointLightShadowFar(lightPos, racetrackBox)
    expect(pointFar).toBeLessThan(fullFar)
    expect(pointFar).toBeGreaterThan(12)
  })

  it('scales point-light shadow intensity down for HDR sun fill lights', () => {
    expect(computePointLightShadowIntensity(0.15, true)).toBeCloseTo(0.375, 2)
    expect(computePointLightShadowIntensity(1.0, true)).toBe(0.4)
    expect(computePointLightShadowIntensity(0.1, false)).toBe(1)
  })

  it('applies diminished shadow intensity on point lights', () => {
    const light = new THREE.PointLight(0xffffff, 0.2)
    light.castShadow = true
    applyPointLightShadowIntensity(light, 0.2, true)
    expect(light.shadow.intensity).toBeLessThan(0.5)
  })

  it('applies sharp omnidirectional shadow defaults for point lights', () => {
    const light = new THREE.PointLight(0xffffff, 1)
    light.castShadow = true
    applyPhysicalOmnidirectionalShadowDefaults(light)
    expect(light.shadow.radius).toBe(0)
    expect(light.shadow.bias).toBe(0)
    expect(light.shadow.normalBias).toBe(0)
  })
})
