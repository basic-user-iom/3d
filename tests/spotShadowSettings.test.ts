import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_SPOT_SHADOW_CONVERSION_ANGLE,
  applyPhysicalSpotShadowDefaults,
  computeSpotLightShadowFar,
  spotShadowCameraFovDegrees
} from '../src/viewer/utils/physicalShadowSettings'
import {
  aimSpotLightAtSceneCenter,
  collectSceneShadowBounds,
  getSceneShadowBoundsCenter
} from '../src/viewer/utils/shadowManager'

function makeCarScene(): THREE.Scene {
  const scene = new THREE.Scene()
  const car = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.5, 2),
    new THREE.MeshStandardMaterial()
  )
  car.position.set(2, 0.75, -1)
  car.castShadow = true
  car.userData.isImportedModel = true
  scene.add(car)
  return scene
}

describe('spot shadow settings', () => {
  it('uses 45° default angle for point→spot conversion', () => {
    expect(DEFAULT_SPOT_SHADOW_CONVERSION_ANGLE).toBeCloseTo(Math.PI / 4)
  })

  it('collects imported model bounds', () => {
    const scene = makeCarScene()
    const box = collectSceneShadowBounds(scene)
    expect(box).not.toBeNull()
    const center = box!.getCenter(new THREE.Vector3())
    expect(center.x).toBeCloseTo(2, 0)
    expect(center.y).toBeCloseTo(0.75, 1)
    expect(center.z).toBeCloseTo(-1, 0)
  })

  it('returns scene center for spotlight aim', () => {
    const scene = makeCarScene()
    const center = getSceneShadowBoundsCenter(scene)
    expect(center?.x).toBeCloseTo(2, 0)
  })

  it('aims spot light target at model bbox center', () => {
    const scene = makeCarScene()
    const spot = new THREE.SpotLight(0xffffff, 1)
    spot.position.set(-5, 8, 0)
    scene.add(spot)
    scene.add(spot.target)

    const aimed = aimSpotLightAtSceneCenter(spot, scene)
    expect(aimed?.x).toBeCloseTo(2, 0)
    expect(spot.target.position.x).toBeCloseTo(2, 0)
  })

  it('keeps spot shadow far tighter than racetrack omnidirectional far', () => {
    const lightPos = new THREE.Vector3(-5, 8, 0)
    const target = new THREE.Vector3(2, 0.75, -1)
    const carBox = new THREE.Box3(
      new THREE.Vector3(0, 0, -2),
      new THREE.Vector3(4, 1.5, 0)
    )
    const racetrackBox = new THREE.Box3(
      new THREE.Vector3(-200, 0, -200),
      new THREE.Vector3(200, 5, 200)
    )

    const carFar = computeSpotLightShadowFar(lightPos, target, carBox)
    const trackFar = computeSpotLightShadowFar(lightPos, target, racetrackBox)
    expect(carFar).toBeLessThan(trackFar)
    expect(carFar).toBeGreaterThan(lightPos.distanceTo(target))
  })

  it('applies contact-friendly spot shadow defaults', () => {
    const spot = new THREE.SpotLight(0xffffff, 1)
    spot.castShadow = true
    applyPhysicalSpotShadowDefaults(spot)
    expect(spot.shadow.radius).toBe(0)
    expect(spot.shadow.focus).toBe(1)
    expect(spot.shadow.bias).toBeLessThan(0)
  })

  it('reports full-cone shadow camera fov from half-angle', () => {
    expect(spotShadowCameraFovDegrees(Math.PI / 4)).toBeCloseTo(90, 1)
  })
})
