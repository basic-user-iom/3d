import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  applySavedHierarchyInPlace,
  applySavedTransformToObject,
  ensureInstanceId,
  findChildByHierarchyPath,
  getHierarchyPath,
  matchSavedChildToLiveChild,
  shouldReuseImportedInstanceByFileName
} from '../src/utils/projectInstanceRestore'

type TestSavedNode = {
  name: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  visible: boolean
  children?: TestSavedNode[]
}

function makeSavedNode(
  name: string,
  overrides: Partial<Omit<TestSavedNode, 'name'>> = {}
): TestSavedNode {
  return {
    name,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    rotation: overrides.rotation ?? { x: 0, y: 0, z: 0 },
    scale: overrides.scale ?? { x: 1, y: 1, z: 1 },
    visible: overrides.visible ?? true,
    children: overrides.children
  }
}

describe('projectInstanceRestore (DATA-1)', () => {
  test('never reuses imported instances by fileName alone', () => {
    expect(shouldReuseImportedInstanceByFileName()).toBe(false)
  })

  test('ensureInstanceId keeps existing ids and assigns fallbacks', () => {
    const withId = { instanceId: 'inst-a' }
    expect(ensureInstanceId(withId, 'fallback')).toBe('inst-a')

    const empty: Record<string, unknown> = {}
    expect(ensureInstanceId(empty, 'fallback-1')).toBe('fallback-1')
    expect(empty.instanceId).toBe('fallback-1')
  })

  test('hierarchy path round-trips through findChildByHierarchyPath', () => {
    const root = new THREE.Group()
    root.name = 'Root'
    const childA = new THREE.Group()
    childA.name = 'A'
    const childB = new THREE.Mesh()
    childB.name = 'B'
    root.add(childA)
    childA.add(childB)

    const path = getHierarchyPath(root, childB)
    expect(path).toBe('0:A/0:B')
    expect(findChildByHierarchyPath(root, path!)).toBe(childB)
  })

  test('matchSavedChildToLiveChild prefers name then index and avoids double-use', () => {
    const live = [new THREE.Group(), new THREE.Group(), new THREE.Group()]
    live[0].name = 'Body'
    live[1].name = 'Wheel'
    live[2].name = 'Wheel'

    const used = new Set<number>()
    const first = matchSavedChildToLiveChild(live, { name: 'Wheel' }, 0, used)
    const second = matchSavedChildToLiveChild(live, { name: 'Wheel' }, 1, used)

    expect(first).toBe(live[1])
    expect(second).toBe(live[2])
    expect(used.size).toBe(2)
  })

  test('applySavedHierarchyInPlace updates transforms without appending placeholders', () => {
    const root = new THREE.Group()
    const body = new THREE.Group()
    body.name = 'Body'
    const wheel = new THREE.Mesh()
    wheel.name = 'Wheel'
    root.add(body)
    body.add(wheel)

    const beforeChildCount = root.children.length

    applySavedHierarchyInPlace(root, [
      makeSavedNode('Body', {
        position: { x: 2, y: 0, z: 0 },
        children: [
          makeSavedNode('Wheel', {
            scale: { x: 2, y: 2, z: 2 },
            visible: false
          })
        ]
      })
    ])

    expect(root.children.length).toBe(beforeChildCount)
    expect(body.position.x).toBe(2)
    expect(wheel.scale.x).toBe(2)
    expect(wheel.visible).toBe(false)
  })

  test('two saved instances with same fileName keep independent transforms conceptually', () => {
    // Simulates two roots loaded from the same asset fileName.
    const instanceA = new THREE.Group()
    instanceA.name = 'Car'
    instanceA.userData.fileName = 'car.glb'
    instanceA.userData.instanceId = 'inst-a'

    const instanceB = new THREE.Group()
    instanceB.name = 'Car'
    instanceB.userData.fileName = 'car.glb'
    instanceB.userData.instanceId = 'inst-b'

    applySavedTransformToObject(instanceA, {
      name: 'Car A',
      position: { x: -5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true
    })
    applySavedTransformToObject(instanceB, {
      name: 'Car B',
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true
    })

    expect(instanceA.position.x).toBe(-5)
    expect(instanceB.position.x).toBe(5)
    expect(instanceA.userData.instanceId).not.toBe(instanceB.userData.instanceId)
    expect(instanceA.userData.fileName).toBe(instanceB.userData.fileName)
  })
})
