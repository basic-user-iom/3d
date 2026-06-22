/**
 * Object registry reconciler (renderer-agnostic helpers).
 *
 * The Zustand store owns `projectObjects: ProjectObject[]` as the single source of
 * truth for "objects in the project". This module turns those descriptors into the
 * concrete render-target representations:
 *   - product / hybrid: real THREE.Mesh objects added to `viewer.scene`
 *   - city / hybrid:     Streets GL iframe objects (synced via the existing bridge)
 *
 * Keeping these helpers free of React / store-action imports avoids circular deps;
 * orchestration (which targets are live, when to sync) lives in the reconciler
 * component and in the add flow.
 */
import * as THREE from 'three'
import type { ProjectObject, ProjectObjectKind } from '../store/useAppStore'
import { getCachedImportedModelScene } from './importedModelCache'

/**
 * Build the geometry for a primitive descriptor. The `scale` here is the authoring
 * dimension set captured at creation time (baked into geometry), NOT the mesh scale.
 * Mirrors the switch in PrimitivesPanel.createPrimitive so rebuilds match the original.
 */
export function buildPrimitiveGeometry(
  type: string,
  scale: { x: number; y: number; z: number }
): THREE.BufferGeometry {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(scale.x, scale.y, scale.z)
    case 'sphere':
      return new THREE.SphereGeometry(scale.x / 2, 32, 32)
    case 'plane':
      return new THREE.PlaneGeometry(scale.x, scale.y)
    case 'cone':
      return new THREE.ConeGeometry(scale.x / 2, scale.y, 32)
    case 'cylinder':
      return new THREE.CylinderGeometry(scale.x / 2, scale.x / 2, scale.y, 32)
    case 'torus':
      return new THREE.TorusGeometry(scale.x / 2, scale.y / 4, 16, 100)
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(scale.x / 2)
    case 'octahedron':
      return new THREE.OctahedronGeometry(scale.x / 2)
    default:
      return new THREE.BoxGeometry(scale.x, scale.y, scale.z)
  }
}

/**
 * Create a renderer-independent descriptor from a freshly-built mesh.
 * `primitiveScale` is the authoring dimensions used to build the geometry; it is stored
 * in userData so the reconciler can rebuild an identical mesh after a mode switch.
 */
export function descriptorFromMesh(
  mesh: THREE.Mesh,
  opts: {
    id: string
    kind: ProjectObjectKind
    primitiveType?: string
    color?: number
    primitiveScale?: { x: number; y: number; z: number }
    extraUserData?: Record<string, any>
  }
): ProjectObject {
  const ud = mesh.userData as any
  const gps =
    typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number'
      ? { lat: ud.gpsLat as number, lon: ud.gpsLon as number }
      : undefined
  return {
    id: opts.id,
    name: mesh.name,
    kind: opts.kind,
    primitiveType: opts.primitiveType,
    color: opts.color,
    transform: {
      position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
    },
    gps,
    visible: mesh.visible,
    threeObjectId: mesh.id,
    streetsGLObjectId: ud.streetsGLObjectId,
    userData: {
      primitiveScale: opts.primitiveScale,
      ...(opts.extraUserData || {})
    }
  }
}

export function descriptorFromImportedModel(
  scene: THREE.Object3D,
  opts: {
    id: string
    fileName: string
    fileUrl?: string
    extraUserData?: Record<string, any>
  }
): ProjectObject {
  const ud = scene.userData as any
  const gps =
    typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number'
      ? { lat: ud.gpsLat as number, lon: ud.gpsLon as number }
      : undefined
  return {
    id: opts.id,
    name: scene.name || opts.fileName,
    kind: 'imported',
    transform: {
      position: { x: scene.position.x, y: scene.position.y, z: scene.position.z },
      rotation: { x: scene.rotation.x, y: scene.rotation.y, z: scene.rotation.z },
      scale: { x: scene.scale.x, y: scene.scale.y, z: scene.scale.z }
    },
    gps,
    visible: scene.visible !== false,
    threeObjectId: scene.id,
    streetsGLObjectId: ud.streetsGLObjectId || opts.id,
    userData: {
      fileName: opts.fileName,
      fileUrl: opts.fileUrl,
      ...(opts.extraUserData || {})
    }
  }
}

