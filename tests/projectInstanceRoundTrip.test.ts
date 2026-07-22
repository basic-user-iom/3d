import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  applySavedImportedInstanceInPlace,
  type SavedHierarchyNodeWithMaterials
} from '../src/utils/projectInstanceRestore'
import { serializeSceneObjectsForTests } from '../src/utils/projectPersistence'

function buildImportedInstance(opts: {
  name: string
  instanceId: string
  fileName: string
  rootX: number
  bodyColor: number
  wheelColor: number
  wheelScale?: number
}): THREE.Group {
  const root = new THREE.Group()
  root.name = opts.name
  root.position.x = opts.rootX
  root.userData.fileName = opts.fileName
  root.userData.isModel = true
  root.userData.isImportedModel = true
  root.userData.instanceId = opts.instanceId

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: opts.bodyColor, metalness: 0.2, roughness: 0.4 })
  )
  body.name = 'Body'

  const wheel = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshStandardMaterial({ color: opts.wheelColor, metalness: 0.8, roughness: 0.3 })
  )
  wheel.name = 'Wheel'
  if (opts.wheelScale != null) {
    wheel.scale.setScalar(opts.wheelScale)
  }

  root.add(body)
  body.add(wheel)
  return root
}

function cloneAssetTree(source: THREE.Object3D): THREE.Group {
  // Fresh "loaded asset" tree: same hierarchy/names, default materials/transforms.
  const root = new THREE.Group()
  root.name = source.name
  root.userData.fileName = source.userData.fileName
  root.userData.isModel = true
  root.userData.isImportedModel = true

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  )
  body.name = 'Body'
  const wheel = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  )
  wheel.name = 'Wheel'
  root.add(body)
  body.add(wheel)
  return root
}

describe('project instance fixture round-trip (DATA-1)', () => {
  test('two instances of the same file survive serialize → JSON → in-place restore', async () => {
    const scene = new THREE.Scene()
    const a = buildImportedInstance({
      name: 'Car A',
      instanceId: 'inst-a',
      fileName: 'car.glb',
      rootX: -5,
      bodyColor: 0xff0000,
      wheelColor: 0x111111,
      wheelScale: 1
    })
    const b = buildImportedInstance({
      name: 'Car B',
      instanceId: 'inst-b',
      fileName: 'car.glb',
      rootX: 5,
      bodyColor: 0x0000ff,
      wheelColor: 0x222222,
      wheelScale: 2
    })
    scene.add(a)
    scene.add(b)

    const serialized = await serializeSceneObjectsForTests(scene)
    const imported = serialized.filter((obj) => obj.type === 'imported')
    expect(imported).toHaveLength(2)
    expect(imported.map((obj) => obj.fileName)).toEqual(['car.glb', 'car.glb'])
    expect(imported.map((obj) => obj.instanceId).sort()).toEqual(['inst-a', 'inst-b'])
    expect(new Set(imported.map((obj) => obj.instanceId)).size).toBe(2)

    // Simulate save/load of the project JSON fixture.
    const reloaded = JSON.parse(JSON.stringify(imported)) as SavedHierarchyNodeWithMaterials[]

    const liveA = cloneAssetTree(a)
    const liveB = cloneAssetTree(b)
    const savedA = reloaded.find((obj) => obj.instanceId === 'inst-a')!
    const savedB = reloaded.find((obj) => obj.instanceId === 'inst-b')!

    applySavedImportedInstanceInPlace(liveA, savedA)
    applySavedImportedInstanceInPlace(liveB, savedB)

    expect(liveA.userData.instanceId).toBe('inst-a')
    expect(liveB.userData.instanceId).toBe('inst-b')
    expect(liveA.position.x).toBe(-5)
    expect(liveB.position.x).toBe(5)
    expect(liveA.name).toBe('Car A')
    expect(liveB.name).toBe('Car B')

    // Both instances remain distinct after round-trip (no fileName collapse).
    expect(liveA.userData.fileName).toBe(liveB.userData.fileName)
    expect(liveA.userData.instanceId).not.toBe(liveB.userData.instanceId)
  })

  test('per-child material edits round-trip onto the correct instance', async () => {
    const scene = new THREE.Scene()
    scene.add(
      buildImportedInstance({
        name: 'Car A',
        instanceId: 'inst-a',
        fileName: 'car.glb',
        rootX: -5,
        bodyColor: 0xff0000,
        wheelColor: 0x111111
      })
    )
    scene.add(
      buildImportedInstance({
        name: 'Car B',
        instanceId: 'inst-b',
        fileName: 'car.glb',
        rootX: 5,
        bodyColor: 0x0000ff,
        wheelColor: 0xabcdef,
        wheelScale: 2
      })
    )

    const serialized = await serializeSceneObjectsForTests(scene)
    const reloaded = JSON.parse(JSON.stringify(serialized.filter((o) => o.type === 'imported')))

    const liveA = cloneAssetTree(scene.children[0])
    const liveB = cloneAssetTree(scene.children[1])
    const savedA = reloaded.find((obj: { instanceId?: string }) => obj.instanceId === 'inst-a')!
    const savedB = reloaded.find((obj: { instanceId?: string }) => obj.instanceId === 'inst-b')!

    applySavedImportedInstanceInPlace(liveA, savedA)
    applySavedImportedInstanceInPlace(liveB, savedB)

    const bodyA = liveA.getObjectByName('Body') as THREE.Mesh
    const bodyB = liveB.getObjectByName('Body') as THREE.Mesh
    const wheelA = liveA.getObjectByName('Wheel') as THREE.Mesh
    const wheelB = liveB.getObjectByName('Wheel') as THREE.Mesh

    expect((bodyA.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xff0000)
    expect((bodyB.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x0000ff)
    expect((wheelA.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x111111)
    expect((wheelB.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xabcdef)
    expect(wheelB.scale.x).toBe(2)
    expect(wheelA.scale.x).toBe(1)

    // Edits on B must not leak onto A.
    expect((bodyA.material as THREE.MeshStandardMaterial).color.getHex()).not.toBe(
      (bodyB.material as THREE.MeshStandardMaterial).color.getHex()
    )
  })
})
