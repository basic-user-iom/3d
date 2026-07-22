import type * as THREE from 'three'

/**
 * DATA-2: Collect project-owned scene roots that would be cleared during a load.
 * Lights/cameras/helpers/native groups are left alone.
 */
export function collectProjectOwnedSceneRoots(scene: THREE.Scene): THREE.Object3D[] {
  const roots: THREE.Object3D[] = []
  for (const obj of scene.children) {
    if (isProjectOwnedSceneRoot(obj)) {
      roots.push(obj)
    }
  }
  return roots
}

export function isProjectOwnedSceneRoot(obj: THREE.Object3D): boolean {
  if (
    obj.userData?.isStartingObjectsGroup ||
    obj.userData?.isNativeObjectsGroup ||
    obj.userData?.isPivotWrapper
  ) {
    return false
  }

  const type = obj.type
  if (
    type === 'AmbientLight' ||
    type === 'DirectionalLight' ||
    type === 'PointLight' ||
    type === 'SpotLight' ||
    type === 'HemisphereLight' ||
    type === 'RectAreaLight' ||
    type === 'PerspectiveCamera' ||
    type === 'OrthographicCamera' ||
    type === 'GridHelper' ||
    type === 'AxesHelper' ||
    type === 'TransformControls'
  ) {
    return false
  }

  return Boolean(
    obj.userData?.isModel ||
      obj.userData?.isImportedModel ||
      obj.userData?.isPolygon ||
      obj.userData?.isAutoLoaded ||
      obj.userData?.isPrimitive
  )
}

/**
 * Atomically replace previous project-owned roots with newly restored roots.
 * Roots that appear in both sets (exact object reuse) stay in the scene.
 * Call only after the new roots have been fully prepared off-scene / in staging.
 */
export function commitSceneObjectSwap(
  scene: THREE.Scene,
  previousRoots: readonly THREE.Object3D[],
  nextRoots: readonly THREE.Object3D[]
): void {
  const nextSet = new Set(nextRoots)

  for (const obj of previousRoots) {
    if (nextSet.has(obj)) continue
    if (obj.parent) {
      obj.parent.remove(obj)
    } else {
      scene.remove(obj)
    }
  }

  for (const obj of nextRoots) {
    if (!obj.parent) {
      scene.add(obj)
    } else if (obj.parent !== scene && !scene.children.includes(obj)) {
      obj.parent.remove(obj)
      scene.add(obj)
    }
  }
}

/**
 * Discard staged roots that never made it into the live scene (failed load).
 * Does not touch objects that are already parented under `scene`.
 */
export function discardStagedSceneRoots(
  scene: THREE.Scene,
  stagedRoots: readonly THREE.Object3D[]
): void {
  for (const obj of stagedRoots) {
    if (obj.parent === scene || scene.children.includes(obj)) continue
    if (obj.parent) {
      obj.parent.remove(obj)
    }
  }
}
