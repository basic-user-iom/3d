import * as THREE from 'three'

const _box = new THREE.Box3()
const _center = new THREE.Vector3()
const _size = new THREE.Vector3()

function isImportedInteriorMesh(obj: THREE.Object3D): boolean {
  if (!(obj instanceof THREE.Mesh)) return false
  if (!obj.userData.isImportedModel && !obj.userData.isModel) return false
  if (obj.userData.isHelper || obj.userData.isShadowPlane || obj.userData.isGroundedSkybox) {
    return false
  }
  return (
    obj.userData.lightingZone === 'interior' ||
    obj.userData.isInterior === true ||
    obj.userData.interior === true ||
    obj.userData.isInteriorCavity === true
  )
}

function countInteriorMeshes(root: THREE.Object3D): number {
  let count = 0
  root.traverse((obj) => {
    if (isImportedInteriorMesh(obj)) count++
  })
  return count
}

function sceneHasUserRectAreaLight(scene: THREE.Scene): boolean {
  let found = false
  scene.traverse((obj) => {
    if (obj instanceof THREE.RectAreaLight && !obj.userData.isAutoInteriorFill) {
      found = true
    }
  })
  return found
}

/**
 * Soft RectAreaLight fill for engine-bay / cabin interiors.
 * No shadows — complements cavity dimming when global HDR washes cavities.
 */
export function ensureInteriorFillLight(
  scene: THREE.Scene,
  modelRoot: THREE.Object3D
): THREE.RectAreaLight | null {
  if (countInteriorMeshes(modelRoot) < 2) return null
  if (sceneHasUserRectAreaLight(scene)) return null

  const existing = scene.getObjectByProperty('userData.isAutoInteriorFill', true)
  if (existing instanceof THREE.RectAreaLight) {
    return existing
  }

  _box.setFromObject(modelRoot)
  if (_box.isEmpty()) return null

  _box.getCenter(_center)
  _box.getSize(_size)

  const width = Math.max(_size.x * 0.35, 0.4)
  const height = Math.max(_size.y * 0.2, 0.25)
  const intensity = Math.min(Math.max(_size.length() * 0.08, 1.5), 8)

  const fill = new THREE.RectAreaLight(0xfff4e8, intensity, width, height)
  fill.name = 'Auto Interior Fill'
  fill.position.set(_center.x, _center.y - _size.y * 0.15, _center.z)
  fill.lookAt(_center.x, _center.y + _size.y * 0.1, _center.z)
  fill.userData.isAutoInteriorFill = true
  fill.userData.isSystemLight = true

  scene.add(fill)
  return fill
}

export function removeInteriorFillLight(scene: THREE.Scene): void {
  const toRemove: THREE.RectAreaLight[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.RectAreaLight && obj.userData.isAutoInteriorFill) {
      toRemove.push(obj)
    }
  })
  toRemove.forEach((light) => {
    light.removeFromParent()
    light.dispose()
  })
}