/**
 * Rebuild a live THREE.Mesh from a descriptor. Used when a Three.js scene becomes
 * available (e.g. leaving city mode) and a descriptor has no live object yet.
 * Primitives rebuild from stored dimensions; imported models restore from the in-memory cache.
 */
export function buildMeshFromDescriptor(descriptor: ProjectObject): THREE.Mesh | null {
  if (descriptor.kind === 'imported') {
    const cached = getCachedImportedModelScene(descriptor.id)
    if (!cached) return null
    cached.name = descriptor.name
    cached.userData.projectObjectId = descriptor.id
    cached.userData.streetsGLObjectId = descriptor.streetsGLObjectId || descriptor.id
    if (descriptor.userData) {
      for (const [key, value] of Object.entries(descriptor.userData)) {
        cached.userData[key] = value
      }
    }
    const t = descriptor.transform
    cached.position.set(t.position.x, t.position.y, t.position.z)
    cached.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z)
    cached.scale.set(t.scale.x, t.scale.y, t.scale.z)
    cached.visible = descriptor.visible
    cached.updateMatrixWorld(true)
    // Return first mesh child for API compatibility, or wrap — reconciler uses Object3D add.
    return cached as unknown as THREE.Mesh
  }

  if (descriptor.kind !== 'primitive' || !descriptor.primitiveType) {
    return null
  }
  const dims = (descriptor.userData?.primitiveScale as { x: number; y: number; z: number } | undefined) || {
    x: 1,
    y: 1,
    z: 1
  }
  const geometry = buildPrimitiveGeometry(descriptor.primitiveType, dims)
  const material = new THREE.MeshStandardMaterial({ color: descriptor.color ?? 0x888888 })
  if (descriptor.primitiveType === 'plane') {
    material.side = THREE.DoubleSide
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = descriptor.name
  mesh.castShadow = true
  mesh.receiveShadow = true

  // Same flags as the original add path so it is selectable / draggable / listed.
  mesh.userData.isModel = true
  mesh.userData.isImportedModel = true
  mesh.userData.isPrimitive = true
  mesh.userData.primitiveType = descriptor.primitiveType
  mesh.userData.projectObjectId = descriptor.id
  if (descriptor.streetsGLObjectId) {
    mesh.userData.streetsGLObjectId = descriptor.streetsGLObjectId
  }
  if (descriptor.gps) {
    mesh.userData.gpsLat = descriptor.gps.lat
    mesh.userData.gpsLon = descriptor.gps.lon
  }
  // Restore any extra userData (e.g. streetsGLAdded, streetsGLPosition, mapCenter*).
  if (descriptor.userData) {
    for (const [key, value] of Object.entries(descriptor.userData)) {
      if (key === 'primitiveScale') continue
      mesh.userData[key] = value
    }
  }

  const t = descriptor.transform
  mesh.position.set(t.position.x, t.position.y, t.position.z)
  mesh.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z)
  mesh.scale.set(t.scale.x, t.scale.y, t.scale.z)
  mesh.visible = descriptor.visible
  mesh.updateMatrixWorld(true)
  return mesh
}

/** Find a live scene object that represents the given descriptor id, if any. */
export function findSceneObjectByProjectId(
  root: THREE.Object3D,
  id: string
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((obj) => {
    if (!found && (obj.userData as any).projectObjectId === id) {
      found = obj
    }
  })
  return found
}

export interface ReconcileSceneResult {
  rebuilt: THREE.Object3D[]
}

/**
 * Ensure every descriptor that can be rebuilt has a live object in the scene.
 * Objects already present (matched by userData.projectObjectId) are left untouched,
 * so this is safe to run repeatedly and never duplicates.
 */
export function reconcileSceneFromRegistry(
  scene: THREE.Object3D,
  projectObjects: ProjectObject[]
): ReconcileSceneResult {
  const rebuilt: THREE.Object3D[] = []
  for (const descriptor of projectObjects) {
    if (findSceneObjectByProjectId(scene, descriptor.id)) {
      continue
    }
    const obj = buildMeshFromDescriptor(descriptor)
    if (!obj) continue
    scene.add(obj)
    rebuilt.push(obj)
  }
  return { rebuilt }
}
