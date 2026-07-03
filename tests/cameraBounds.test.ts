import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyOrbitCameraBounds,
  buildCameraBoundsConfig,
  clampDiscXZ,
  deriveGroundProjectionBounds,
  isCameraBoundsConfigValid
} from '../src/viewer/utils/cameraBounds'

describe('cameraBounds', () => {
  it('derives disc bounds from ground projection radius', () => {
    const derived = deriveGroundProjectionBounds(100, 15, 0)
    expect(derived.discRadius).toBe(95)
    expect(derived.min.y).toBeCloseTo(-5)
    expect(derived.max.y).toBe(15)
    expect(derived.min.x).toBe(-95)
    expect(derived.max.x).toBe(95)
  })

  it('clamps a point on XZ to a disc', () => {
    const v = new THREE.Vector3(100, 2, 0)
    expect(clampDiscXZ(v, 0, 0, 95)).toBe(true)
    expect(v.x).toBeCloseTo(95)
    expect(v.z).toBeCloseTo(0)
  })

  it('clamps orbit target and compensates camera when panning outside disc', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(10, 5, 10)
    const target = new THREE.Vector3(120, 1, 0)
    const controls = { target }

    const config = buildCameraBoundsConfig({
      cameraBoundsEnabled: true,
      cameraBoundsMode: 'disc',
      cameraBoundsMin: { x: -95, y: -5, z: -95 },
      cameraBoundsMax: { x: 95, y: 15, z: 95 },
      cameraBoundsDiscRadius: 95,
      cameraBoundsCenterX: 0,
      cameraBoundsCenterZ: 0
    })

    expect(isCameraBoundsConfigValid(config)).toBe(true)

    const offsetBefore = camera.position.clone().sub(target)
    applyOrbitCameraBounds(camera, controls, config)

    expect(Math.hypot(controls.target.x, controls.target.z)).toBeLessThanOrEqual(95 + 1e-6)
    const offsetAfter = camera.position.clone().sub(controls.target)
    expect(offsetAfter.distanceTo(offsetBefore)).toBeLessThan(1e-6)
  })

  it('uses box mode for axis-aligned clamping', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 5, 0)
    const target = new THREE.Vector3(50, 1, 50)
    const controls = { target }

    const config = buildCameraBoundsConfig({
      cameraBoundsEnabled: true,
      cameraBoundsMode: 'box',
      cameraBoundsMin: { x: -40, y: -5, z: -40 },
      cameraBoundsMax: { x: 40, y: 15, z: 40 },
      cameraBoundsDiscRadius: 95,
      cameraBoundsCenterX: 0,
      cameraBoundsCenterZ: 0
    })

    applyOrbitCameraBounds(camera, controls, config)
    expect(controls.target.x).toBe(40)
    expect(controls.target.z).toBe(40)
  })
})
