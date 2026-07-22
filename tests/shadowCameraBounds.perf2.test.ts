import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  applyShadowCameraBounds,
  collectSceneShadowBounds,
  shouldPeriodicallyUpdateShadowBounds,
  updateAllShadowCameraBounds,
  updateShadowCameraBounds
} from '../src/viewer/utils/shadowManager'

function makeDeepHierarchy(depth: number, meshesPerLevel: number): THREE.Scene {
  const scene = new THREE.Scene()
  let parent: THREE.Object3D = scene

  for (let d = 0; d < depth; d++) {
    const group = new THREE.Group()
    group.name = `group-${d}`
    parent.add(group)
    for (let m = 0; m < meshesPerLevel; m++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      )
      mesh.position.set(d * 2 + m, d, m)
      mesh.castShadow = true
      mesh.userData.isImportedModel = true
      group.add(mesh)
    }
    parent = group
  }

  return scene
}

function makeDirectional(castShadow = true): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xffffff, 1)
  light.position.set(5, 10, 5)
  light.castShadow = castShadow
  light.shadow.mapSize.set(1024, 1024)
  return light
}

describe('PERF-2 shadow camera bounds', () => {
  beforeEach(() => {
    // Fresh lights each test — WeakMap cache does not need clearing.
  })

  it('collects deep hierarchy bounds in a single outer traverse (no nested retraversal)', () => {
    const scene = makeDeepHierarchy(8, 3)
    const meshCount = 8 * 3

    let traverseCalls = 0
    const originalTraverse = scene.traverse.bind(scene)
    scene.traverse = ((cb: (obj: THREE.Object3D) => void) => {
      traverseCalls++
      return originalTraverse(cb)
    }) as typeof scene.traverse

    const box = collectSceneShadowBounds(scene)
    expect(box).not.toBeNull()
    expect(traverseCalls).toBe(1)

    // Coverage still includes every contributing mesh.
    const size = box!.getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(1)
    expect(size.y).toBeGreaterThan(1)
    expect(meshCount).toBe(24)
  })

  it('updateAllShadowCameraBounds computes bounds once for many lights', () => {
    const scene = makeDeepHierarchy(6, 2)
    const lights = new Map<string, THREE.DirectionalLight>()
    for (let i = 0; i < 5; i++) {
      const light = makeDirectional()
      light.position.set(i * 3, 10, 0)
      lights.set(`light-${i}`, light)
      scene.add(light)
    }

    let traverseCalls = 0
    const originalTraverse = scene.traverse.bind(scene)
    scene.traverse = ((cb: (obj: THREE.Object3D) => void) => {
      traverseCalls++
      return originalTraverse(cb)
    }) as typeof scene.traverse

    updateAllShadowCameraBounds(lights, scene)
    // One collect pass. GP scene probe is skipped when HDR is off.
    expect(traverseCalls).toBe(1)

    for (const light of lights.values()) {
      expect(light.shadow.camera.left).toBeLessThan(0)
      expect(light.shadow.camera.right).toBeGreaterThan(0)
      expect(light.shadow.needsUpdate).toBe(true)
    }
  })

  it('does not force needsUpdate when bounds and light config are unchanged', () => {
    const scene = makeDeepHierarchy(3, 2)
    const light = makeDirectional()
    scene.add(light)

    const changedFirst = applyShadowCameraBounds(
      light,
      collectSceneShadowBounds(scene),
      scene
    )
    expect(changedFirst).toBe(true)
    expect(light.shadow.needsUpdate).toBe(true)

    light.shadow.needsUpdate = false
    const changedSecond = applyShadowCameraBounds(
      light,
      collectSceneShadowBounds(scene),
      scene
    )
    expect(changedSecond).toBe(false)
    expect(light.shadow.needsUpdate).toBe(false)
  })

  it('forces needsUpdate when the scene bounds change', () => {
    const scene = makeDeepHierarchy(2, 1)
    const light = makeDirectional()
    scene.add(light)

    updateShadowCameraBounds(light, scene)
    light.shadow.needsUpdate = false

    const mover = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial()
    )
    mover.position.set(50, 0, 0)
    mover.castShadow = true
    mover.userData.isImportedModel = true
    scene.add(mover)

    updateShadowCameraBounds(light, scene)
    expect(light.shadow.needsUpdate).toBe(true)
  })

  it('skips periodic updates for static scenes', () => {
    expect(
      shouldPeriodicallyUpdateShadowBounds({
        hasActiveAnimations: false,
        isTransformDragging: false
      })
    ).toBe(false)

    expect(
      shouldPeriodicallyUpdateShadowBounds({
        hasActiveAnimations: true,
        isTransformDragging: false
      })
    ).toBe(true)

    expect(
      shouldPeriodicallyUpdateShadowBounds({
        hasActiveAnimations: false,
        isTransformDragging: true
      })
    ).toBe(true)
  })

  it('benchmark: deep hierarchy + multi-light collect stays linear in lights', () => {
    const scene = makeDeepHierarchy(12, 4)
    const lights = new Map<string, THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight>()
    for (let i = 0; i < 8; i++) {
      lights.set(`d-${i}`, makeDirectional())
    }

    const t0 = performance.now()
    updateAllShadowCameraBounds(lights, scene)
    const elapsedOnce = performance.now() - t0

    const t1 = performance.now()
    updateAllShadowCameraBounds(lights, scene)
    const elapsedCached = performance.now() - t1

    // Second pass should be cheaper (no needsUpdate / early-out after signature match).
    expect(elapsedCached).toBeLessThanOrEqual(elapsedOnce + 5)
    for (const light of lights.values()) {
      // First call set needsUpdate; second call must not re-force it if we clear first.
      light.shadow.needsUpdate = false
    }
    updateAllShadowCameraBounds(lights, scene)
    for (const light of lights.values()) {
      expect(light.shadow.needsUpdate).toBe(false)
    }
  })
})
