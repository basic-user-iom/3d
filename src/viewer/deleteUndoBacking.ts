import type * as THREE from 'three'
import { useAppStore, type ProjectObject } from '../store/useAppStore'
import { fileRegistry } from '../utils/projectPersistence'
import type { StreetsGLBridge } from '../utils/streetsGLBridge'
import {
  cacheImportedModelScene,
  getCachedImportedModelScene,
  removeCachedImportedModelScene
} from './importedModelCache'
import {
  disposeSuspendedSplatOverlays,
  resumeSplatOverlays,
  suspendSplatOverlaysInSubtree
} from './loaders/splatOverlayLifecycle'
import type { SuspendedSplatOverlay } from './loaders/splatLoader'
import { disposeObject3DSubtree } from './utils/disposeObject3D'

/** Max undo entries retained; oldest delete backings are disposed when trimmed. */
export const MAX_UNDO_STACK = 50

function getStreetsGLObjectId(obj: THREE.Object3D): string | undefined {
  const ud = obj.userData as { streetsGLObjectId?: string; projectObjectId?: string }
  return ud.streetsGLObjectId ?? ud.projectObjectId
}

export interface DeleteUndoBacking {
  projectObject?: ProjectObject
  modelFileName?: string
  modelFile?: File
  cacheId?: string
  cachedScene?: THREE.Object3D
  streetsGLObjectId?: string
  modelRoot?: THREE.Object3D
  /** Pivot wrapper whose `originalModel` was cleared on delete. */
  pivotWrapper?: THREE.Object3D | null
  suspendedSplats?: SuspendedSplatOverlay[]
  /** True after soft-delete applied; false after restore. */
  softDeleted?: boolean
}

function cloneProjectObject(descriptor: ProjectObject): ProjectObject {
  return {
    ...descriptor,
    transform: { ...descriptor.transform },
    gps: descriptor.gps ? { ...descriptor.gps } : undefined,
    userData: descriptor.userData ? { ...descriptor.userData } : undefined
  }
}

export interface CaptureDeleteUndoBackingParams {
  objectToRemove: THREE.Object3D
  modelRoot: THREE.Object3D
  deleteWholeModel: boolean
  registryId?: string
}

/**
 * Snapshot registry/file/cache/bridge/splat ownership before a delete so undo can restore it.
 * Call before detaching the object from the scene.
 */
export function captureDeleteUndoBacking(
  params: CaptureDeleteUndoBackingParams
): DeleteUndoBacking {
  const { objectToRemove, modelRoot, deleteWholeModel, registryId } = params
  const backing: DeleteUndoBacking = {
    modelRoot: deleteWholeModel ? modelRoot : undefined,
    softDeleted: false
  }

  if (deleteWholeModel) {
    const parent = modelRoot.parent
    if (parent?.userData?.isPivotWrapper) {
      backing.pivotWrapper = parent
    } else if (objectToRemove.userData?.isPivotWrapper) {
      backing.pivotWrapper = objectToRemove
    }
  }

  if (!registryId) {
    return backing
  }

  const store = useAppStore.getState()
  const descriptor = store.projectObjects.find((o) => o.id === registryId)
  if (descriptor) {
    backing.projectObject = cloneProjectObject(descriptor)
  }

  const fileName =
    ((modelRoot.userData as { fileName?: string }).fileName as string | undefined) ||
    descriptor?.name
  if (fileName) {
    const file = fileRegistry.getModelFile(fileName)
    if (file) {
      backing.modelFileName = fileName
      backing.modelFile = file
    } else {
      backing.modelFileName = fileName
    }
  }

  const cached = getCachedImportedModelScene(registryId)
  if (cached) {
    backing.cacheId = registryId
    backing.cachedScene = cached
  } else if (deleteWholeModel) {
    backing.cacheId = registryId
    backing.cachedScene = modelRoot
  }

  backing.streetsGLObjectId = getStreetsGLObjectId(modelRoot)

  return backing
}

export interface SoftDeleteBackingResult {
  /** Registry id to drop from `projectObjects` (caller merges into store state). */
  removeProjectObjectId?: string
}

export interface RestoreDeleteBackingResult {
  /** Descriptor to upsert into `projectObjects` (caller merges into store state). */
  projectObject?: ProjectObject
}

/**
 * Soft-delete backing state: remove from live registries and suspend splat overlays,
 * but keep ownership on the undo entry for later restore/disposal.
 * Does not mutate zustand state directly — returns the registry id to remove.
 */
