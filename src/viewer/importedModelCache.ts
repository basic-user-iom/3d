import * as THREE from 'three'
import { disposeObject3DSubtree } from './utils/disposeObject3D'

/**
 * In-memory cache of imported model scene roots keyed by projectObject id.
 * Used when city mode has no Three.js scene: models load here, sync to Streets GL,
 * and are re-attached to the viewer scene when leaving city mode.
 *
 * IMPORTANT: ViewerCanvas teardown must NOT dispose these roots (or their textures).
 * City/hybrid mode switches remove the Three.js scene while the same Object3D
 * references stay in this cache for Product-mode restore.
 */
const importedModelScenes = new Map<string, THREE.Object3D>()

export function cacheImportedModelScene(id: string, scene: THREE.Object3D): void {
  importedModelScenes.set(id, scene)
}

export function getCachedImportedModelScene(id: string): THREE.Object3D | undefined {
  return importedModelScenes.get(id)
}

export function removeCachedImportedModelScene(id: string, dispose = true): void {
  const cached = importedModelScenes.get(id)
  if (cached && dispose) {
    disposeObject3DSubtree(cached)
  }
  importedModelScenes.delete(id)
}

export function hasCachedImportedModelScene(id: string): boolean {
  return importedModelScenes.has(id)
}

/** True when `obj` is an exact root stored in the imported-model cache. */
export function isCachedImportedModelRoot(obj: THREE.Object3D): boolean {
  const id = obj.userData?.projectObjectId as string | undefined
  if (!id) return false
  return importedModelScenes.get(id) === obj
}

/**
 * Detach cached imported model roots from a scene graph without disposing GPU resources.
 * Call this before scene teardown so Product-mode restore keeps materials/maps intact.
 *
 * @returns Detached roots (still alive in {@link importedModelScenes}).
 */
export function detachCachedImportedModelsFromScene(scene: THREE.Object3D): THREE.Object3D[] {
  const toDetach: THREE.Object3D[] = []
  scene.traverse((obj) => {
    if (isCachedImportedModelRoot(obj)) {
      toDetach.push(obj)
    }
  })

  const detached: THREE.Object3D[] = []
  for (const obj of toDetach) {
    if (obj.parent) {
      obj.parent.remove(obj)
      detached.push(obj)
    }
  }
  return detached
}

/**
 * Clear city/hybrid product-hide flags so models are visible again in Product mode.
 * Updates live scene objects and every cached imported root (even if not yet reattached).
 */
export function clearStreetsGLProductHideOnCachedModels(): void {
  for (const cached of importedModelScenes.values()) {
    if (cached.userData.renderInStreetsGL) {
      delete cached.userData.renderInStreetsGL
    }
    // Iframe-owned imports were hidden in the Three.js viewer; Product mode must show them.
    if (cached.visible === false) {
      cached.visible = true
    }
  }
}

/** Test-only: wipe the module cache without disposing (avoids leaking across unit tests). */
export function __clearImportedModelCacheForTests(): void {
  importedModelScenes.clear()
}
