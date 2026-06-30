import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  ensureInteriorFillLight,
  removeInteriorFillLight
} from '../src/utils/interiorFillLight'

describe('interiorFillLight', () => {
  it('adds RectAreaLight when interior meshes are tagged', () => {
    const scene = new THREE.Scene()
    const model = new THREE.Group()
    model.userData.isModel = true

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      )
      mesh.userData.isImportedModel = true
      mesh.userData.lightingZone = 'interior'
      mesh.position.set(i * 0.5, 0, 0)
      model.add(mesh)
    }
    scene.add(model)

    const fill = ensureInteriorFillLight(scene, model)
    expect(fill).toBeInstanceOf(THREE.RectAreaLight)
    expect(fill?.userData.isAutoInteriorFill).toBe(true)
  })

  it('skips fill when user RectAreaLight exists', () => {
    const scene = new THREE.Scene()
    const userLight = new THREE.RectAreaLight(0xffffff, 2, 1, 1)
    scene.add(userLight)

    const model = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    )
    mesh.userData.isImportedModel = true
    mesh.userData.lightingZone = 'interior'
    model.add(mesh)
    scene.add(model)

    expect(ensureInteriorFillLight(scene, model)).toBeNull()
  })

  it('removeInteriorFillLight disposes auto fill only', () => {
    const scene = new THREE.Scene()
    const model = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    )
    mesh.userData.isImportedModel = true
    mesh.userData.lightingZone = 'interior'
    model.add(mesh)
    scene.add(model)

    ensureInteriorFillLight(scene, model)
    removeInteriorFillLight(scene)

    let autoCount = 0
    scene.traverse((obj) => {
      if (obj instanceof THREE.RectAreaLight && obj.userData.isAutoInteriorFill) autoCount++
    })
    expect(autoCount).toBe(0)
  })
})
