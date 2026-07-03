import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  detachPivotWrapperReference,
  getModelSceneRemovalTarget,
  isDeletingImportedModelRoot,
  isObjectInModelSubtree,
  resolveImportedModelRoot
} from '../src/viewer/useViewer'

vi.mock('../src/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      projectObjects: [],
      streetsGLGroundLat: 0,
      streetsGLGroundLon: 0
    })
  }
}))

function buildImportedModelTree(): {
  scene: THREE.Scene
  modelRoot: THREE.Group
  pivot: THREE.Group
  childGroup: THREE.Group
  childMesh: THREE.Mesh
} {
  const scene = new THREE.Scene()
  const modelRoot = new THREE.Group()
  modelRoot.name = 'HKEYTrust_Building.fbx'
  modelRoot.userData.isModel = true
  modelRoot.userData.isImportedModel = true
  modelRoot.userData.fileName = 'HKEYTrust_Building.fbx'
  modelRoot.userData.projectObjectId = 'model-1'

  const childGroup = new THREE.Group()
  childGroup.name = 'Floor_01'
  childGroup.userData.isImportedModel = true
  childGroup.userData.isModel = true

  const childMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  )
  childMesh.name = 'Wall_01'
  childMesh.userData.isImportedModel = true
  childMesh.userData.isModel = true

  childGroup.add(childMesh)
  modelRoot.add(childGroup)

  const pivot = new THREE.Group()
  pivot.userData.isPivotWrapper = true
  pivot.userData.originalModel = modelRoot
  scene.add(pivot)
  pivot.add(modelRoot)

  return { scene, modelRoot, pivot, childGroup, childMesh }
}

describe('imported model delete helpers', () => {
  it('resolveImportedModelRoot walks up from a subcategory mesh', () => {
    const { modelRoot, childMesh } = buildImportedModelTree()
    expect(resolveImportedModelRoot(childMesh)).toBe(modelRoot)
  })

  it('isDeletingImportedModelRoot is true for registry root only', () => {
    const { modelRoot, childGroup, childMesh } = buildImportedModelTree()
    expect(isDeletingImportedModelRoot(modelRoot, modelRoot)).toBe(true)
    expect(isDeletingImportedModelRoot(childGroup, modelRoot)).toBe(false)
    expect(isDeletingImportedModelRoot(childMesh, modelRoot)).toBe(false)
  })

  it('getModelSceneRemovalTarget returns pivot wrapper when model is wrapped', () => {
    const { modelRoot, pivot } = buildImportedModelTree()
    expect(getModelSceneRemovalTarget(modelRoot)).toBe(pivot)
  })

  it('detachPivotWrapperReference clears stale pivot back-reference', () => {
    const { modelRoot, pivot } = buildImportedModelTree()
    detachPivotWrapperReference(modelRoot)
    expect(pivot.userData.originalModel).toBeNull()
  })

  it('isObjectInModelSubtree matches root and descendants', () => {
    const { modelRoot, childGroup, childMesh } = buildImportedModelTree()
    expect(isObjectInModelSubtree(childMesh, modelRoot)).toBe(true)
    expect(isObjectInModelSubtree(childGroup, modelRoot)).toBe(true)
    expect(isObjectInModelSubtree(modelRoot, modelRoot)).toBe(true)
    expect(isObjectInModelSubtree(new THREE.Mesh(), modelRoot)).toBe(false)
  })

  it('removing pivot excises the full model subtree from the scene', () => {
    const { scene, modelRoot, pivot } = buildImportedModelTree()
    const removalTarget = getModelSceneRemovalTarget(modelRoot)
    detachPivotWrapperReference(modelRoot)
    scene.remove(removalTarget)

    expect(scene.children).not.toContain(pivot)
    let meshCount = 0
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshCount++
    })
    expect(meshCount).toBe(0)
  })
})
