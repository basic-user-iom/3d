/** @vitest-environment jsdom */
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  applyProjectObjectUndoPatch,
  applySoftDeleteBacking,
  captureDeleteUndoBacking,
  disposeAbandonedDeleteActions,
  disposeDeleteUndoBacking,
  isAbandonedDeleteAction,
  restoreDeleteBacking
} from '../src/viewer/deleteUndoBacking'
import {
  cacheImportedModelScene,
  getCachedImportedModelScene,
  removeCachedImportedModelScene
} from '../src/viewer/importedModelCache'
import { fileRegistry } from '../src/utils/projectPersistence'
import type { ProjectObject } from '../src/store/useAppStore'

vi.mock('../src/store/useAppStore', async () => {
  const actual = await vi.importActual<typeof import('../src/store/useAppStore')>(
    '../src/store/useAppStore'
  )
  return actual
})

function makeImportedModel(): {
  scene: THREE.Scene
  modelRoot: THREE.Group
  pivot: THREE.Group
  descriptor: ProjectObject
  file: File
} {
  const scene = new THREE.Scene()
  const modelRoot = new THREE.Group()
  modelRoot.name = 'Building.fbx'
  modelRoot.userData.isModel = true
  modelRoot.userData.isImportedModel = true
  modelRoot.userData.fileName = 'Building.fbx'
  modelRoot.userData.projectObjectId = 'model-1'
  modelRoot.userData.streetsGLObjectId = 'model-1'

  const pivot = new THREE.Group()
  pivot.userData.isPivotWrapper = true
  pivot.userData.originalModel = modelRoot
  scene.add(pivot)
  pivot.add(modelRoot)

  const descriptor: ProjectObject = {
    id: 'model-1',
    name: 'Building.fbx',
    kind: 'imported',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    visible: true,
    streetsGLObjectId: 'model-1'
  }

  const file = new File([new Uint8Array([1, 2, 3])], 'Building.fbx', {
    type: 'application/octet-stream'
  })

  return { scene, modelRoot, pivot, descriptor, file }
}

