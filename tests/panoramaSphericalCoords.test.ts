import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyCameraOrientation,
  cartesianToSpherical,
  getOrientationFromControls,
  projectToScreen,
  sphericalToCartesian,
  syncPanoramaCameraAtOrigin,
  PANORAMA_SPHERE_RADIUS
} from '../src/panorama/panoramaSphericalCoords'

describe('panoramaSphericalCoords', () => {
  it('round-trips yaw/pitch through cartesian conversion', () => {
    const cases = [
      { yaw: 0, pitch: 0 },
      { yaw: Math.PI / 4, pitch: 0.2 },
      { yaw: -Math.PI / 2, pitch: -0.3 },
      { yaw: Math.PI, pitch: 0.5 }
    ]

    for (const { yaw, pitch } of cases) {
      const point = sphericalToCartesian(yaw, pitch, PANORAMA_SPHERE_RADIUS)
      const restored = cartesianToSpherical(point)
      expect(restored.yaw).toBeCloseTo(yaw, 5)
      expect(restored.pitch).toBeCloseTo(pitch, 5)
    }
  })

  it('places forward view along -Z at yaw 0', () => {
    const point = sphericalToCartesian(0, 0, PANORAMA_SPHERE_RADIUS)
    expect(point.x).toBeCloseTo(0, 5)
    expect(point.y).toBeCloseTo(0, 5)
    expect(point.z).toBeCloseTo(-PANORAMA_SPHERE_RADIUS, 5)
  })

  it('keeps points on the sphere surface', () => {
    const point = sphericalToCartesian(1.2, 0.4, PANORAMA_SPHERE_RADIUS)
    expect(point.length()).toBeCloseTo(PANORAMA_SPHERE_RADIUS, 4)
  })

  it('reads orientation from camera look direction', () => {
    const camera = new THREE.PerspectiveCamera()
    const controls = { target: new THREE.Vector3(), update: () => {} }
    applyCameraOrientation(camera, controls, Math.PI / 6, 0.25)
    const orientation = getOrientationFromControls(controls, camera)
    expect(orientation.yaw).toBeCloseTo(Math.PI / 6, 5)
    expect(orientation.pitch).toBeCloseTo(0.25, 5)
  })

  it('reads orientation after OrbitControls drifts camera off origin', () => {
    const camera = new THREE.PerspectiveCamera()
    const controls = { target: new THREE.Vector3(0, 0, -1), update: () => {} }
    camera.position.set(0.4, 0.2, -0.7)
    camera.lookAt(controls.target)
    syncPanoramaCameraAtOrigin(camera, controls)

    const orientation = getOrientationFromControls(controls, camera)
    expect(camera.position.length()).toBeCloseTo(0, 5)
    expect(orientation.yaw).not.toBeCloseTo(0, 2)
    expect(orientation.pitch).not.toBeCloseTo(0, 2)
  })

  it('projects visible sphere points to screen and hides points behind camera', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000)
    const controls = { target: new THREE.Vector3(), update: () => {} }
    applyCameraOrientation(camera, controls, 0, 0)

    const forward = sphericalToCartesian(0, 0, PANORAMA_SPHERE_RADIUS)
    const behind = sphericalToCartesian(Math.PI, 0, PANORAMA_SPHERE_RADIUS)

    const forwardScreen = projectToScreen(forward, camera, 800, 450)
    const behindScreen = projectToScreen(behind, camera, 800, 450)

    expect(forwardScreen).not.toBeNull()
    expect(forwardScreen?.x).toBeCloseTo(400, 0)
    expect(forwardScreen?.y).toBeCloseTo(225, 0)
    expect(behindScreen).toBeNull()
  })
})
