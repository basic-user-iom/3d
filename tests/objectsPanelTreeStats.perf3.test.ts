import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  computeSubtreeStatsMap,
  getGeometryCacheMissCount,
  getLocalMeshStats,
  getObjectSubtreeStats,
  resetGeometryCacheMissCount
} from '../src/utils/objectsPanelTreeStats'

function makeDeepMeshTree(depth: number, meshesPerLevel: number): {
  root: THREE.Group
  objectCount: number
  meshCount: number
  sharedGeometry: THREE.BufferGeometry
} {
  const sharedGeometry = new THREE.BoxGeometry(1, 1, 1)
  const root = new THREE.Group()
  root.name = 'root'
  let parent: THREE.Object3D = root
  let objectCount = 1
  let meshCount = 0

  for (let d = 0; d < depth; d++) {
    const group = new THREE.Group()
    group.name = `group-${d}`
    parent.add(group)
    objectCount++
    for (let m = 0; m < meshesPerLevel; m++) {
      const mesh = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial())
      mesh.name = `mesh-${d}-${m}`
      group.add(mesh)
      objectCount++
      meshCount++
    }
    parent = group
  }

  return { root, objectCount, meshCount, sharedGeometry }
}

describe('PERF-3 objects panel tree stats', () => {
  beforeEach(() => {
    resetGeometryCacheMissCount()
  })

  it('aggregates deep hierarchies in a single visit per object (linear)', () => {
    const { root, objectCount, meshCount } = makeDeepMeshTree(10, 4)
    let visits = 0

    const map = computeSubtreeStatsMap(root, () => {
      visits++
    })

    expect(visits).toBe(objectCount)
    expect(meshCount).toBe(40)

    const rootStats = map.get(root.id)!
    // BoxGeometry is indexed: 12 triangles per mesh
    expect(rootStats.triangles).toBe(meshCount * 12)
    expect(rootStats.size).toBeGreaterThan(0)

    // Parent totals equal sum of direct children (bottom-up consistency).
    let childSum = 0
    for (const child of root.children) {
      childSum += map.get(child.id)!.triangles
    }
    expect(rootStats.triangles).toBe(childSum)
  })

  it('caches shared geometry measurements across meshes and rebuilds', () => {
    const geom = new THREE.BoxGeometry(2, 2, 2)
    const meshA = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())
    const meshB = new THREE.Mesh(geom, new THREE.MeshStandardMaterial())

    resetGeometryCacheMissCount()
    const first = getLocalMeshStats(meshA)
    expect(getGeometryCacheMissCount()).toBe(1)

    const second = getLocalMeshStats(meshB)
    expect(getGeometryCacheMissCount()).toBe(1)
    expect(second.triangles).toBe(first.triangles)
    expect(second.size).toBe(first.size)

    // Rebuild-style second pass on the same meshes still hits the cache.
    getLocalMeshStats(meshA)
    getLocalMeshStats(meshB)
    expect(getGeometryCacheMissCount()).toBe(1)
  })

  it('getObjectSubtreeStats matches map entry for the root', () => {
    const { root } = makeDeepMeshTree(3, 2)
    const fromMap = computeSubtreeStatsMap(root).get(root.id)!
    const direct = getObjectSubtreeStats(root)
    expect(direct).toEqual(fromMap)
  })
})