export function applySoftDeleteBacking(
  backing: DeleteUndoBacking | undefined,
  streetsGLBridge: StreetsGLBridge | null | undefined,
  splatRoot?: THREE.Object3D | null
): SoftDeleteBackingResult {
  if (!backing || backing.softDeleted) {
    return {}
  }

  const splatTarget = splatRoot || backing.modelRoot || backing.cachedScene
  if (splatTarget) {
    backing.suspendedSplats = suspendSplatOverlaysInSubtree(splatTarget)
  }

  if (backing.cacheId) {
    removeCachedImportedModelScene(backing.cacheId, false)
  }

  if (backing.modelFileName) {
    fileRegistry.unregisterModelFile(backing.modelFileName)
  }

  const streetsId = backing.streetsGLObjectId
  if (streetsGLBridge && streetsId) {
    streetsGLBridge.removeObject(streetsId).catch((err) => {
      console.warn('[DeleteUndo] Streets GL remove failed:', streetsId, err)
    })
  }

  if (backing.modelRoot) {
    ;(backing.modelRoot.userData as { streetsGLAdded?: boolean }).streetsGLAdded = false
  }

  backing.softDeleted = true
  return {
    removeProjectObjectId: backing.projectObject?.id
  }
}

/**
 * Restore registry/file/cache/pivot/splat state after re-attaching the scene object.
 * Does not mutate zustand state directly — returns the descriptor to upsert.
 */
export function restoreDeleteBacking(
  backing: DeleteUndoBacking | undefined,
  streetsGLBridge: StreetsGLBridge | null | undefined
): RestoreDeleteBackingResult {
  if (!backing || !backing.softDeleted) {
    return {}
  }

  if (backing.modelFileName && backing.modelFile) {
    fileRegistry.registerModelFile(backing.modelFileName, backing.modelFile)
  }

  if (backing.cacheId && backing.cachedScene) {
    cacheImportedModelScene(backing.cacheId, backing.cachedScene)
  }

  if (backing.pivotWrapper && backing.modelRoot) {
    backing.pivotWrapper.userData.originalModel = backing.modelRoot
  }

  resumeSplatOverlays(backing.suspendedSplats)
  backing.suspendedSplats = undefined

  const modelForSync = backing.modelRoot || backing.cachedScene
  if (streetsGLBridge && modelForSync) {
    // Dynamic import avoids tightening the useAppStore ↔ useViewer cycle at module init.
    void import('./useViewer')
      .then(({ syncModelToStreetsGL }) => syncModelToStreetsGL(modelForSync, streetsGLBridge))
      .catch((err) => {
        console.warn('[DeleteUndo] Streets GL restore sync failed:', err)
      })
  }

  backing.softDeleted = false
  return {
    projectObject: backing.projectObject
      ? cloneProjectObject(backing.projectObject)
      : undefined
  }
}

function upsertProjectObject(
  projectObjects: ProjectObject[],
  object: ProjectObject
): ProjectObject[] {
  const index = projectObjects.findIndex((o) => o.id === object.id)
  if (index >= 0) {
    const next = projectObjects.slice()
    next[index] = { ...next[index], ...object }
    return next
  }
  return [...projectObjects, object]
}

/** Apply registry upsert/remove results from delete undo/redo into a projectObjects array. */
export function applyProjectObjectUndoPatch(
  projectObjects: ProjectObject[],
  patch: { projectObject?: ProjectObject; removeProjectObjectId?: string }
): ProjectObject[] {
  let next = projectObjects
  if (patch.removeProjectObjectId) {
    next = next.filter((o) => o.id !== patch.removeProjectObjectId)
  }
  if (patch.projectObject) {
    next = upsertProjectObject(next, patch.projectObject)
  }
  return next
}

/**
 * Irreversibly release resources owned by an abandoned delete undo/redo entry.
 * Only call when the scene object is still detached (delete still in effect).
 */
export function disposeDeleteUndoBacking(
  backing: DeleteUndoBacking | undefined,
  object?: THREE.Object3D | null
): void {
  if (!backing) {
    if (object) {
      disposeObject3DSubtree(object)
    }
    return
  }

  disposeSuspendedSplatOverlays(backing.suspendedSplats)
  backing.suspendedSplats = undefined

  // Soft-deleted entries already dropped cache/registry; dispose the detached scene graph.
  const disposeRoot = object || backing.pivotWrapper || backing.modelRoot || backing.cachedScene
  if (disposeRoot) {
    disposeObject3DSubtree(disposeRoot)
  }

  backing.cachedScene = undefined
  backing.modelFile = undefined
  backing.softDeleted = true
}

/** True when a delete undo/redo entry still owns a detached object (safe to dispose). */
export function isAbandonedDeleteAction(action: {
  type: string
  object?: THREE.Object3D
  backing?: DeleteUndoBacking
}): boolean {
  if (action.type !== 'delete' || !action.object) return false
  // Restored objects have a parent again — do not dispose their backing.
  return action.object.parent == null
}

export function disposeAbandonedDeleteActions(
  actions: Array<{ type: string; object?: THREE.Object3D; backing?: DeleteUndoBacking }>
): void {
  for (const action of actions) {
    if (!isAbandonedDeleteAction(action)) continue
    disposeDeleteUndoBacking(action.backing, action.object ?? null)
  }
}

/** Re-apply pivot detach used by delete/redo so the Objects tree stays consistent. */
export function reapplyDeletePivotDetach(backing: DeleteUndoBacking | undefined): void {
  const modelRoot = backing?.modelRoot
  if (!modelRoot) return
  const parent = modelRoot.parent
  if (parent?.userData?.isPivotWrapper) {
    parent.userData.originalModel = null
  }
}