describe('deleteUndoBacking (DATA-4)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { useAppStore } = await import('../src/store/useAppStore')
    useAppStore.setState({
      projectObjects: [],
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      streetsGLBridge: null
    })
    fileRegistry.clear()
    removeCachedImportedModelScene('model-1', false)
  })

  afterEach(() => {
    fileRegistry.clear()
    removeCachedImportedModelScene('model-1', false)
  })

  test('soft-delete keeps file/cache ownership on the undo entry and restore brings them back', async () => {
    const { useAppStore } = await import('../src/store/useAppStore')
    const { scene, modelRoot, pivot, descriptor, file } = makeImportedModel()

    useAppStore.getState().addProjectObject(descriptor)
    fileRegistry.registerModelFile('Building.fbx', file)
    cacheImportedModelScene('model-1', modelRoot)

    const backing = captureDeleteUndoBacking({
      objectToRemove: pivot,
      modelRoot,
      deleteWholeModel: true,
      registryId: 'model-1'
    })

    expect(backing.projectObject?.id).toBe('model-1')
    expect(backing.modelFile).toBe(file)
    expect(backing.cachedScene).toBe(modelRoot)
    expect(backing.pivotWrapper).toBe(pivot)

    pivot.userData.originalModel = null
    scene.remove(pivot)

    const soft = applySoftDeleteBacking(backing, null, modelRoot)
    expect(soft.removeProjectObjectId).toBe('model-1')
    useAppStore.setState({
      projectObjects: applyProjectObjectUndoPatch(
        useAppStore.getState().projectObjects,
        soft
      )
    })

    expect(useAppStore.getState().projectObjects).toHaveLength(0)
    expect(fileRegistry.getModelFile('Building.fbx')).toBeUndefined()
    expect(getCachedImportedModelScene('model-1')).toBeUndefined()
    expect(backing.softDeleted).toBe(true)

    scene.add(pivot)
    const restored = restoreDeleteBacking(backing, null)
    useAppStore.setState({
      projectObjects: applyProjectObjectUndoPatch(
        useAppStore.getState().projectObjects,
        restored
      )
    })

    expect(useAppStore.getState().projectObjects.map((o) => o.id)).toEqual(['model-1'])
    expect(fileRegistry.getModelFile('Building.fbx')).toBe(file)
    expect(getCachedImportedModelScene('model-1')).toBe(modelRoot)
    expect(pivot.userData.originalModel).toBe(modelRoot)
    expect(backing.softDeleted).toBe(false)
  })

  test('store undo/redo restores and re-soft-deletes project registry state', async () => {
    const { useAppStore } = await import('../src/store/useAppStore')
    const { scene, modelRoot, pivot, descriptor, file } = makeImportedModel()

    useAppStore.getState().addProjectObject(descriptor)
    fileRegistry.registerModelFile('Building.fbx', file)
    cacheImportedModelScene('model-1', modelRoot)

    const backing = captureDeleteUndoBacking({
      objectToRemove: pivot,
      modelRoot,
      deleteWholeModel: true,
      registryId: 'model-1'
    })
    pivot.userData.originalModel = null

    useAppStore.getState().addToUndoStack({
      type: 'delete',
      object: pivot,
      parent: scene,
      backing
    })
    scene.remove(pivot)
    const soft = applySoftDeleteBacking(backing, null, modelRoot)
    useAppStore.setState({
      projectObjects: applyProjectObjectUndoPatch(
        useAppStore.getState().projectObjects,
        soft
      )
    })

    expect(useAppStore.getState().projectObjects).toHaveLength(0)
    expect(pivot.parent).toBeNull()

    useAppStore.getState().undo()
    expect(pivot.parent).toBe(scene)
    expect(useAppStore.getState().projectObjects.map((o) => o.id)).toEqual(['model-1'])
    expect(fileRegistry.getModelFile('Building.fbx')).toBe(file)
    expect(getCachedImportedModelScene('model-1')).toBe(modelRoot)
    expect(pivot.userData.originalModel).toBe(modelRoot)

    useAppStore.getState().redo()
    expect(pivot.parent).toBeNull()
    expect(useAppStore.getState().projectObjects).toHaveLength(0)
    expect(fileRegistry.getModelFile('Building.fbx')).toBeUndefined()
    expect(getCachedImportedModelScene('model-1')).toBeUndefined()
  })

  test('abandoned delete actions skip restored objects and clean detached ones', () => {
    const live = new THREE.Object3D()
    const parent = new THREE.Object3D()
    parent.add(live)
    const detached = new THREE.Object3D()

    expect(isAbandonedDeleteAction({ type: 'delete', object: live })).toBe(false)
    expect(isAbandonedDeleteAction({ type: 'delete', object: detached })).toBe(true)

    disposeAbandonedDeleteActions([{ type: 'delete', object: live, backing: { softDeleted: true } }])
    expect(live.parent).toBe(parent)

    disposeDeleteUndoBacking({ softDeleted: true }, detached)
    expect(detached.parent).toBeNull()
  })

  test('suspend/resume splat overlay does not revoke the object URL', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const {
      suspendSplatOverlayRoot,
      resumeSplatOverlayRoot,
      disposeSuspendedSplatOverlay
    } = await import('../src/viewer/loaders/splatLoader')

    const container = document.createElement('div')
    document.body.appendChild(container)
    const host = document.createElement('div')
    const frame = document.createElement('iframe')
    host.appendChild(frame)
    container.appendChild(host)

    const root = new THREE.Group()
    const url = 'blob:http://localhost/splat-test'
    root.userData.gaussianSplatOverlay = true
    root.userData.splatOverlayHost = host
    root.userData.splatOverlayFrame = frame
    root.userData.splatRequestId = 'req-1'
    root.userData.splatObjectUrl = url
    root.userData.splatShouldRevoke = true
    root.userData.splatOverlayContainer = container

    const suspended = suspendSplatOverlayRoot(root)
    expect(suspended).not.toBeNull()
    expect(host.parentElement).toBeNull()
    expect(revokeSpy).not.toHaveBeenCalled()

    const resumed = resumeSplatOverlayRoot(suspended!)
    expect(resumed).toBe(true)
    expect(host.parentElement).toBe(container)
    expect(revokeSpy).not.toHaveBeenCalled()

    disposeSuspendedSplatOverlay(suspended!)
    expect(revokeSpy).toHaveBeenCalledWith(url)

    revokeSpy.mockRestore()
    container.remove()
  })
})
