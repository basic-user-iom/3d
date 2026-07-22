import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import {
  collectProjectOwnedSceneRoots,
  commitSceneObjectSwap,
  discardStagedSceneRoots,
  isProjectOwnedSceneRoot
} from '../src/utils/projectAtomicLoad'
import { validateProjectSnapshot, type SavedProject } from '../src/utils/projectPersistence'

function makeModel(name: string, instanceId: string): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.userData.isModel = true
  g.userData.isImportedModel = true
  g.userData.fileName = 'car.glb'
  g.userData.instanceId = instanceId
  return g
}

describe('projectAtomicLoad (DATA-2)', () => {
  test('collectProjectOwnedSceneRoots ignores lights/helpers and finds models', () => {
    const scene = new THREE.Scene()
    const light = new THREE.AmbientLight()
    const helper = new THREE.GridHelper(10, 10)
    const model = makeModel('KeepMe', 'inst-1')
    scene.add(light, helper, model)

    expect(isProjectOwnedSceneRoot(light)).toBe(false)
    expect(isProjectOwnedSceneRoot(helper)).toBe(false)
    expect(isProjectOwnedSceneRoot(model)).toBe(true)
    expect(collectProjectOwnedSceneRoots(scene)).toEqual([model])
  })

  test('commitSceneObjectSwap only replaces after staging succeeds', () => {
    const scene = new THREE.Scene()
    const previous = makeModel('Previous', 'inst-old')
    scene.add(previous)

    const staged = makeModel('Next', 'inst-new')
    // Staged is not in the scene yet — failure path would discard it.
    expect(scene.children).toContain(previous)
    expect(scene.children).not.toContain(staged)

    // Simulate abort: discard staged, previous remains.
    discardStagedSceneRoots(scene, [staged])
    expect(scene.children).toContain(previous)
    expect(scene.children).not.toContain(staged)

    // Successful commit swaps.
    commitSceneObjectSwap(scene, [previous], [staged])
    expect(scene.children).not.toContain(previous)
    expect(scene.children).toContain(staged)
  })

  test('commitSceneObjectSwap keeps reused roots and drops only retired ones', () => {
    const scene = new THREE.Scene()
    const kept = makeModel('Kept', 'inst-keep')
    const retired = makeModel('Retired', 'inst-retire')
    const added = makeModel('Added', 'inst-add')
    scene.add(kept, retired)

    commitSceneObjectSwap(scene, [kept, retired], [kept, added])

    expect(scene.children).toContain(kept)
    expect(scene.children).toContain(added)
    expect(scene.children).not.toContain(retired)
  })

  test('validateProjectSnapshot rejects invalid payloads before mutation', () => {
    const invalid = { version: 99, sceneObjects: null } as unknown as SavedProject
    const result = validateProjectSnapshot(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('validateProjectSnapshot rejects oversized embedded base64 totals (DATA-5)', () => {
    const huge = 'A'.repeat(200 * 1024 * 1024) // ~150MB decoded
    const snapshot = {
      version: 6,
      sceneObjects: [],
      store: {
        modelFiles: [{ fileName: 'huge.glb', fileData: huge }]
      }
    } as unknown as SavedProject
    const result = validateProjectSnapshot(snapshot)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /Embedded model data exceeds limit/i.test(e))).toBe(true)
  })
})
