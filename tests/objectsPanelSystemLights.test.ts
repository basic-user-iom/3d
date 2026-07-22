import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { isObjectsPanelSystemLight } from '../src/utils/objectsPanelSystemLights'

describe('isObjectsPanelSystemLight', () => {
  it('detects auto interior fill', () => {
    const light = new THREE.RectAreaLight(0xffffff, 1, 1, 1)
    light.userData.isAutoInteriorFill = true
    light.userData.isSystemLight = true
    expect(isObjectsPanelSystemLight(light)).toBe(true)
  })

  it('detects HDR exterior light probe', () => {
    const probe = new THREE.LightProbe()
    probe.userData.isIndirectLightingProbe = true
    expect(isObjectsPanelSystemLight(probe)).toBe(true)
  })

  it('ignores user lights', () => {
    const light = new THREE.PointLight()
    expect(isObjectsPanelSystemLight(light)).toBe(false)
  })

  it('detects CSM cascade lights (isCSMLight / isInternal)', () => {
    const light = new THREE.DirectionalLight()
    light.userData.isCSMLight = true
    light.userData.isInternal = true
    expect(isObjectsPanelSystemLight(light)).toBe(true)
  })

  it('detects standalone weather lights', () => {
    const light = new THREE.DirectionalLight()
    light.userData.isStandaloneWeatherLight = true
    expect(isObjectsPanelSystemLight(light)).toBe(true)
  })
})
