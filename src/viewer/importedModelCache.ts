import * as THREE from 'three'
import { disposeObject3DSubtree } from './utils/disposeObject3D'

/**
 * In-memory cache of imported model scene roots keyed by projectObject id.
 * Used when city mode has no Three.js scene: models load here, sync to Streets GL,
 * and are re-attached to the viewer scene when leaving city mode.
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
