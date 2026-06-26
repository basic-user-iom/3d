import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  DYNAMIC_SKY_MIN_CAMERA_FAR,
  DYNAMIC_SKY_SPHERE_RADIUS,
  activateDynamicSkyCamera,
  deactivateDynamicSkyCamera,
  ensureDynamicSkyCameraFar,
  type DynamicSkyCameraHost
} from '../src/viewer/utils/dynamicSkyCamera'

describe('dynamicSkyCamera', () => {
  it('extends camera far plane beyond sky sphere radius', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    ensureDynamicSkyCameraFar(camera)
    expect(camera.far).toBeGreaterThanOrEqual(DYNAMIC_SKY_MIN_CAMERA_FAR)
    expect(DYNAMIC_SKY_MIN_CAMERA_FAR).toBeGreaterThan(DYNAMIC_SKY_SPHERE_RADIUS)
  })

  it('saves and restores camera far via activate/deactivate', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    const host: DynamicSkyCameraHost = { camera }
    activateDynamicSkyCamera(host)
    expect(camera.far).toBeGreaterThan(10000)
    expect(host.dynamicSkySavedCameraFar).toBe(10000)

    deactivateDynamicSkyCamera(host)
    expect(camera.far).toBe(10000)
    expect(host.dynamicSkySavedCameraFar).toBeUndefined()
  })
})
