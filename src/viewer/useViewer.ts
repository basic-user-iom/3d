import { useCallback } from 'react'
import * as THREE from 'three'
import { ViewerInstance } from './ViewerCanvas'
import { loadModel, LoadSource } from './loaders'
import { disposeSplatOverlay } from './loaders/disposeSplatOverlay'
import { shadowOpacityModifierRegistry } from './materials/ShadowOpacityModifierRegistry'
import { latLonToWorld, latLonToStreetsGL, streetsGLToLatLon } from '../utils/mapCoordinates'
import { useAppStore } from '../store/useAppStore'
import type { ProjectObject, RoomInfo } from '../store/useAppStore'
import { StreetsGLBridge } from '../utils/streetsGLBridge'
import { fileRegistry } from '../utils/projectPersistence'
import { calculateMaterialIntensity } from './utils/materialIntensityHelper'
import { cacheImportedModelScene } from './importedModelCache'
import { descriptorFromImportedModel } from './objectRegistry'
import { attachModelAnimations } from './utils/modelAnimations'
import { buildScenePickBVH } from '../utils/lodBVHManager'
import { syncHdrShadowPlaneInScene, forceHdrSunShadowState } from './utils/hdrGroundShadowCatcher'
import { wakeViewerRender } from './utils/wakeViewerRender'

export interface LoadedModel {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
  userData?: any
}

export type { LoadSource }

const isStreetsGLDebugEnabled = (): boolean =>
  typeof window !== 'undefined' && (window as any).__streetsGLDebug === true

const streetsGLDebugLog = (...args: any[]): void => {
  if (isStreetsGLDebugEnabled()) {
    console.log(...args)
  }
}

// Shared singleton state so all components reference the same viewer instance
let sharedViewer: ViewerInstance | null = null

// Single source of truth for the Three.js -> Streets GL object scale.
// Streets GL world units are meters, so 1 keeps objects at their real-world size.
export const STREETS_GL_OBJECT_SCALE = 1

/** Default local authoring offset used when mirroring Streets GL absolute positions into the registry. */
const STREETS_GL_DEFAULT_LOCAL_OFFSET = { x: 0, y: 1.5, z: 0 }

/** Reject Mercator coords that would place objects off-map or break culling. */
export const STREETS_GL_MERCATOR_ABS_MAX = 20_037_508

type Vec3 = { x: number; y: number; z: number }

const _streetsGLTargetWorld = new THREE.Vector3()
const _streetsGLLocalPos = new THREE.Vector3()

/**
 * Resolve whether an object should render in the Streets GL iframe.
 * Hybrid/city imports hide the Three.js root (visible=false) while still expecting
 * iframe rendering — do not propagate that flag to bridge updates.
 */
export function getStreetsGLVisibleFromObject(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): boolean {
  const ud = obj.userData as any
  if (ud.renderInStreetsGL === true) {
    return ud.streetsGLVisible !== false
  }
  const descriptorVisible = descriptor?.visible
  if (descriptorVisible === false) return false
  return obj.visible !== false
}

/**
 * Validate Web-Mercator position before sync. Returns null when coords are unusable.
 */
export function validateStreetsGLMercatorPosition(
  position: Vec3,
  context?: { objectId?: string; source?: string }
): Vec3 | null {
  const { x, y, z } = position
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    console.warn('[StreetsGLSync] Rejected invalid Mercator position (NaN/Infinity):', {
      ...context,
      position
    })
    return null
  }

  const absMax = STREETS_GL_MERCATOR_ABS_MAX
  if (Math.abs(x) > absMax || Math.abs(z) > absMax) {
    console.warn('[StreetsGLSync] Rejected off-map Mercator position:', {
      ...context,
      position,
      absMax
    })
    return null
  }

  if (Math.abs(y) > 50_000) {
    console.warn('[StreetsGLSync] Suspicious Mercator altitude — clamping Y:', {
      ...context,
      position
    })
    return { x, y: Math.sign(y) * 50_000, z }
  }

  return { x, y, z }
}

const _streetsGLWorldPos = new THREE.Vector3()
const _streetsGLWorldQuat = new THREE.Quaternion()
const _streetsGLWorldEuler = new THREE.Euler()
const _streetsGLBakeMatrix = new THREE.Matrix4()
const _streetsGLBakeParentInv = new THREE.Matrix4()
const _streetsGLBakePos = new THREE.Vector3()
const _streetsGLBakeQuat = new THREE.Quaternion()
const _streetsGLBakeScale = new THREE.Vector3()

/** World-space euler rotation for Streets GL iframe sync (includes pivot-wrapper rotation). */
export function getStreetsGLWorldRotationFromObject(obj: THREE.Object3D): Vec3 {
  obj.updateMatrixWorld(true)
  obj.getWorldQuaternion(_streetsGLWorldQuat)
  _streetsGLWorldEuler.setFromQuaternion(_streetsGLWorldQuat, obj.rotation.order)
  return { x: _streetsGLWorldEuler.x, y: _streetsGLWorldEuler.y, z: _streetsGLWorldEuler.z }
}

/**
 * Local rotation to persist in the registry when a pivot wrapper owns the gizmo rotation.
 * Decomposes world rotation relative to the pivot's parent so reload matches the baked pose.
 */
export function getStreetsGLRegistryRotationFromObject(obj: THREE.Object3D): Vec3 {
  const pivot = obj.parent?.userData?.isPivotWrapper ? obj.parent : null
  if (!pivot) {
    return { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
  }

  obj.updateMatrixWorld(true)
  _streetsGLBakeMatrix.copy(obj.matrixWorld)
  const pivotParent = pivot.parent
  if (pivotParent) {
    pivotParent.updateMatrixWorld(true)
    _streetsGLBakeParentInv.copy(pivotParent.matrixWorld).invert()
    _streetsGLBakeMatrix.premultiply(_streetsGLBakeParentInv)
  }
  _streetsGLBakeMatrix.decompose(_streetsGLBakePos, _streetsGLBakeQuat, _streetsGLBakeScale)
  _streetsGLWorldEuler.setFromQuaternion(_streetsGLBakeQuat, obj.rotation.order)
  return { x: _streetsGLWorldEuler.x, y: _streetsGLWorldEuler.y, z: _streetsGLWorldEuler.z }
}

/** Resolve the Streets GL bridge object id from a mesh or registry proxy. */
export function getStreetsGLObjectId(obj: THREE.Object3D): string | undefined {
  const ud = obj.userData as any
  return (ud.streetsGLObjectId ?? ud.projectObjectId) as string | undefined
}

/**
 * True when numeric transform edits should sync to the Streets GL iframe (city proxies or hybrid overlay).
 */
export function shouldSyncTransformToStreetsGL(): boolean {
  const store = useAppStore.getState()
  if (!store.streetsGLIframeOverlay || !store.streetsGLBridge) return false
  if (store.renderMode === 'city') return true
  return store.renderMode === 'hybrid'
}

/** True when object focus should navigate the Streets GL map (not the Three.js camera). */
export function shouldUseStreetsGLFocus(): boolean {
  const store = useAppStore.getState()
  if (!store.streetsGLIframeOverlay || !store.streetsGLBridge) return false
  return store.renderMode === 'city' || store.renderMode === 'hybrid'
}

/**
 * Resolve the object + registry descriptor used for Streets GL focus.
 * Walks up to the root model / proxy that owns projectObjectId or placement metadata.
 */
export function resolveFocusTarget(
  object: THREE.Object3D
): { object: THREE.Object3D; descriptor?: ProjectObject } {
  const store = useAppStore.getState()
  let current: THREE.Object3D | null = object
  let bestWithCoords: THREE.Object3D = object

  while (current) {
    const ud = current.userData as any
    const projectId = ud?.projectObjectId as string | undefined
    if (projectId) {
      const descriptor = store.projectObjects.find((p) => p.id === projectId)
      return { object: current, descriptor }
    }
    if (
      ud?.streetsGLPosition ||
      (typeof ud?.gpsLat === 'number' && typeof ud?.gpsLon === 'number')
    ) {
      bestWithCoords = current
    }
    current = current.parent
  }

  const ud = bestWithCoords.userData as any
  const projectId = ud?.projectObjectId as string | undefined
  const descriptor = projectId
    ? store.projectObjects.find((p) => p.id === projectId)
    : undefined
  return { object: bestWithCoords, descriptor }
}

/** Three.js position captured when streetsGLPosition was first assigned (anchor for offsets). */
export function captureStreetsGLBaseTransform(model: THREE.Object3D): void {
  const ud = model.userData as any
  model.updateMatrixWorld(true)
  if (!ud.streetsGLBaseTransform) {
    ud.streetsGLBaseTransform = {
      position: { x: model.position.x, y: model.position.y, z: model.position.z }
    }
  }
  if (!ud.streetsGLPlacementWorldPosition) {
    model.getWorldPosition(_streetsGLWorldPos)
    ud.streetsGLPlacementWorldPosition = {
      x: _streetsGLWorldPos.x,
      y: _streetsGLWorldPos.y,
      z: _streetsGLWorldPos.z
    }
  }
}

function getStreetsGLBaseTransform(obj: THREE.Object3D, descriptor?: ProjectObject): Vec3 {
  const ud = obj.userData as any
  const fromUserData = ud.streetsGLBaseTransform?.position as Vec3 | undefined
  const fromDescriptor = descriptor?.userData?.streetsGLBaseTransform?.position as Vec3 | undefined
  return fromUserData ?? fromDescriptor ?? { x: 0, y: 1.5, z: 0 }
}

function getStreetsGLPlacementWorld(obj: THREE.Object3D, descriptor?: ProjectObject): Vec3 | undefined {
  const ud = obj.userData as any
  const fromUserData = ud.streetsGLPlacementWorldPosition as Vec3 | undefined
  const fromDescriptor = descriptor?.userData?.streetsGLPlacementWorldPosition as Vec3 | undefined
  return fromUserData ?? fromDescriptor
}

/**
 * Compute absolute Web-Mercator position for a project object (proxy or live mesh).
 * Uses stored streetsGLPosition + offset from the placement-time base transform when available.
 */
export function computeStreetsGLPositionFromObject(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): Vec3 {
  const store = useAppStore.getState()
  const ud = obj.userData as any
  const stored = (ud.streetsGLPosition ?? descriptor?.userData?.streetsGLPosition) as Vec3 | undefined

  if (stored && typeof stored.x === 'number' && typeof stored.z === 'number') {
    const placementWorld = getStreetsGLPlacementWorld(obj, descriptor)
    if (placementWorld) {
      // Use world-space delta so pivot-wrapper transforms (gizmo moves pivot, not model.local) sync correctly.
      obj.updateMatrixWorld(true)
      obj.getWorldPosition(_streetsGLWorldPos)
      return {
        x: stored.x + (_streetsGLWorldPos.x - placementWorld.x),
        y: stored.y + (_streetsGLWorldPos.y - placementWorld.y),
        z: stored.z + (_streetsGLWorldPos.z - placementWorld.z)
      }
    }

    const base = getStreetsGLBaseTransform(obj, descriptor)
    // streetsGLPosition is the immutable placement anchor; apply Three.js offset from base.
    return {
      x: stored.x + (obj.position.x - base.x),
      y: stored.y + (obj.position.y - base.y),
      z: stored.z + (obj.position.z - base.z)
    }
  }

  const mapLat = ud.gpsLat ?? descriptor?.gps?.lat ?? store.streetsGLGroundLat ?? 32.89917
  const mapLon = ud.gpsLon ?? descriptor?.gps?.lon ?? store.streetsGLGroundLon ?? -97.03813
  const objectHeight = typeof obj.position.y === 'number' ? obj.position.y : 1.5
  const mapCenter = latLonToStreetsGL(mapLat, mapLon, objectHeight)
  const isAtOrigin =
    Math.abs(obj.position.x) < 0.1 &&
    Math.abs(obj.position.y) < 0.1 &&
    Math.abs(obj.position.z) < 0.1

  if (isAtOrigin) {
    return latLonToStreetsGL(mapLat, mapLon, objectHeight)
  }

  return {
    x: mapCenter.x + obj.position.x,
    y: mapCenter.y + obj.position.y,
    z: mapCenter.z + obj.position.z
  }
}

/** Resolve lat/lon for focus/navigation from a proxy or live mesh. */
export function resolveObjectFocusLatLon(
  object: THREE.Object3D,
  descriptor?: ProjectObject
): { lat: number; lon: number } | null {
  const ud = object.userData as any
  const streetsGLPos = ud.streetsGLPosition ?? descriptor?.userData?.streetsGLPosition

  // Prefer streetsGLPosition + current transform (accurate after moves).
  if (streetsGLPos && typeof streetsGLPos.x === 'number' && typeof streetsGLPos.z === 'number') {
    try {
      const currentPos = computeStreetsGLPositionFromObject(object, descriptor)
      const ll = streetsGLToLatLon(currentPos.x, currentPos.z)
      if (Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) {
        return ll
      }
    } catch {
      /* fall through */
    }
  }

  let lat: number | undefined = typeof ud.gpsLat === 'number' ? ud.gpsLat : undefined
  let lon: number | undefined = typeof ud.gpsLon === 'number' ? ud.gpsLon : undefined
  if ((lat == null || lon == null) && descriptor?.gps) {
    lat = descriptor.gps.lat
    lon = descriptor.gps.lon
  }
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon }
  }

  try {
    const currentPos = computeStreetsGLPositionFromObject(object, descriptor)
    const ll = streetsGLToLatLon(currentPos.x, currentPos.z)
    if (Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) {
      return ll
    }
  } catch {
    /* no coords */
  }

  return null
}

/** Place the manipulator mesh at the object's absolute Streets GL world position. */
export function syncManipulatorFromProxy(
  proxy: THREE.Object3D,
  manipulator: THREE.Object3D,
  descriptor?: ProjectObject
): void {
  const pos = computeStreetsGLPositionFromObject(proxy, descriptor)
  manipulator.position.set(pos.x, pos.y, pos.z)
  manipulator.rotation.copy(proxy.rotation)
  manipulator.scale.copy(proxy.scale)
  manipulator.updateMatrixWorld()
}

/** Apply Streets GL world-space transform from the overlay manipulator back onto a registry proxy. */
export function applyStreetsGLWorldToProxy(
  proxy: THREE.Object3D,
  worldPosition: Vec3,
  rotation?: Vec3,
  scale?: Vec3
): void {
  const store = useAppStore.getState()
  const projectId = proxy.userData.projectObjectId as string | undefined
  const descriptor = projectId ? store.projectObjects.find((p) => p.id === projectId) : undefined
  const ud = proxy.userData as any
  const stored = (ud.streetsGLPosition ?? descriptor?.userData?.streetsGLPosition) as Vec3 | undefined
  const base = getStreetsGLBaseTransform(proxy, descriptor)

  if (stored && typeof stored.x === 'number' && typeof stored.z === 'number') {
    const placementWorld = getStreetsGLPlacementWorld(proxy, descriptor)
    if (placementWorld) {
      _streetsGLTargetWorld.set(
        placementWorld.x + (worldPosition.x - stored.x),
        placementWorld.y + (worldPosition.y - stored.y),
        placementWorld.z + (worldPosition.z - stored.z)
      )
      if (proxy.parent) {
        proxy.parent.updateMatrixWorld(true)
        _streetsGLLocalPos.copy(_streetsGLTargetWorld)
        proxy.parent.worldToLocal(_streetsGLLocalPos)
        proxy.position.copy(_streetsGLLocalPos)
      } else {
        proxy.position.copy(_streetsGLTargetWorld)
      }
    } else {
      proxy.position.set(
        base.x + (worldPosition.x - stored.x),
        base.y + (worldPosition.y - stored.y),
        base.z + (worldPosition.z - stored.z)
      )
    }
  } else {
    // Proxy stores local authoring coords — invert the map-center fallback used by
    // computeStreetsGLPositionFromObject instead of writing absolute Web Mercator values.
    const mapLat = ud.gpsLat ?? descriptor?.gps?.lat ?? store.streetsGLGroundLat ?? 32.89917
    const mapLon = ud.gpsLon ?? descriptor?.gps?.lon ?? store.streetsGLGroundLon ?? -97.03813
    const objectHeight = typeof base.y === 'number' ? base.y : 1.5
    const mapCenter = latLonToStreetsGL(mapLat, mapLon, objectHeight)
    proxy.position.set(
      worldPosition.x - mapCenter.x,
      worldPosition.y - mapCenter.y,
      worldPosition.z - mapCenter.z
    )
  }

  if (rotation) {
    proxy.rotation.set(rotation.x, rotation.y, rotation.z)
  }
  if (scale) {
    proxy.scale.set(scale.x, scale.y, scale.z)
  }
  proxy.updateMatrixWorld()
}

/**
 * Push transform changes from a registry proxy (or mesh) to the project store and Streets GL bridge.
 * Used in city mode where ViewerCanvas / TransformControls are unavailable.
 */
export function syncProjectObjectTransformToStreetsGL(obj: THREE.Object3D): void {
  const store = useAppStore.getState()
  const bridge = store.streetsGLBridge
  if (!bridge) return
  const ud = obj.userData as any
  const projectId = ud.projectObjectId as string | undefined
  const objectId = getStreetsGLObjectId(obj)
  if (!objectId) return

  const descriptor = projectId ? store.projectObjects.find((p) => p.id === projectId) : undefined
  // Backfill placement anchor fields when missing (legacy projects saved before placementWorld existed).
  captureStreetsGLBaseTransform(obj)

  ud.streetsGLPosition = ud.streetsGLPosition ?? descriptor?.userData?.streetsGLPosition
  const rawPosition = computeStreetsGLPositionFromObject(obj, descriptor)
  const position = validateStreetsGLMercatorPosition(rawPosition, {
    objectId,
    source: 'syncProjectObjectTransformToStreetsGL'
  })
  if (!position) return

  const rotation = getStreetsGLWorldRotationFromObject(obj)
  const registryRotation = getStreetsGLRegistryRotationFromObject(obj)
  const scale = {
    x: obj.scale.x * STREETS_GL_OBJECT_SCALE,
    y: obj.scale.y * STREETS_GL_OBJECT_SCALE,
    z: obj.scale.z * STREETS_GL_OBJECT_SCALE
  }

  let gps: { lat: number; lon: number } | undefined = descriptor?.gps
  try {
    const { lat, lon } = streetsGLToLatLon(position.x, position.z)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      ud.gpsLat = lat
      ud.gpsLon = lon
      gps = { lat, lon }
    }
  } catch {
    /* keep prior gps */
  }

  if (projectId) {
    store.updateProjectObject(projectId, {
      transform: {
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: registryRotation,
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
      },
      gps,
      userData: {
        ...(descriptor?.userData || {}),
        streetsGLBaseTransform: ud.streetsGLBaseTransform ?? descriptor?.userData?.streetsGLBaseTransform,
        streetsGLPlacementWorldPosition:
          ud.streetsGLPlacementWorldPosition ?? descriptor?.userData?.streetsGLPlacementWorldPosition,
        streetsGLAdded: true
      }
    })
  }

  bridge
    .updateObject(objectId, {
      position,
      rotation,
      scale,
      visible: getStreetsGLVisibleFromObject(obj, descriptor)
    })
    .catch((err) => console.warn('[CityTransform] Failed to sync transform to Streets GL:', err))
}

/**
 * Read external objects already present in the Streets GL iframe and merge them into
 * projectObjects so they appear in the object tree and can be hidden/moved.
 */
export async function mergeStreetsGLObjectsIntoRegistry(
  bridge: StreetsGLBridge
): Promise<number> {
  const objects = await bridge.getObjects()
  if (!objects.length) return 0

  const store = useAppStore.getState()
  const knownIds = new Set<string>()
  for (const p of store.projectObjects) {
    knownIds.add(p.id)
    if (p.streetsGLObjectId) knownIds.add(p.streetsGLObjectId)
  }

  let merged = 0
  for (const obj of objects) {
    if (knownIds.has(obj.id)) continue

    let gps: { lat: number; lon: number } | undefined
    try {
      const ll = streetsGLToLatLon(obj.position.x, obj.position.z)
      if (Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) {
        gps = { lat: ll.lat, lon: ll.lon }
      }
    } catch {
      /* keep undefined */
    }

    store.addProjectObject({
      id: obj.id,
      name: (obj.metadata?.name as string) || `Streets GL ${obj.type || 'object'}`,
      kind: 'other',
      transform: {
        position: { ...STREETS_GL_DEFAULT_LOCAL_OFFSET },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: {
          x: obj.scale.x / STREETS_GL_OBJECT_SCALE,
          y: obj.scale.y / STREETS_GL_OBJECT_SCALE,
          z: obj.scale.z / STREETS_GL_OBJECT_SCALE
        }
      },
      gps,
      visible: obj.visible !== false,
      streetsGLObjectId: obj.id,
      userData: {
        streetsGLAdded: true,
        streetsGLPosition: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        streetsGLBaseTransform: { position: { ...STREETS_GL_DEFAULT_LOCAL_OFFSET } },
        streetsGLPlacementWorldPosition: { ...STREETS_GL_DEFAULT_LOCAL_OFFSET },
        externalType: obj.type,
        externalMetadata: obj.metadata
      }
    })
    merged++
  }

  if (merged > 0) {
    store.markSceneRevision()
    streetsGLDebugLog('[StreetsGLSync] Merged pre-existing iframe objects into registry:', merged)
  }
  return merged
}

/** Mirror Streets GL placement (GPS, transform) from a loaded model back into the registry. */
function mirrorImportedModelPlacementToRegistry(objectId: string, scene: THREE.Object3D): void {
  const ud = scene.userData as any
  const gps =
    typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number'
      ? { lat: ud.gpsLat as number, lon: ud.gpsLon as number }
      : undefined
  const store = useAppStore.getState()
  store.updateProjectObject(objectId, {
    gps,
    streetsGLObjectId: ud.streetsGLObjectId || objectId,
    transform: {
      position: { x: scene.position.x, y: scene.position.y, z: scene.position.z },
      rotation: { x: scene.rotation.x, y: scene.rotation.y, z: scene.rotation.z },
      scale: { x: scene.scale.x, y: scene.scale.y, z: scene.scale.z }
    },
    userData: {
      streetsGLAdded: ud.streetsGLAdded === true,
      streetsGLPending: false,
      streetsGLPosition: ud.streetsGLPosition,
      streetsGLBaseTransform: ud.streetsGLBaseTransform,
      streetsGLPlacementWorldPosition: ud.streetsGLPlacementWorldPosition,
      fileName: ud.fileName
    }
  })
  store.markSceneRevision()
}

/**
 * Register an imported model in projectObjects and cache its scene for city-mode rebuilds.
 * Does not sync to Streets GL — callers invoke positionModelOnGround separately.
 */
export function registerImportedModelInRegistry(
  scene: THREE.Object3D,
  fileName: string,
  options: { fileUrl?: string; markStreetsGLPending?: boolean } = {}
): string {
  const ud = scene.userData as any
  const objectId =
    ud.projectObjectId ||
    ud.streetsGLObjectId ||
    `obj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

  ud.projectObjectId = objectId
  ud.streetsGLObjectId = objectId
  cacheImportedModelScene(objectId, scene)

  const store = useAppStore.getState()
  if (!store.projectObjects.some((o) => o.id === objectId)) {
    store.addProjectObject(
      descriptorFromImportedModel(scene, {
        id: objectId,
        fileName,
        fileUrl: options.fileUrl,
        // Pending ≠ added: reconciler must still sync if positionModelOnGround never ran.
        extraUserData: options.markStreetsGLPending ? { streetsGLPending: true } : {}
      })
    )
    store.markSceneRevision()
  } else {
    store.updateProjectObject(objectId, { visible: true })
  }
  return objectId
}

/** Apply minimal metadata flags shared by file and URL import paths. */
function tagImportedModelScene(scene: THREE.Object3D, fileName: string, extras: Record<string, any> = {}): void {
  scene.userData.isModel = true
  scene.userData.isAutoLoaded = extras.isAutoLoaded === true
  scene.userData.excludeFromSkyModifications = true
  scene.userData.excludeFromWeatherModifications = true
  if (!scene.name || scene.name === '') {
    scene.name = fileName
  }
  scene.userData.fileName = fileName
  Object.assign(scene.userData, extras)
  scene.traverse((child) => {
    child.userData.isImportedModel = true
    child.userData.excludeFromSkyModifications = true
    child.userData.excludeFromWeatherModifications = true
    if (child instanceof THREE.Mesh) {
      child.visible = true
      delete child.userData.interiorHiddenByViewer
      delete child.userData.preHideVisible
      delete child.userData.wasInteriorHidden
    }
  })
}

// Export function to get shared viewer (for bug fixes and utilities)
export function getSharedViewer(): ViewerInstance | null {
  return sharedViewer
}

/**
 * Clear the shared viewer when the viewer canvas is disposed (e.g. switching to city mode).
 * Without this, sharedViewer points to a disposed renderer with an emptied scene, so
 * primitive-add paths would add meshes to a dead, unrendered scene.
 *
 * Pass the viewer instance being disposed so we only clear when it still matches the
 * current shared viewer. This avoids clobbering a freshly-mounted viewer during a
 * remount race (new viewer registered before the old one's cleanup runs).
 */
export function clearSharedViewer(viewer?: ViewerInstance | null): void {
  if (viewer && sharedViewer !== viewer) {
    // A newer viewer is already registered; don't clear it.
    return
  }
  sharedViewer = null
  if (typeof window !== 'undefined') {
    ;(window as any).sharedViewer = null
  }
  try {
    console.warn('[ViewerInit] sharedViewer cleared on viewer dispose (city mode / unmount)')
  } catch {}
}

/**
 * Industry-standard: Comprehensive texture disposal helper
 * Disposes all textures from a material to prevent memory leaks
 * This function follows Three.js best practices for resource cleanup
 * Shared across all viewer modules to avoid code duplication
 */
export function disposeTexturesFromMaterial(material: THREE.Material): void {
  if (!material) return
  
  // Get all texture properties from the material
  // This includes all standard PBR textures and custom textures
  const textureProperties = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
    'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
    'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
    'specularIntensityMap', 'specularColorMap', 'envMap', 'envMapIntensity'
  ]
  
  // Dispose each texture if it exists
  textureProperties.forEach(prop => {
    const texture = (material as any)[prop] as THREE.Texture | undefined
    if (texture && texture instanceof THREE.Texture) {
      try {
        if (typeof texture.dispose === 'function') {
          texture.dispose()
        }
        (material as any)[prop] = null
      } catch (e) {
        // Ignore disposal errors (texture may already be disposed)
        console.debug(`Warning: Could not dispose texture ${prop}:`, e)
      }
    }
  })
  
  // Also check for any additional texture properties that might exist
  // This catches custom or non-standard texture maps
  Object.keys(material).forEach(key => {
    const value = (material as any)[key]
    if (value instanceof THREE.Texture) {
      try {
        if (typeof value.dispose === 'function') {
          value.dispose()
        }
        (material as any)[key] = null
      } catch (e) {
        console.debug(`Warning: Could not dispose custom texture ${key}:`, e)
      }
    }
  })
}

function removePreviousModel(scene: THREE.Scene, replaceExisting: boolean = true) {
  if (!replaceExisting) {
    return
  }

  const objectsToRemove: THREE.Object3D[] = []
  scene.traverse((object) => {
    // Only remove user-imported models, NOT auto-loaded models (like the car)
    // Auto-loaded models have isAutoLoaded flag or are in a specific group
    if ((object as any).userData?.isModel && !(object as any).userData?.isAutoLoaded) {
      // Also check if it's the starting objects group (which contains the car)
      if (!(object as any).userData?.isStartingObjectsGroup) {
      objectsToRemove.push(object)
      }
    }
  })
  objectsToRemove.forEach((obj) => {

    scene.remove(obj)
    // Tear down any Gaussian splat iframe overlay before disposing the subtree,
    // otherwise the full-screen overlay stays on top of the viewport forever.
    disposeSplatOverlay(obj)
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Industry-standard: Dispose geometry first
        if (child.geometry) {
          try {
            child.geometry.dispose()
          } catch (e) {
            console.debug('Warning: Could not dispose geometry:', e)
          }
        }
        
        // Industry-standard: Dispose all textures from materials before disposing materials
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat instanceof THREE.Material) {
              disposeTexturesFromMaterial(mat)
              try {
                mat.dispose()
              } catch (e) {
                console.debug('Warning: Could not dispose material:', e)
              }
            }
          })
        } else if (child.material instanceof THREE.Material) {
          disposeTexturesFromMaterial(child.material)
          try {
            child.material.dispose()
          } catch (e) {
            console.debug('Warning: Could not dispose material:', e)
          }
        }
      }
    })
  })
}

/**
 * Position a model with default starting settings and snap it to ground
 * Default rotation and scale for imported models (optimized for car models)
 * The model will be positioned so its lowest point (tires) are at Y=0 (ground plane)
 * 
 * @param model The 3D model to position
 * @param useMapCoordinates If true, position at map center (lat/lon). If false, use fixed world coordinates.
 * @param mapLat Optional latitude for map positioning (defaults to store value)
 * @param mapLon Optional longitude for map positioning (defaults to store value)
 */
export function positionModelOnGround(
  model: THREE.Object3D, 
  useMapCoordinates: boolean = false,
  mapLat?: number,
  mapLon?: number
): void {
  streetsGLDebugLog('[ModelPosition] Starting positioning, model structure:', {
    name: model.name,
    type: model.type,
    hasParent: !!model.parent,
    parentType: model.parent?.type,
    currentPosition: { x: model.position.x, y: model.position.y, z: model.position.z },
    currentRotation: { 
      x: THREE.MathUtils.radToDeg(model.rotation.x), 
      y: THREE.MathUtils.radToDeg(model.rotation.y), 
      z: THREE.MathUtils.radToDeg(model.rotation.z) 
    },
    currentScale: { x: model.scale.x, y: model.scale.y, z: model.scale.z },
    childrenCount: model.children.length
  })
  
  // First, reset to identity to clear any existing transforms
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  model.scale.set(1, 1, 1)
  model.updateMatrixWorld(true)
  
  // Apply the user's manually adjusted settings as defaults
  // These values were captured from the user's manual adjustment and verified to work correctly
  // Position: X: 0.541, Y: 0.035, Z: 0.000
  // Rotation: X: 0.0°, Y: 0.0°, Z: 0.0°
  // Scale: X: 1.00, Y: 1.00, Z: 1.00
  
  // Apply rotation (in radians)
  model.rotation.order = 'XYZ'
  model.rotation.set(0, 0, 0) // X: 0.0°, Y: 0.0°, Z: 0.0°
  
  // Apply scale
  model.scale.set(1.0, 1.0, 1.0) // X: 1.00, Y: 1.00, Z: 1.00
  
  // Update matrices after rotation and scale
  model.updateMatrixWorld(true)
  
  // Determine target position
  let targetX: number
  let targetY: number
  let targetZ: number
  
  if (useMapCoordinates) {
    // Use map coordinates (lat/lon) - position at map center
    // Get map center from store or use provided values
    const store = useAppStore.getState()
    const centerLat = mapLat ?? store.streetsGLGroundLat
    const centerLon = mapLon ?? store.streetsGLGroundLon
    
    // For iframe overlay: Objects should be at origin (0,0,0) to match map center visually
    // For ground layer: Use coordinate conversion based on ground layer size
    if (store.streetsGLIframeOverlay) {
      // Iframe overlay - position object near camera (view center) so it appears in view, and use height above terrain so it does not end up underground
      const heightAboveTerrain = 1.5 // meters above terrain (Streets GL will add terrain height when placing)
      targetX = 0
      targetY = heightAboveTerrain
      targetZ = 0

      model.userData.mapCenterLat = centerLat
      model.userData.mapCenterLon = centerLon

      const bridge = store.streetsGLBridge

      const doSyncAndFrame = () => {
        model.position.set(targetX, targetY, targetZ)
        model.updateMatrixWorld(true)
        captureStreetsGLBaseTransform(model)
        setTimeout(() => {
          const currentBridge = useAppStore.getState().streetsGLBridge
          syncModelToStreetsGL(model, currentBridge ?? undefined)
          setTimeout(() => {
            const viewer = (window as any).sharedViewer
            if (viewer && viewer.frameObject) {
              streetsGLDebugLog('[ModelPosition] Framing object in viewport after placement')
              viewer.frameObject(model)
            }
          }, 200)
        }, 100)
      }

      // Place at ground target (point on ground the user is looking at) so the cube is visible in view
      if (bridge) {
        bridge.requestCameraPosition((payload: { cameraPosition: { x: number; y: number; z: number }; cameraTarget?: { x: number; y: number; z: number } }) => {
          const target = payload.cameraTarget || payload.cameraPosition
          // Use ground target XZ so object appears where user is looking; Y = ground target Y + offset, or height above terrain (1.5) when ground Y is 0
          const placeY = target.y !== undefined && target.y > 0 ? target.y + heightAboveTerrain : heightAboveTerrain
          model.userData.streetsGLPosition = { x: target.x, y: placeY, z: target.z }
          try {
            const { lat, lon } = streetsGLToLatLon(target.x, target.z)
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              model.userData.gpsLat = lat
              model.userData.gpsLon = lon
            }
          } catch (_) { /* keep map center fallback */ }
          console.log('[ModelPosition] Primitive placed at ground target (in view):', {
            streetsGL: { x: target.x, y: placeY, z: target.z },
            gps: { lat: (model.userData as any).gpsLat, lon: (model.userData as any).gpsLon }
          })
          doSyncAndFrame()
        })
        // Fallback if camera position never arrives (e.g. timeout)
        setTimeout(() => {
          if (!model.userData.streetsGLPosition) {
            delete model.userData.streetsGLPosition
            delete model.userData.gpsLat
            delete model.userData.gpsLon
            console.log('[ModelPosition] Using map center fallback (camera position not received)')
            doSyncAndFrame()
          }
        }, 2000)
      } else {
        delete model.userData.streetsGLPosition
        setTimeout(() => {
          const store = useAppStore.getState()
          const b = store.streetsGLBridge
          if (b) {
            b.requestCameraPosition((payload: { cameraPosition: { x: number; y: number; z: number }; cameraTarget?: { x: number; y: number; z: number } }) => {
              const target = payload.cameraTarget || payload.cameraPosition
              const placeY = target.y !== undefined && target.y > 0 ? target.y + heightAboveTerrain : heightAboveTerrain
              model.userData.streetsGLPosition = { x: target.x, y: placeY, z: target.z }
              try {
                const { lat, lon } = streetsGLToLatLon(target.x, target.z)
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                  model.userData.gpsLat = lat
                  model.userData.gpsLon = lon
                }
              } catch (_) {}
              doSyncAndFrame()
            })
            setTimeout(() => {
              if (!model.userData.streetsGLPosition) {
                delete model.userData.streetsGLPosition
                doSyncAndFrame()
              }
            }, 2000)
          } else {
            doSyncAndFrame()
          }
        }, 500)
      }
    } else if (store.streetsGLGroundEnabled) {
      // Streets GL iframe overlay - use coordinate conversion
      const groundSize = store.streetsGLGroundSize || 1000
      // Scale: groundSize units should represent roughly the visible map area
      // At zoom 15, one tile covers ~0.01 degrees, so groundSize should cover ~0.03 degrees (3x3 grid)
      // 0.03 degrees ≈ 3.3km, so scale = groundSize / 3300 meters
      const metersPerDegree = 111000 // Approximate meters per degree of latitude
      const degreesCovered = (groundSize / metersPerDegree) * 3 // Rough estimate for 3x3 tile grid
      const scale = groundSize / (degreesCovered * metersPerDegree)
      
      const worldPos = latLonToWorld(centerLat, centerLon, centerLat, centerLon, scale)
      
      targetX = worldPos.x
      targetY = 0.035 // Keep same Y offset for ground contact
      targetZ = worldPos.z
      
      streetsGLDebugLog('[ModelPosition] Using ground layer coordinates:', {
        lat: centerLat,
        lon: centerLon,
        groundSize,
        scale: scale.toFixed(6),
        worldPosition: { x: targetX.toFixed(3), y: targetY.toFixed(3), z: targetZ.toFixed(3) },
        note: 'Ground layer: converted lat/lon to world coordinates'
      })
      
      // IMPORTANT: For ground layer, we also need to sync to Streets GL so objects appear in the 3D scene
      // Objects should be part of Streets GL scene (like buildings), not just in Three.js scene
      const bridge = store.streetsGLBridge
      if (bridge) {
        // Store position for Streets GL sync
        // For ground layer, we need to convert Three.js world coordinates to Streets GL coordinates
        // Streets GL uses Web Mercator projection, so we need to request camera position
        bridge.requestCameraPosition((payload) => {
          const cameraPos = payload.cameraPosition
          // Calculate position relative to Streets GL camera
          // For ground layer, objects are in Three.js world space, but Streets GL needs its own coordinates
          // Use the Three.js position but convert to Streets GL space
          const streetsGLX = cameraPos.x + (targetX - 0) // Relative to camera
          const streetsGLY = targetY // Keep Y as-is
          const streetsGLZ = cameraPos.z + (targetZ - 0) // Relative to camera
          
          // Store Streets GL position for syncing
          model.userData.streetsGLPosition = {
            x: streetsGLX,
            y: streetsGLY,
            z: streetsGLZ
          }
          model.userData.streetsGLCameraPosition = cameraPos
          
          streetsGLDebugLog('[ModelPosition] Ground layer - calculated Streets GL position:', {
            threeJSPosition: { x: targetX, y: targetY, z: targetZ },
            streetsGLPosition: { x: streetsGLX, y: streetsGLY, z: streetsGLZ },
            cameraPosition: cameraPos,
            note: 'Object will be synced to Streets GL scene as 3D object (like buildings)'
          })
          
          // Sync to Streets GL after a short delay
          setTimeout(() => {
            syncModelToStreetsGL(model, bridge)
          }, 200)
        })
      }
    } else {
      // Fallback: use origin
      targetX = 0
      targetY = 0.035
      targetZ = 0
      
      streetsGLDebugLog('[ModelPosition] Map coordinates enabled but no ground/overlay - using origin')
    }
  } else {
    // Use fixed world coordinates (user's verified values)
    // Position: X: 0.541, Y: 0.035, Z: 0.000
    targetX = 0.541
    targetY = 0.035
    targetZ = 0.000
    
    streetsGLDebugLog('[ModelPosition] Applying user\'s verified default settings:', {
      position: { x: targetX, y: targetY, z: targetZ },
      rotation: { x: 0.0, y: 0.0, z: 0.0 },
      scale: { x: 1.0, y: 1.0, z: 1.0 },
      note: 'These values were manually adjusted and verified by the user'
    })
  }
  
  // Set position
  model.position.set(targetX, targetY, targetZ)
  
  // Force matrix update immediately
  model.updateMatrix()
  model.updateMatrixWorld(true)
  
  // Update all children matrices to ensure transforms propagate
  model.traverse((child) => {
    child.updateMatrix()
    child.updateMatrixWorld(true)
  })
  
  // Verify final position
  streetsGLDebugLog('[ModelPosition] Final position applied:', {
    position: {
      x: model.position.x.toFixed(3),
      y: model.position.y.toFixed(3),
      z: model.position.z.toFixed(3)
    },
    rotation: {
      x: THREE.MathUtils.radToDeg(model.rotation.x).toFixed(1),
      y: THREE.MathUtils.radToDeg(model.rotation.y).toFixed(1),
      z: THREE.MathUtils.radToDeg(model.rotation.z).toFixed(1)
    },
    scale: {
      x: model.scale.x.toFixed(2),
      y: model.scale.y.toFixed(2),
      z: model.scale.z.toFixed(2)
    }
  })
}

/**
 * Sync a Three.js model to Streets GL scene via postMessage bridge
 * This allows objects to appear in the Streets GL iframe overlay
 * 
 * IMPORTANT: Streets GL uses its own coordinate system (Web Mercator projection).
 * When syncing objects, we need to use Streets GL's coordinate system, not Three.js world coordinates.
 * The object position should be relative to Streets GL's camera position or in Streets GL's world space.
 */
export function syncModelToStreetsGL(model: THREE.Object3D, bridge: StreetsGLBridge | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!bridge) {
      streetsGLDebugLog('[StreetsGLSync] Bridge not available - skip sync (will sync when bridge is ready)')
      resolve()
      return
    }

    void (async () => {
  // Check if this model was already synced to Streets GL.
  // `streetsGLAdded` tells us the object actually exists (or is queued) in Streets GL and
  // should be UPDATED rather than ADDED again. `streetsGLObjectId` may be reserved
  // synchronously below before the add round-trip completes, so we must not rely on its
  // mere presence to decide add-vs-update (that caused the duplicate-cube race).
  const existingId = model.userData.streetsGLObjectId
  const alreadyAdded = model.userData.streetsGLAdded === true

  // Use existing ID if available, otherwise generate new one
  const objectId = existingId || `obj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

  // Reserve the id on the mesh synchronously so a second concurrent caller (e.g. the panel
  // and positionModelOnGround firing for the same primitive) reuses this id instead of
  // generating a new one and adding a second object.
  model.userData.streetsGLObjectId = objectId

  const store = useAppStore.getState()

  // Wait for embedded GLB/GLTF texture images before serializing materials for the iframe.
  await StreetsGLBridge.ensureTexturesReady(model)

  // Convert Three.js object to Streets GL format (use consistent ID)
  let streetsGLObject = StreetsGLBridge.fromThreeJSObject(model, objectId)

  const modelUd = model.userData as any
  if (modelUd.renderInStreetsGL === true && model.visible === false) {
    console.log('[StreetsGLSync] Model hidden in Three.js viewer; forcing Streets GL visible=true:', {
      objectId,
      name: model.name || modelUd.fileName
    })
  }

  // CRITICAL: Always use Streets GL Web Mercator coordinates (same as tiles/buildings).
  // If we send Three.js coords (e.g. 0, 1.5, 0) the object would be at origin in Streets GL and invisible.
  const mapLat = store.streetsGLGroundLat ?? 32.89917 // Default to Dallas/Fort Worth
  const mapLon = store.streetsGLGroundLon ?? -97.03813

  captureStreetsGLBaseTransform(model)

  if (model.userData.streetsGLPosition) {
    // Apply current transform delta from placement anchors — do not send the raw anchor alone.
    streetsGLObject.position = computeStreetsGLPositionFromObject(model)
    streetsGLDebugLog('[StreetsGLSync] Using stored Streets GL anchor + transform delta:', streetsGLObject.position)
  } else {
    // Always compute Web Mercator position so object appears on the map when city mode is used
    const isAtOrigin = Math.abs(model.position.x) < 0.1 && Math.abs(model.position.y) < 0.1 && Math.abs(model.position.z) < 0.1
    if (isAtOrigin) {
      const objectHeight = typeof model.position.y === 'number' ? model.position.y : 1.5
      streetsGLObject.position = latLonToStreetsGL(mapLat, mapLon, objectHeight)
      streetsGLDebugLog('[StreetsGLSync] Positioned at map center (Web Mercator):', streetsGLObject.position)
    } else {
      const objectHeight = typeof model.position.y === 'number' ? model.position.y : 1.5
      const mapCenter = latLonToStreetsGL(mapLat, mapLon, objectHeight)
      streetsGLObject.position = {
        x: mapCenter.x + model.position.x,
        y: mapCenter.y + model.position.y,
        z: mapCenter.z + model.position.z
      }
      streetsGLDebugLog('[StreetsGLSync] Positioned with offset (Web Mercator):', streetsGLObject.position)
    }
    model.userData.streetsGLPosition = streetsGLObject.position
  }

  const validatedPosition = validateStreetsGLMercatorPosition(streetsGLObject.position, {
    objectId,
    source: 'syncModelToStreetsGL'
  })
  if (!validatedPosition) {
    if (reject) reject(new Error('Invalid Streets GL Mercator position'))
    return
  }
  streetsGLObject.position = validatedPosition

  // If we have a valid Streets GL position, store corresponding GPS coordinates on the model
  try {
    if (streetsGLObject.position && typeof streetsGLObject.position.x === 'number' && typeof streetsGLObject.position.z === 'number') {
      const { lat, lon } = streetsGLToLatLon(streetsGLObject.position.x, streetsGLObject.position.z)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        model.userData.gpsLat = lat
        model.userData.gpsLon = lon
        // Also store in metadata for external tools / exports
        streetsGLObject.metadata = {
          ...(streetsGLObject.metadata || {}),
          gpsLat: lat,
          gpsLon: lon
        }

        streetsGLDebugLog('[StreetsGLSync] 📍 Computed GPS for model after sync:', {
          objectId,
          name: model.name,
          streetsGLPosition: streetsGLObject.position,
          gpsLat: lat,
          gpsLon: lon
        })
      }
    }
  } catch (e) {
    console.warn('[StreetsGLSync] Failed to compute GPS coordinates from Streets GL position:', e)
  }
  
  // Objects need geometry.positions to be visible in Streets GL (otherwise only a container is created)
  if (!streetsGLObject.geometry?.positions?.length) {
    console.warn('[StreetsGLSync] ⚠️ No geometry sent for', model.name || objectId, '- object will not be visible in Streets GL. Ensure it is a Mesh with geometry (e.g. BoxGeometry) or has mesh children.')
  }

  // Scale convention: Streets GL world units are meters (Web Mercator), so we keep objects
  // at their real-world size (1 three.js unit = 1 meter). Previously this path multiplied by
  // 100x (and the demo path used 1000x), which turned a 1m cube into a 100m/1000m block at
  // odd altitudes. Visibility is handled by framing the object (see ExternalObjectBridge),
  // not by inflating its size. Adjust this single constant if a larger default is desired.
  const STREETS_GL_SCALE = STREETS_GL_OBJECT_SCALE
  streetsGLObject.scale = {
    x: streetsGLObject.scale.x * STREETS_GL_SCALE,
    y: streetsGLObject.scale.y * STREETS_GL_SCALE,
    z: streetsGLObject.scale.z * STREETS_GL_SCALE
  }

  const syncVertexCount = streetsGLObject.geometry?.positions
    ? Math.floor((streetsGLObject.geometry.positions as ArrayLike<number>).length / 3)
    : 0
  console.log('[StreetsGLSync] Syncing to Streets GL:', {
    objectId,
    name: model.name || modelUd.fileName || objectId,
    alreadyAdded,
    visible: streetsGLObject.visible !== false,
    position: streetsGLObject.position,
    scale: streetsGLObject.scale,
    vertexCount: syncVertexCount,
    bridgeReady: bridge.isReady
  })
  streetsGLDebugLog('[StreetsGLSync] 🔄 Syncing object to Streets GL:', {
    objectId,
    existingId: existingId || 'new',
    alreadyAdded,
    position: streetsGLObject.position,
    scale: streetsGLObject.scale,
    rotation: streetsGLObject.rotation,
    hasGeometry: !!streetsGLObject.geometry,
    vertexCount: syncVertexCount,
    bridgeReady: bridge.isReady,
    note: alreadyAdded ? 'Updating existing object' : 'Adding new object'
  })

  // Sync object (either with converted coordinates or original if not using Streets GL coords)
  syncObjectToStreetsGLInternal(model, bridge, streetsGLObject, objectId, alreadyAdded, resolve, reject)
    })().catch((err) => {
      console.error('[StreetsGLSync] Error preparing model for Streets GL:', err)
      if (reject) reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

/**
 * Internal function to actually sync object to Streets GL
 */
function syncObjectToStreetsGLInternal(
  model: THREE.Object3D,
  bridge: StreetsGLBridge,
  streetsGLObject: any,
  objectId: string,
  alreadyAdded: boolean,
  resolve?: () => void,
  reject?: (error: Error) => void
): void {
  
  // Scale is already multiplied by STREETS_GL_OBJECT_SCALE in syncModelToStreetsGL
  streetsGLDebugLog('[StreetsGLSync] Scale for Streets GL:', {
    scale: {
      x: streetsGLObject.scale.x.toFixed(3),
      y: streetsGLObject.scale.y.toFixed(3),
      z: streetsGLObject.scale.z.toFixed(3)
    }
  })

  if (alreadyAdded) {
    // Object already exists (or is queued) in Streets GL - update it instead of creating new one
    streetsGLDebugLog('[StreetsGLSync] Updating existing object in Streets GL:', {
      id: objectId,
      oldPosition: model.position,
      newPosition: streetsGLObject.position,
      newRotation: streetsGLObject.rotation,
      newScale: streetsGLObject.scale
    })
    
    bridge.updateObject(objectId, {
      position: streetsGLObject.position,
      rotation: streetsGLObject.rotation,
      scale: streetsGLObject.scale,
      visible: streetsGLObject.visible
    }).then((success) => {
      if (success) {
        streetsGLDebugLog('[StreetsGLSync] ✅ Object successfully updated in Streets GL:', objectId)
        if (resolve) resolve()
      } else {
        console.warn('[StreetsGLSync] Failed to update object in Streets GL:', objectId)
        if (reject) reject(new Error('Update failed'))
      }
    }).catch((error) => {
      console.error('[StreetsGLSync] Error updating object in Streets GL:', error)
      if (reject) reject(error)
    })
  } else {
    // New object - add it to Streets GL scene.
    // Guard against a concurrent add for the SAME logical object (the duplicate-cube race):
    // if an add is already in flight for this mesh, no-op so we don't add it twice.
    if (model.userData.streetsGLSyncing) {
      streetsGLDebugLog('[StreetsGLSync] Add already in flight for this object, skipping duplicate add:', objectId)
      if (resolve) resolve()
      return
    }
    model.userData.streetsGLSyncing = true

    streetsGLDebugLog('[StreetsGLSync] Adding new object to Streets GL:', {
      id: objectId,
      position: streetsGLObject.position,
      rotation: streetsGLObject.rotation,
      scale: streetsGLObject.scale
    })

    bridge.addObject(streetsGLObject).then((result) => {
      model.userData.streetsGLSyncing = false
      // Treat "queued" as a non-failure: the bridge will add the object (with the same id)
      // once it becomes ready, so we still persist the id and mark it as added.
      if (result.success || result.queued) {
        model.userData.streetsGLObjectId = objectId
        model.userData.streetsGLAdded = true
        streetsGLDebugLog(
          result.queued
            ? '[StreetsGLSync] ⏳ Model queued for Streets GL (will flush on ready):'
            : '[StreetsGLSync] ✅ Model successfully added to Streets GL scene:',
          objectId
        )
        if (resolve) resolve()
      } else {
        // Genuine failure (e.g. timeout / scene unavailable): release the reserved id so a
        // later attempt can start fresh instead of incorrectly taking the update branch.
        if (model.userData.streetsGLObjectId === objectId) {
          delete model.userData.streetsGLObjectId
        }
        const vertexCount = streetsGLObject.geometry?.positions?.length
          ? Math.floor(streetsGLObject.geometry.positions.length / 3)
          : 0
        const failMsg = `Failed to add "${model.name || objectId}" to Streets GL map${vertexCount ? ` (${vertexCount.toLocaleString()} vertices)` : ''}. Check the browser console for details.`
        console.warn('[StreetsGLSync] Failed to add model to Streets GL scene:', objectId, { vertexCount })
        useAppStore.getState().setError(failMsg)
        if (reject) reject(new Error('Add failed'))
      }
    }).catch((error) => {
      model.userData.streetsGLSyncing = false
      console.error('[StreetsGLSync] Error syncing model to Streets GL:', error)
      if (reject) reject(error)
    })
  }
}

/**
 * Helper function to check if a material is transparent
 * Used to prevent overriding transparent material shadow settings
 * Uses the same detection logic as the main transparent material configuration
 */
function isMaterialTransparent(material: THREE.Material): boolean {
  const anyMat = material as any
  const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
  const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
  const hasTransmission = transmission > 0
  const transparentFlag = anyMat.transparent === true
  
  // Check for MeshPhysicalMaterial with transmission (glass materials)
  const isPhysicalWithTransmission = material instanceof THREE.MeshPhysicalMaterial && hasTransmission
  
  // Check if material name suggests glass/window (matches original detection logic)
  const materialName = (material.name || '').toLowerCase()
  const isGlassLike = materialName.includes('glass') || 
                     materialName.includes('window') || 
                     materialName.includes('windshield') ||
                     materialName.includes('transparent') ||
                     materialName.includes('transmission') ||
                     materialName.includes('glass_') ||
                     materialName.includes('window_') ||
                     materialName.includes('_glass') ||
                     materialName.includes('_window')
  
  // Check if material was already configured as transparent (most reliable check)
  const wasConfiguredTransparent = anyMat.userData?.transparentShadowConfigured === true
  
  // Use same detection logic as main configuration code
  return isPhysicalWithTransmission || 
         hasTransmission || 
         (transparentFlag && opacity < 1.0) ||
         isGlassLike ||
         (transparentFlag && typeof opacity === 'number' && opacity < 1.0 && opacity > 0.0) ||
         wasConfiguredTransparent
}

/**
 * Helper function to check if a mesh has any transparent materials
 */
function hasTransparentMaterial(mesh: THREE.Mesh): boolean {
  if (!mesh.material) return false
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.some(mat => isMaterialTransparent(mat))
}

function fixTextureFiltering(model: THREE.Object3D, maxAnisotropy: number, renderer: THREE.WebGLRenderer, customAnisotropy?: number) {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material: THREE.Material) => {
          if (material instanceof THREE.MeshStandardMaterial || 
              material instanceof THREE.MeshPhysicalMaterial ||
              material instanceof THREE.MeshPhongMaterial ||
              material instanceof THREE.MeshLambertMaterial ||
              material instanceof THREE.MeshBasicMaterial) {
            // Configure texture filtering for all texture maps
            // Use type-safe property access based on material type
            const textureMaps: THREE.Texture[] = []
            
            // Common textures available on most materials
            if ('map' in material && material.map) textureMaps.push(material.map as THREE.Texture)
            if ('aoMap' in material && material.aoMap) textureMaps.push(material.aoMap as THREE.Texture)
            if ('emissiveMap' in material && material.emissiveMap) textureMaps.push(material.emissiveMap as THREE.Texture)
            if ('alphaMap' in material && material.alphaMap) textureMaps.push(material.alphaMap as THREE.Texture)
            if ('bumpMap' in material && material.bumpMap) textureMaps.push(material.bumpMap as THREE.Texture)
            
            // PBR textures (MeshStandardMaterial, MeshPhysicalMaterial)
            if ('normalMap' in material && material.normalMap) textureMaps.push(material.normalMap as THREE.Texture)
            if ('roughnessMap' in material && material.roughnessMap) textureMaps.push(material.roughnessMap as THREE.Texture)
            if ('metalnessMap' in material && material.metalnessMap) textureMaps.push(material.metalnessMap as THREE.Texture)
            if ('displacementMap' in material && material.displacementMap) textureMaps.push(material.displacementMap as THREE.Texture)
            
            // Physical material specific textures
            if ('clearcoatMap' in material && material.clearcoatMap) textureMaps.push(material.clearcoatMap as THREE.Texture)
            if ('clearcoatNormalMap' in material && material.clearcoatNormalMap) textureMaps.push(material.clearcoatNormalMap as THREE.Texture)
            if ('clearcoatRoughnessMap' in material && material.clearcoatRoughnessMap) textureMaps.push(material.clearcoatRoughnessMap as THREE.Texture)
            if ('sheenColorMap' in material && material.sheenColorMap) textureMaps.push(material.sheenColorMap as THREE.Texture)
            if ('sheenRoughnessMap' in material && material.sheenRoughnessMap) textureMaps.push(material.sheenRoughnessMap as THREE.Texture)
            if ('transmissionMap' in material && material.transmissionMap) textureMaps.push(material.transmissionMap as THREE.Texture)
            if ('thicknessMap' in material && material.thicknessMap) textureMaps.push(material.thicknessMap as THREE.Texture)
            if ('specularMap' in material && material.specularMap) textureMaps.push(material.specularMap as THREE.Texture)
            if ('specularIntensityMap' in material && material.specularIntensityMap) textureMaps.push(material.specularIntensityMap as THREE.Texture)
            if ('specularColorMap' in material && material.specularColorMap) textureMaps.push(material.specularColorMap as THREE.Texture)
            
            textureMaps.forEach((texture: THREE.Texture) => {
              // Use linear filtering instead of nearest to prevent striping
              // This is critical for removing horizontal striping artifacts
              // The striping is often caused by NearestFilter or NearestMipmapNearestFilter
              texture.minFilter = THREE.LinearMipmapLinearFilter
              texture.magFilter = THREE.LinearFilter
              
              // Ensure mipmaps are generated - this is essential for smooth textures
              // Only generate mipmaps if the texture image is valid and power-of-two
              if (texture.image) {
                const img = texture.image as HTMLImageElement | HTMLCanvasElement | ImageData
                const width = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || (img as ImageData).width
                const height = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || (img as ImageData).height
                
                if (width > 0 && height > 0) {
                  texture.generateMipmaps = true
                }
              } else {
                texture.generateMipmaps = true
              }
              
              // Enable anisotropic filtering for better quality at angles
              // This helps reduce aliasing and striping when viewing textures at oblique angles
              // Use custom anisotropy if provided, otherwise use max available
              if (customAnisotropy !== undefined && customAnisotropy >= 0) {
                texture.anisotropy = Math.min(customAnisotropy, maxAnisotropy, 16)
              } else {
                texture.anisotropy = Math.min(maxAnisotropy, 16)
              }
              
              // Force texture update and upload to GPU
              // This ensures the new filtering settings are applied
              texture.needsUpdate = true
              
              // Force texture properties to be uploaded to GPU immediately
              // Clear cached texture state so it gets re-uploaded with new settings
              try {
                if (renderer && (renderer as any).properties) {
                  const properties = (renderer as any).properties
                  // Check if properties has Map-like methods (get, delete)
                  if (properties && typeof properties.get === 'function' && typeof properties.delete === 'function') {
                    const textureId = properties.get(texture)
                    if (textureId !== undefined) {
                      // Remove from cache to force re-upload with new filter settings
                      properties.delete(texture)
                    }
                  }
                }
              } catch (e) {
                // Ignore if properties access fails (internal API)
                // Silently fail - this is an optimization, not critical
              }
            })
          }
        })
      }
    }
  })
}

export function useViewer() {
  const setViewer = useCallback((viewer: ViewerInstance | null) => {
    // Industry-standard: Set sharedViewer synchronously and immediately
    // This ensures the viewer is available as soon as it's registered
    // CRITICAL: Cleanup previous viewer to prevent conflicts from multiple sessions
    const previousViewer = sharedViewer
    if (previousViewer && previousViewer !== viewer) {
      // Cleanup previous viewer's animation loop if it exists
      try {
        if (previousViewer.renderer) {
          const currentLoop = (previousViewer.renderer as any).getAnimationLoop?.()
          if (currentLoop) {
            previousViewer.renderer.setAnimationLoop(null)
          }

        }
      } catch (e) {
        // Ignore cleanup errors
      }

    }
    sharedViewer = viewer
    if (typeof window !== 'undefined') {
      ;(window as any).sharedViewer = viewer
    }
    if (viewer) {
      try {
        console.log('[ViewerInit] sharedViewer set successfully', {
          hasScene: !!viewer.scene,
          hasRenderer: !!viewer.renderer,
          hasCamera: !!viewer.camera,
          timestamp: new Date().toISOString()
        })
        // Verify it was actually set
        if (sharedViewer !== viewer) {
          console.error('[ViewerInit] WARNING: sharedViewer was not set correctly!')
        }
      } catch {}
    } else {
      try {
        if (previousViewer) {
          console.warn('[ViewerInit] sharedViewer cleared (set to null)', {
            previousViewerHadScene: !!previousViewer.scene,
            timestamp: new Date().toISOString()
          })
        } else {
          console.warn('[ViewerInit] sharedViewer cleared (set to null)')
        }
      } catch {}
    }
  }, [])

  function refreshHdrShadowPlaneAfterModelLoad(scene: THREE.Scene, viewer: ViewerInstance): void {
    const store = useAppStore.getState()
    if (!store.hdrEnabled || !store.shadowsEnabled) {
      return
    }

    syncHdrShadowPlaneInScene(scene, {
      showShadowPlane: store.showShadowPlane,
      shadowIntensity: store.shadowIntensity,
      input: {
        hdrEnabled: store.hdrEnabled,
        hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
        shadowsEnabled: store.shadowsEnabled
      },
      groundProjection: store.hdrGroundProjectionEnabled
        ? {
            height: store.hdrGroundProjectionHeight,
            radius: store.hdrGroundProjectionRadius,
            positionY: store.hdrGroundProjectionPositionY
          }
        : undefined,
      lightweight: false,
      frameCount: 0
    })

    if (viewer.updateShadowCameraBounds) {
      viewer.updateShadowCameraBounds()
    }

    if (viewer.renderer?.shadowMap) {
      viewer.renderer.shadowMap.enabled = true
      viewer.renderer.shadowMap.needsUpdate = true
    }

    forceHdrSunShadowState(scene, viewer.renderer, store.shadowsEnabled)

    wakeViewerRender(viewer)
  }

  async function applyInteriorEnhancementsToModel(
    modelScene: THREE.Object3D,
    scene: THREE.Scene,
    viewer: { csmShadowSystem?: { getDirectionalLights?: () => THREE.DirectionalLight[] } } | null
  ): Promise<void> {
    try {
      const { enhanceInternalShadows, ensureImportedMeshesVisible } = await import(
        '../utils/enhanceInternalShadows'
      )
      const appStore = await import('../store/useAppStore')
      const { darkenInteriorCavities } = appStore.useAppStore.getState()

      ensureImportedMeshesVisible(modelScene)

      const directionalLights: THREE.DirectionalLight[] = []
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
          directionalLights.push(obj)
        }
      })
      const csmLights = viewer?.csmShadowSystem?.getDirectionalLights?.()
      if (Array.isArray(csmLights)) {
        csmLights.forEach((light) => {
          if (!directionalLights.includes(light)) {
            directionalLights.push(light)
          }
        })
      }

      const enhancementResult = enhanceInternalShadows(modelScene, directionalLights, {
        darkenInteriorCavities,
        logAffectedMeshes: modelScene.userData.isAutoLoaded === true,
        logAllMeshNames: modelScene.userData.isAutoLoaded === true
      })

      if (
        enhancementResult.meshesEnhanced > 0 ||
        enhancementResult.materialsMadeDoubleSided > 0 ||
        enhancementResult.transparentMaterialsFixed > 0 ||
        enhancementResult.cavityMeshesDimmed > 0
      ) {
        console.log('[ShadowEnhancement] Interior cavity enhancements:', {
          meshesEnhanced: enhancementResult.meshesEnhanced,
          materialsDoubleSided: enhancementResult.materialsMadeDoubleSided,
          transparentMaterialsFixed: enhancementResult.transparentMaterialsFixed,
          cavityMeshesDimmed: enhancementResult.cavityMeshesDimmed,
          exteriorPanelsFrontSided: enhancementResult.exteriorPanelsFrontSided,
          fixes: enhancementResult.fixesApplied
        })
      }

      const { ensureInteriorFillLight } = await import('../utils/interiorFillLight')
      const fill = ensureInteriorFillLight(scene, modelScene)
      if (fill) {
        console.log('[IndirectLighting] Auto interior RectAreaLight fill added', {
          intensity: fill.intensity,
          width: fill.width,
          height: fill.height
        })
      }
    } catch (error) {
      console.warn('[ShadowEnhancement] Failed to enhance internal shadows:', error)
    }
  }

  const loadFromFile = useCallback(async (file: File, onProgress?: (progress: number) => void, textureFiles?: Map<string, File>, mergedTextures?: Map<string, string>): Promise<LoadedModel> => {
    const storeAtStart = useAppStore.getState()
    const cityModeStreetsGL =
      storeAtStart.renderMode === 'city' &&
      storeAtStart.streetsGLIframeOverlay

    // Industry-standard: Wait for viewer to be fully initialized before loading models
    // This prevents race conditions where files are loaded before the viewer is ready.
    // City mode with Streets GL has no Three.js scene — load in memory and sync to the iframe.
    let attempts = 0
    const maxAttempts = 100 // Increased timeout to 10 seconds (100 * 100ms)
    
    // Get current viewer reference - check both module-level and ensure it's not stale
    let currentViewer = sharedViewer
    
    // Log initial state for debugging (city mode intentionally has no Three.js viewer)
    try {
      if (cityModeStreetsGL) {
        streetsGLDebugLog('[ViewerInit] loadFromFile (city mode, Streets GL path):', file.name)
      } else {
        console.log(`[ViewerInit] loadFromFile called, sharedViewer is ${currentViewer ? 'set' : 'null'}`)
        if (!currentViewer) {
          console.log('[ViewerInit] sharedViewer is null, waiting for initialization...')
        }
      }
    } catch {}
    
    if (!cityModeStreetsGL) {
      // Wait for viewer with exponential backoff for better responsiveness
      while (!currentViewer && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
        currentViewer = sharedViewer
        
        if (attempts % 20 === 0) {
          try {
            console.log(`[ViewerInit] Still waiting for viewer... (${attempts * 100}ms elapsed)`, {
              sharedViewerIsNull: sharedViewer === null,
              currentViewerIsNull: currentViewer === null
            })
          } catch {}
        }
      }
      
      if (!currentViewer) {
        currentViewer = sharedViewer
        
        if (!currentViewer) {
          const errorMsg = 'Viewer not initialized. The 3D viewer is still loading. Please wait a few seconds and try again. If the issue persists, refresh the page.'
          console.error(`[ViewerInit] ${errorMsg} (waited ${attempts * 100}ms)`)
          throw new Error(errorMsg)
        }
      }
      
      if (!currentViewer.scene || !currentViewer.renderer || !currentViewer.camera) {
        const errorMsg = 'Viewer is partially initialized. Please wait a moment and try again.'
        console.error(`[ViewerInit] ${errorMsg}`)
        throw new Error(errorMsg)
      }
    }

    const model = await loadModel({ file, textureFiles, mergedTextures }, onProgress)
    const fileName = file.name || 'Imported Model'

    // City mode: no Three.js scene — register, cache, and sync to Streets GL only.
    if (cityModeStreetsGL) {
      tagImportedModelScene(model.scene, fileName, {
        isAutoLoaded: false,
        fileSource: 'disk',
        fileSize: file.size
      })
      fileRegistry.registerModelFile(fileName, file)
      model.scene.visible = false
      model.scene.userData.renderInStreetsGL = true

      const objectId = registerImportedModelInRegistry(model.scene, fileName, { markStreetsGLPending: true })
      streetsGLDebugLog('[ModelLoad] City mode import registered:', { fileName, objectId })

      setTimeout(() => {
        model.scene.updateMatrixWorld(true)
        positionModelOnGround(model.scene, true)
        setTimeout(() => mirrorImportedModelPlacementToRegistry(objectId, model.scene), 2500)
      }, 100)

      return model
    }

    const viewer = currentViewer!
    
    try {
      console.log(`[ViewerInit] Viewer ready, proceeding with file load: ${file.name}`)
    } catch {}

    const { scene, renderer } = viewer
    // Don't remove previous models - allow multiple models to coexist
    // Users can manually delete models if needed
    // removePreviousModel(scene, false) // Disabled to allow multiple models
    
    // If the loaded model contains Revit room data (from DXF), push it into app state
    const storeForRooms = useAppStore.getState()
    if (storeForRooms.setRooms) {
      const rooms: RoomInfo[] = []

      if (model.userData && Array.isArray((model.userData as any).rooms)) {
        rooms.push(...((model.userData as any).rooms as RoomInfo[]))
      } else {
        model.scene.traverse((child) => {
          const anyChild = child as any
          if (anyChild.userData?.isRoom) {
            const matColor =
              anyChild.material && anyChild.material.color
                ? (anyChild.material.color as THREE.Color)
                : null
            const color = matColor ? `#${matColor.getHexString()}` : '#cccccc'
            const room: RoomInfo = {
              id: anyChild.uuid || `room-${rooms.length}`,
              name: anyChild.userData.roomName || anyChild.name || 'Room',
              number: anyChild.userData.roomNumber ?? null,
              color,
              metadata: anyChild.userData.roomMetadata || {},
              mesh: child
            }
            rooms.push(room)
          }
        })
      }

      try {
        console.log('[RoomDebug] Discovered rooms after model load:', {
          count: rooms.length,
          fromUserDataArray: !!(model.userData && Array.isArray((model.userData as any).rooms)),
          sample: rooms.slice(0, 5).map((r) => ({
            id: r.id,
            name: r.name,
            number: r.number,
            metadataKeys: Object.keys(r.metadata)
          }))
        })
        ;(window as any).debugRooms = () => rooms
      } catch {}

      storeForRooms.setRooms(rooms)
    }

    // Mark the model for easy identification
    // Industry-standard: Use exclusion layers to prevent sky/environmental effects from modifying imported models
    model.scene.userData.isModel = true
    model.scene.userData.isAutoLoaded = false // This is a user-imported model, not auto-loaded
    model.scene.userData.excludeFromSkyModifications = true // Industry-standard exclusion flag
    model.scene.userData.excludeFromWeatherModifications = true // Prevent weather system from modifying imported models
    model.scene.animations = model.animations
    
    // Store file name for display in Objects Panel
    if (!model.scene.name || model.scene.name === '') {
      model.scene.name = fileName
    }
    model.scene.userData.fileName = fileName
    
    // CRITICAL: Store original file reference for large files that can't be embedded
    // This allows us to reference the file even if it's too large to embed
    // Store as a special marker that indicates "file was loaded from disk"
    // We can't store the actual path for security reasons, but we can mark it
    if (!model.scene.userData.fileUrl) {
      // Mark that this file was loaded from disk (not from URL)
      // This helps during save to know we should try to embed it
      model.scene.userData.fileSource = 'disk'
      // Store the file size for reference
      model.scene.userData.fileSize = file.size
    }
    
    // IMPROVED: Register file in global registry for project save/load
    // This allows us to embed actual file data in saved projects
    fileRegistry.registerModelFile(fileName, file)
    
    // Check if Streets GL overlay is enabled - if so, hide model in main scene (it will be rendered in Streets GL)
    // Gaussian splats must stay visible in main scene - they cannot be rendered in Streets GL
    const store = useAppStore.getState()
    const isGaussianSplatViewer = (model.scene as any).userData?.isGaussianSplatViewer === true

    // Register in projectObjects so imported models appear in the object tree and survive mode switches.
    const importedObjectId = registerImportedModelInRegistry(model.scene, fileName, {
      markStreetsGLPending: store.streetsGLIframeOverlay && !isGaussianSplatViewer
    })
    
    if (store.streetsGLIframeOverlay && !isGaussianSplatViewer) {
      model.scene.visible = false // Hide in main scene - will be rendered in Streets GL
      model.scene.userData.renderInStreetsGL = true // Mark for Streets GL rendering
      streetsGLDebugLog('[ModelLoad] Model hidden in main scene (will render in Streets GL):', model.scene.name)
    }
    if (isGaussianSplatViewer) {
      model.scene.visible = true
      model.scene.userData.excludeFromStreetsGLHiding = true // Never hide splats for Streets GL
    }
    
    // Mark all children with exclusion flags (industry-standard recursive tagging)
    // Also exclude imported models from fog and other sky textures (only lighting should affect them)
    let fogDisabledCount = 0
    model.scene.traverse((child) => {
      child.userData.isImportedModel = true
      child.userData.excludeFromSkyModifications = true
      child.userData.excludeFromWeatherModifications = true
      
      // Industry-standard: Disable fog on imported models - fog should only affect lighting, not visual appearance
      // Fog should affect lighting dynamics (brightness, contrast) but NOT visual textures on imported objects
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((mat: THREE.Material) => {
          // Disable fog on all materials of imported models
          // This ensures fog only affects lighting dynamics, not visual textures
          if ('fog' in mat && (mat as any).fog !== false) {
            (mat as any).fog = false
            mat.needsUpdate = true
            fogDisabledCount++
          }
        })
      }
    })
    
    if (fogDisabledCount > 0) {
      try {
        console.log(`[FogDebug] Disabled fog on ${fogDisabledCount} imported model materials - fog only affects lighting, not visual textures`)
      } catch {}
    }
    
    scene.add(model.scene)
    attachModelAnimations(viewer, model)
    requestAnimationFrame(() => {
      try {
        buildScenePickBVH(scene)
      } catch (error) {
        console.warn('[ModelLoad] Failed to build pick BVH:', error)
      }
    })
    
    // Skip mesh-specific post-processing for Gaussian splat viewers (they use a custom render pipeline)
    const isGaussianSplat = (model.scene as any).userData?.isGaussianSplatViewer === true
    
    // Update bounding boxes if enabled (delay to ensure model is fully added to scene)
    if (!isGaussianSplat) {
      setTimeout(() => {
        if ((viewer as any).updateBoundingBoxes) {
          (viewer as any).updateBoundingBoxes()
        }
      }, 100)
    }
    
    // Get custom anisotropy setting if available
    const appStore = await import('../store/useAppStore')
    const textureAnisotropy = appStore.useAppStore.getState().textureAnisotropy
    const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
    
    // Get renderer's max anisotropy and fix texture filtering (skip for Gaussian splats)
    if (!isGaussianSplat) {
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
      fixTextureFiltering(model.scene, maxAnisotropy, renderer, customAnisotropy)
    }
    
    // Mesh/material processing (shadow, envMap, depth masking) — skip for Gaussian splats
    if (!isGaussianSplat) {
          // Enable shadows on all meshes in the model
      // Also enhance materials for better HDR reflections and fallback defaults
      let appliedFallbackMaterial = false
      let appliedEnvMapCount = 0
      
      // Get current environment map from scene (if available)
      const currentEnvMap = scene.environment
      
      // CRITICAL: Get HDR intensity if HDR is loaded
      // Materials need the correct envMapIntensity to receive proper lighting from HDR.
      // The viewer instance may expose an hdrSystem helper; fall back to default if not present.
      let hdrIntensity = 1.0 // Default intensity
      try {
        const hdrSystem = (viewer as any)?.hdrSystem
        if (hdrSystem && typeof hdrSystem.getIntensity === 'function') {
          hdrIntensity = hdrSystem.getIntensity() || 1.0
        } else if (hdrSystem && (hdrSystem as any).config?.intensity !== undefined) {
          hdrIntensity = (hdrSystem as any).config.intensity
        }
      } catch (error) {
        // Fallback to default if HDR system not available
        console.warn('[useViewer] Could not get HDR intensity, using default 1.0')
      }
      
      // Get shadow opacity settings
      const shadowOpacityEnabled = appStore.useAppStore.getState().shadowOpacityEnabled
      const shadowOpacity = appStore.useAppStore.getState().shadowOpacity
      const shadowColor = appStore.useAppStore.getState().shadowColor
      const shadowsEnabled = appStore.useAppStore.getState().shadowsEnabled
      // Using registry-based ShadowOpacityModifier for compatibility with other modifiers
      
      // Industry-standard: Apply depth masking to all imported model materials
      // This ensures the background/sky cannot be seen through imported objects
      let depthMaskedCount = 0
      // Mark the entire model scene as imported
      model.scene.userData.isImportedModel = true
      model.scene.userData.isModel = true
      
      model.scene.traverse((child) => {
        // Mark all children as imported models
        child.userData.isImportedModel = true
        child.userData.isModel = true
        
        if (child instanceof THREE.Mesh) {
          const rawMaterial = child.material
          const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]
          
          // Detect transparent/transmissive surfaces (glass/windows)
          // CRITICAL: Check for ANY material with transmission > 0 OR transparent flag
          // According to Three.js research, ANY transmission value indicates transparent/glass material
          // This is more aggressive to ensure ALL glass materials are detected
          const isTransparentSurface = materials.some((mat: THREE.Material) => {
            const anyMat = mat as any
            const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
            const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
            const hasTransmission = transmission > 0
            const transparentFlag = anyMat.transparent === true
            
            // Check for MeshPhysicalMaterial with transmission (glass materials)
            // CRITICAL: ANY transmission value > 0 indicates glass/transparent material
            // This is the most reliable indicator of glass/transparent materials
            const isPhysicalWithTransmission = mat instanceof THREE.MeshPhysicalMaterial && hasTransmission
            
            // Check if material name suggests glass/window (common naming conventions)
            // This helps catch materials that might not have explicit transmission but are glass
            const materialName = (mat.name || '').toLowerCase()
            const isGlassLike = materialName.includes('glass') || 
                               materialName.includes('window') || 
                               materialName.includes('windshield') ||
                               materialName.includes('transparent') ||
                               materialName.includes('transmission') ||
                               materialName.includes('glass_') ||
                               materialName.includes('window_') ||
                               materialName.includes('_glass') ||
                               materialName.includes('_window')
            
            // CRITICAL: Detect transparent materials aggressively
            // Priority order:
            // 1. ANY MeshPhysicalMaterial with transmission > 0 (glass materials) - PRIMARY CHECK
            // 2. ANY transmission value > 0 (any transmission indicates transparency)
            // 3. Transparent flag with opacity < 1.0 (any transparency) - MUST catch all transparent materials
            // 4. Glass-like name (common naming conventions)
            // 5. ANY material with transparent=true AND opacity < 1.0 (regardless of name) - CRITICAL FALLBACK
            // This ensures ALL glass materials are detected, even with small transmission values
            // CRITICAL: The last check ensures ANY transparent material (opacity < 1.0) is detected
            return isPhysicalWithTransmission || 
                   hasTransmission || 
                   (transparentFlag && opacity < 1.0) ||
                   isGlassLike ||
                   // CRITICAL: Catch ANY material marked as transparent with reduced opacity
                   // This is essential for materials that don't have transmission or glass-like names
                   (transparentFlag && typeof opacity === 'number' && opacity < 1.0 && opacity > 0.0)
          })

          if (isTransparentSurface) {
            // CRITICAL FIX: For transparent/transmissive surfaces (glass/windows), use customDepthMaterial
            // According to Three.js documentation and research, transparent materials need special handling
            // to allow shadows to pass through them. The solution is to:
            // 1. Set castShadow = false (so material doesn't appear in shadow map)
            // 2. Set depthWrite = false (so material doesn't block shadows in depth buffer)
            // 3. Use customDepthMaterial with alphaTest to discard transparent fragments in shadow map
            // 4. Ensure material is properly marked as transparent
            
            // Disable shadow casting - this is the primary fix
            // When castShadow = false, the material is NOT rendered in the shadow map at all
            child.castShadow = false
            child.receiveShadow = true // Still receive shadows on transparent surfaces
            
            // Configure materials for transparency and shadow passing
            // CRITICAL: Only apply transparent fixes to ACTUALLY transparent materials
            // Don't apply to all materials in the mesh - only transparent ones
            materials.forEach((mat: THREE.Material) => {
              const anyMat = mat as any
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
              const hasTransmission = transmission > 0
              const transparentFlag = anyMat.transparent === true
              const materialName = (mat.name || '').toLowerCase()
              const isGlassLike = materialName.includes('glass') || 
                                 materialName.includes('window') || 
                                 materialName.includes('windshield') ||
                                 materialName.includes('transparent') ||
                                 materialName.includes('transmission')
              
              // CRITICAL: Only apply transparent fixes to materials that ARE transparent
              // Check if THIS specific material is transparent (not just if the mesh has transparent materials)
              const isThisMaterialTransparent = mat instanceof THREE.MeshPhysicalMaterial && hasTransmission ||
                                               hasTransmission ||
                                               (transparentFlag && opacity < 1.0) ||
                                               isGlassLike ||
                                               (transparentFlag && typeof opacity === 'number' && opacity < 1.0 && opacity > 0.0)
              
              if (!isThisMaterialTransparent) {
                // Skip non-transparent materials in this mesh
                return
              }
              
              // For transparent materials, we need to:
              // 1. Keep depthTest = true (for proper depth sorting)
              // 2. Set depthWrite = false (CRITICAL: prevents blocking shadows in depth buffer)
              // 3. Ensure material is marked as transparent
              if (mat.depthTest !== true) {
                mat.depthTest = true
              }
              
              // CRITICAL: Set depthWrite = false for transparent materials
              // This prevents them from writing to the depth buffer, allowing shadows to pass through
              // Without this, transparent materials can still block shadows even with castShadow = false
              mat.depthWrite = false
              
              // Ensure transparency is enabled
              if (!mat.transparent) {
                mat.transparent = true
              }
              
              // CRITICAL: Since castShadow = false, the material won't be in shadow map at all
              // This is the correct approach - transparent materials should NOT cast shadows
              // The material won't block shadows because it's not rendered in the shadow map
              
              // Set shadowSide for proper shadow rendering
              if ('shadowSide' in anyMat) {
                anyMat.shadowSide = anyMat.shadowSide ?? THREE.FrontSide
              }
              
              // Mark material as configured for transparent shadow passing
              // CRITICAL: This prevents other code from overriding our depthWrite = false setting
              // Other code (like HDR enhancement, shadow opacity, etc.) should check this marker
              // before setting depthWrite = true
              if (!mat.userData) {
                mat.userData = {}
              }
              mat.userData.transparentShadowConfigured = true
              
              // Log for debugging - helps verify transparent materials are detected correctly
              console.log(`[ShadowDebug] Configured transparent material: "${mat.name || 'unnamed'}", transmission: ${transmission}, opacity: ${opacity}, castShadow: ${child.castShadow}, depthWrite: ${mat.depthWrite}`)
            })
          } else {
            // For opaque materials, enable shadow casting and receiving
            // CRITICAL: Opaque materials MUST cast shadows to block light correctly
            // This ensures shadows don't pass through solid objects (like car body)
            child.castShadow = true
            child.receiveShadow = true
            
            // Ensure opaque materials have proper depth writing
            // CRITICAL: Only set depthWrite = true if material is truly opaque
            // Check both transparent flag and opacity to avoid conflicts
            // IMPROVED: Respect the transparentShadowConfigured marker to prevent overriding transparent materials
            materials.forEach((mat: THREE.Material) => {
              const anyMat = mat as any
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
              const isTransparent = anyMat.transparent === true || opacity < 1.0 || transmission > 0
              const wasConfiguredTransparent = anyMat.userData?.transparentShadowConfigured === true
              
              // CRITICAL: For opaque materials, ensure depthWrite = true to prevent light bleeding through
              // depthWrite = false allows subsequent meshes to overwrite, causing light to pass through
              if (!isTransparent && !wasConfiguredTransparent) {
                if (mat.depthWrite !== true) {
                  mat.depthWrite = true
                  mat.needsUpdate = true
                }
                // Ensure material is fully opaque
                if (mat.opacity !== undefined && mat.opacity < 1.0) {
                  mat.opacity = 1.0
                  mat.needsUpdate = true
                }
                if (mat.transparent !== false) {
                  mat.transparent = false
                  mat.needsUpdate = true
                }
              }
              
              // CRITICAL: Opaque materials MUST write to depth buffer for proper shadow occlusion
              // depthWrite = true ensures opaque objects block shadows correctly
              // Only set depthWrite = true if material is NOT transparent AND not configured as transparent
              if (!isTransparent && !wasConfiguredTransparent) {
                // Force depthWrite = true for opaque materials to ensure they block shadows
                if (mat.depthWrite !== true) {
                  mat.depthWrite = true
                  mat.needsUpdate = true
                }
              }
            })
          }

          // Set render order to ensure imported models render correctly
          child.renderOrder = 0 // Default render order

          // Apply shadow opacity if enabled
          if (shadowOpacityEnabled && shadowsEnabled && rawMaterial) {
            const mats = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]
            mats.forEach((mat: THREE.Material) => {
              // Skip shadow plane and helpers
              if ((child.userData.isShadowPlane) || (child.userData.isGridHelper) || (child.userData.isAxesHelper)) {
                return
              }

              // Skip ShaderMaterials - they have custom shaders that don't support shadow opacity injection
              if (mat instanceof THREE.ShaderMaterial) {
                return
              }

              shadowOpacityModifierRegistry.applyToMaterial(mat, {
                enabled: true,
                opacity: shadowOpacity,
                color: new THREE.Color(shadowColor)
              })
            })
          }
          
          // Enhance materials for better photorealism with HDR
          const material = child.material
          if (material) {
           const materials = Array.isArray(material) ? material : [material]
                       materials.forEach((mat: THREE.Material) => {
            const isUnlitMaterial =
              mat instanceof THREE.MeshBasicMaterial ||
              (mat as any).userData?.gltfExtensions?.KHR_materials_unlit ||
              (mat as any).isUnlitShaderMaterial === true

              // Industry-standard depth masking: Ensure imported models occlude background
              if (mat.depthTest !== true) {
                mat.depthTest = true
                depthMaskedCount++
              }
              
              // Enable depthWrite for proper depth masking (prevents background bleeding through)
              // CRITICAL: Skip this for transparent materials - they need depthWrite = false to allow shadows to pass through
              // Check if material was already configured as transparent (using marker)
              // OR check if material is actually transparent (has transparent flag, low opacity, or transmission)
              const wasConfiguredTransparent = (mat as any).userData?.transparentShadowConfigured === true
              const anyMat = mat as any
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
              // Check if material is transparent (either configured as transparent OR has transparent properties)
              const isTransparentMat = wasConfiguredTransparent || 
                                       anyMat.transparent === true || 
                                       opacity < 1.0 || 
                                       transmission > 0
              
              // Only set depthWrite = true if material is NOT transparent
              // CRITICAL: The transparentShadowConfigured marker takes precedence - if set, material is transparent
              if (!isTransparentMat && mat.depthWrite !== true) {
                mat.depthWrite = true // Enable depth writing for opaque materials only
                depthMaskedCount++
              }
              
              // Industry-standard: Disable fog on imported models - fog should only affect lighting, not visual appearance
              if ('fog' in mat && (mat as any).fog !== false) {
                (mat as any).fog = false
                mat.needsUpdate = true
              }
              
              // Ensure opacity is properly set for opaque materials
              if (mat instanceof THREE.MeshStandardMaterial || 
                  mat instanceof THREE.MeshPhysicalMaterial ||
                  mat instanceof THREE.MeshPhongMaterial ||
                  mat instanceof THREE.MeshLambertMaterial ||
                  mat instanceof THREE.MeshBasicMaterial) {
                
                const hasAlphaMap = mat.alphaMap !== undefined && mat.alphaMap !== null
                
                // If material appears nearly opaque but has transparency flag, make it fully opaque
                if (!hasAlphaMap && mat.transparent && mat.opacity !== undefined && mat.opacity > 0.99) {
                mat.opacity = 1.0
                mat.transparent = false
                depthMaskedCount++
              } else if (!hasAlphaMap && mat.opacity === undefined) {
                mat.opacity = 1.0
                mat.transparent = false
                depthMaskedCount++
              } else if (hasAlphaMap) {
                // Material uses alpha map - enable alpha testing for better depth masking
                if (mat.alphaTest === undefined || mat.alphaTest === 0) {
                  mat.alphaTest = 0.1 // Discard fragments below this alpha threshold
                  depthMaskedCount++
                }
                // For alpha-mapped materials, check if they're transparent
                // If transparent (detected above or configured as transparent), keep depthWrite = false, otherwise enable depthWrite
                // CRITICAL: Check if material was already configured as transparent (using marker)
                // OR check if material is actually transparent (has transparent flag, low opacity, or transmission)
                const wasConfiguredTransparent = (mat as any).userData?.transparentShadowConfigured === true
                const anyMat = mat as any
                const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
                const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
                // Check if material is transparent (either configured as transparent OR has transparent properties)
                const isTransparentMat = wasConfiguredTransparent || 
                                         anyMat.transparent === true || 
                                         opacity < 1.0 || 
                                         transmission > 0
                
                // IMPROVED: Only set depthWrite = true if material is NOT transparent
                // CRITICAL: The transparentShadowConfigured marker takes precedence - if set, material is transparent
                // wasConfiguredTransparent is already declared above, reuse it
                if (!isTransparentMat && !wasConfiguredTransparent) {
                  mat.depthWrite = true
                }
              }
            }
            
            // Ensure PBR materials are properly configured for reflections
            if (mat instanceof THREE.MeshStandardMaterial || 
                mat instanceof THREE.MeshPhysicalMaterial) {
              // MATCH WEBEXPORT: Don't explicitly set envMap or envMapIntensity
              // Webexport relies on Three.js automatic behavior where materials automatically use scene.environment
              // with default envMapIntensity of 1.0. To match webexport, we clear explicit envMap so materials
              // use scene.environment automatically.
              if (!isUnlitMaterial && currentEnvMap) {
                // Clear explicit envMap so material uses scene.environment automatically (matching webexport)
                if (mat.envMap !== null) {
                  mat.envMap = null
                  // Don't set envMapIntensity - let it use default 1.0 (matching webexport)
                  mat.needsUpdate = true
                  appliedEnvMapCount++
                }
              }
            } else if (mat instanceof THREE.MeshPhongMaterial) {
              // Apply envMap to Phong materials too
              if (!isUnlitMaterial && currentEnvMap && (!mat.envMap || mat.envMap !== currentEnvMap)) {
                mat.envMap = currentEnvMap
                mat.reflectivity = mat.reflectivity || 0.5
                mat.needsUpdate = true
                appliedEnvMapCount++
              }
            } else if (mat instanceof THREE.MeshBasicMaterial) {
              // Preserve unlit materials (common for Google Earth GLBs)
              if ('toneMapped' in mat && mat.toneMapped !== false) {
                ;(mat as any).toneMapped = false
              }
            } else {
              // Replace non-PBR/unknown materials with a reasonable default PBR
              const fallback = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#dddddd'),
                metalness: 0.0,
                roughness: 0.7,
                depthTest: true, // Industry-standard: Enable depth masking
                depthWrite: true, // Industry-standard: Write to depth buffer
                opacity: 1.0, // Ensure fully opaque
                transparent: false // Not transparent
              })
              // Apply envMap to fallback material too
              // CRITICAL: Use HDR intensity if HDR is loaded
              if (currentEnvMap) {
                fallback.envMap = currentEnvMap
                fallback.envMapIntensity = hdrIntensity
              }
              ;(child as THREE.Mesh).material = fallback
              depthMaskedCount++
              appliedFallbackMaterial = true
              if (currentEnvMap) {
                appliedEnvMapCount++
              }
            }
          })
        }
      }
    })
    
    if (appliedEnvMapCount > 0) {
      try {
        console.log(`[MaterialDebug] Applied envMap to ${appliedEnvMapCount} materials during model load (intensity: ${hdrIntensity})`)
      } catch {}
    }
    
    // CRITICAL: If HDR is already loaded, apply it to the newly loaded model's materials only
    // This ensures materials loaded after HDR get the correct envMap and intensity
    // IMPORTANT: Use forceUpdate=false to avoid resetting existing materials in the scene
    // Only the new model's materials need to be updated, not all materials
    try {
      const hdrSystem = (viewer as any)?.hdrSystem
      if (hdrSystem && currentEnvMap && typeof hdrSystem.reapplyToMaterials === 'function') {
        // Apply HDR only to the newly loaded model's materials
        // Use forceUpdate=false to prevent resetting existing materials that already have correct settings
        // This prevents the scene from becoming darker when adding new models
        if (hdrSystem.pmremEnvMap && hdrSystem.config?.intensity !== undefined) {
          // Apply HDR only to materials in the newly loaded model
          model.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  // Only update if material doesn't already have the correct envMap
                  if (mat.envMap !== hdrSystem.pmremEnvMap && mat.envMap !== currentEnvMap) {
                    mat.envMap = hdrSystem.pmremEnvMap || currentEnvMap
                    // Use calculateMaterialIntensity to get correct intensity (metallic materials get 1.5x boost)
                    mat.envMapIntensity = calculateMaterialIntensity(mat, hdrSystem.config.intensity)
                    mat.needsUpdate = true
                  }
                }
              })
            }
          })
          console.log('[MaterialDebug] ✅ Applied HDR to newly loaded model materials only (preserved existing materials)')
        } else {
          // Fallback: use reapplyToMaterials but with forceUpdate=false to avoid resetting existing materials
          hdrSystem.reapplyToMaterials(false) // false = only update materials that need it
          console.log('[MaterialDebug] ✅ Reapplied HDR to materials that needed updates (preserved existing settings)')
        }
      }
    } catch (error) {
      console.warn('[MaterialDebug] Could not apply HDR to new model materials:', error)
    }
    
    if (depthMaskedCount > 0) {
      try {
        console.log(`[DepthMask] Applied depth masking to ${depthMaskedCount} imported model materials - background/sky will not show through`)
      } catch {}
    }
    
    if (appliedFallbackMaterial) {
      try {
        const appStore = await import('../store/useAppStore')
        appStore.useAppStore.getState().setError('Some materials/textures were missing. Applied default editable materials. You can adjust them in the Material panel.')
      } catch {}
    }

    // After HDR/envMap — interior dimming must run last so values are not overwritten
    await applyInteriorEnhancementsToModel(model.scene, scene, viewer)
    refreshHdrShadowPlaneAfterModelLoad(scene, viewer)
    }

    // CRITICAL: Setup CSM materials for newly loaded model if CSM is active
    // CSM requires setupMaterial() to be called on each material to inject shadow shaders
    // This ensures objects receive CSM shadows and don't disappear
    if ((viewer as any).csmShadowSystem && (viewer as any).csmShadowSystem.isEnabled()) {
      try {
        (viewer as any).csmShadowSystem.setupSceneMaterials()
        console.log('[CSMShadowSystem] Setup CSM materials for newly loaded model (loadFromFile)')
      } catch (error) {
        console.warn('[CSMShadowSystem] Failed to setup CSM materials for new model:', error)
      }
    }

    // Texture deduplication is currently DISABLED due to issues with incorrect merging
    // It was causing different textures to be merged incorrectly
    // TODO: Re-enable with better comparison logic (e.g., pixel-level comparison or UUID matching)
    // try {
    //   const { deduplicateTextures } = await import('../utils/textureDeduplication')
    //   const stats = deduplicateTextures(model.scene)
    //   if (stats.texturesMerged > 0 || stats.materialsMerged > 0) {
    //     const memoryMB = (stats.memorySaved / 1024 / 1024).toFixed(2)
    //     console.log(`✅ Texture deduplication: Merged ${stats.texturesMerged} duplicate texture(s) and ${stats.materialsMerged} material(s), saved ~${memoryMB} MB`)
    //   }
    // } catch (error) {
    //   console.warn('⚠️ Could not deduplicate textures:', error)
    // }

    // Position the model AFTER all material processing is complete
    // Use a longer delay to ensure model is fully loaded and all transforms are applied
    // Gaussian splats: only frame camera, do not run positionModelOnGround (would alter DropInViewer)
    setTimeout(() => {
      model.scene.updateMatrixWorld(true)
      
      if (!isGaussianSplat) {
        // Position the model with default settings (skip for Gaussian splats)
        const store = useAppStore.getState()
        if (store.streetsGLIframeOverlay) {
          positionModelOnGround(model.scene, true)
          setTimeout(() => mirrorImportedModelPlacementToRegistry(importedObjectId, model.scene), 2500)
        }
        model.scene.updateMatrixWorld(true)
      }
      
      // Frame the model to center it in the viewport (this only moves the camera, not the model)
      setTimeout(() => {
        if (viewer && viewer.frameObject) {
          console.log('[ModelLoad] Framing model in viewport (from file)')
          viewer.frameObject(model.scene)
          if (viewer.renderer && viewer.camera && viewer.scene) {
            viewer.renderer.render(viewer.scene, viewer.camera)
          }
        }
      }, 150)
      
      if (!isGaussianSplat) {
        setTimeout(() => {
          const store = useAppStore.getState()
          if (store.streetsGLIframeOverlay) {
            positionModelOnGround(model.scene, true)
          }
        }, 50)
      }
    }, 300)
    
    // Update shadow camera bounds and mesh shadow/smooth-shading fixes — skip for Gaussian splats (don't touch DropInViewer internals)
    if (viewer.updateShadowCameraBounds && !isGaussianSplat) {
      setTimeout(() => {
        let shadowFixedCount = 0
        let shadowCastingCount = 0
        let shadowReceivingCount = 0
        
        model.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // CRITICAL: Don't override transparent material settings
            // Transparent materials should have castShadow = false
            const isTransparent = hasTransparentMaterial(child)
            
            // Ensure shadows are enabled on opaque model meshes only
            if (!isTransparent && !child.castShadow) {
              child.castShadow = true
              shadowFixedCount++
            }
            // All meshes should receive shadows (including transparent ones)
            if (!child.receiveShadow) {
              child.receiveShadow = true
              shadowFixedCount++
            }
            // Ensure mesh is visible
            if (!child.visible) {
              child.visible = true
            }
            
            // Count shadows for verification
            if (child.castShadow) shadowCastingCount++
            if (child.receiveShadow) shadowReceivingCount++
          }
        })
        
        if (shadowFixedCount > 0) {
          console.log(`[ShadowDebug] Fixed shadow configuration on ${shadowFixedCount} model meshes after load (from file)`)
        }
        
        // Debug: Verify shadow configuration after model load
        const { scene, renderer } = viewer
        let totalShadowCasting = 0
        let totalShadowReceiving = 0
        const shadowCastingLights: THREE.Light[] = []
        
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            if (obj.castShadow) totalShadowCasting++
            if (obj.receiveShadow) totalShadowReceiving++
          }
          if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
            shadowCastingLights.push(obj)
          }
        })
        
        console.log('[ShadowDebug] After model load verification:', {
          rendererShadowsEnabled: renderer?.shadowMap?.enabled,
          shadowCastingLights: shadowCastingLights.length,
          totalShadowCastingObjects: totalShadowCasting,
          totalShadowReceivingObjects: totalShadowReceiving,
          modelShadowCasting: shadowCastingCount,
          modelShadowReceiving: shadowReceivingCount
        })
        
        // CRITICAL: Ensure smooth shading for all model meshes (fixes polygon visibility on car surfaces)
        let smoothShadingFixedCount = 0
        model.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            const geometry = child.geometry
            
            // Ensure geometry has valid normals for smooth shading
            if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
              geometry.computeVertexNormals()
              smoothShadingFixedCount++
            } else {
              // Check if normals are valid (not all zeros)
              const normals = geometry.attributes.normal.array as Float32Array
              let hasValidNormals = false
              for (let i = 0; i < Math.min(normals.length, 300); i += 3) {
                const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2)
                if (len > 0.1) {
                  hasValidNormals = true
                  break
                }
              }
              if (!hasValidNormals) {
                geometry.computeVertexNormals()
                smoothShadingFixedCount++
              }
            }
            
            // Ensure normals are marked for update
            if (geometry.attributes.normal) {
              geometry.attributes.normal.needsUpdate = true
            }
            
            // Ensure materials have flatShading disabled
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((mat: THREE.Material) => {
                if ('flatShading' in mat && mat.flatShading === true) {
                  mat.flatShading = false
                  mat.needsUpdate = true
                  smoothShadingFixedCount++
                }
              })
            }
          }
        })
        
        if (smoothShadingFixedCount > 0) {
          console.log(`[MaterialDebug] Fixed smooth shading on ${smoothShadingFixedCount} meshes/materials (from file)`)
        }
        
        // Update shadow camera bounds (preserves near plane set by enhanceInternalShadows)
        viewer.updateShadowCameraBounds()
        
        // CRITICAL: Re-apply interior shadow near plane after bounds update
        // updateShadowCameraBounds might recalculate near plane, so we need to ensure it stays at 0.001
        scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow && obj.shadow) {
            // Ensure near plane is small enough for interior shadows
            if (obj.shadow.camera.near > 0.001) {
              obj.shadow.camera.near = 0.001
              obj.shadow.camera.updateProjectionMatrix()
            }
            obj.shadow.needsUpdate = true
          }
        })
      }, 100)
    }
    
    // Force a render update to ensure textures are properly applied
    setTimeout(() => {
      if (viewer && viewer.renderer) {
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
    }, 100)
    
    return model
  }, [])
  
  const loadFromUrl = useCallback(async (
    url: string,
    onProgress?: (progress: number) => void,
    options: { replaceExisting?: boolean } = {}
  ): Promise<LoadedModel> => {
    const storeAtStart = useAppStore.getState()
    const cityModeStreetsGL =
      storeAtStart.renderMode === 'city' &&
      storeAtStart.streetsGLIframeOverlay

    let attempts = 0
    const maxAttempts = 100
    let currentViewer = sharedViewer
    
    if (!cityModeStreetsGL) {
      while (!currentViewer && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
        currentViewer = sharedViewer
      }
      
      if (!currentViewer) {
        currentViewer = sharedViewer
        if (!currentViewer) {
          const errorMsg = 'Viewer not initialized. The 3D viewer is still loading. Please wait a few seconds and try again. If the issue persists, refresh the page.'
          console.error(`[ViewerInit] ${errorMsg} (waited ${attempts * 100}ms)`)
          throw new Error(errorMsg)
        }
      }
      
      if (!currentViewer.scene || !currentViewer.renderer || !currentViewer.camera) {
        const errorMsg = 'Viewer is partially initialized. Please wait a moment and try again.'
        console.error(`[ViewerInit] ${errorMsg}`)
        throw new Error(errorMsg)
      }
    }

    const model = await loadModel({ url }, onProgress)

    let fileName = 'Imported Model'
    if (url) {
      const urlParts = url.split('/')
      fileName = urlParts[urlParts.length - 1] || 'Imported Model'
      fileName = fileName.split('?')[0]
    }

    if (cityModeStreetsGL) {
      tagImportedModelScene(model.scene, fileName, {
        isAutoLoaded: url.includes('Pagani') || url.includes('/files-upload/'),
        fileUrl: url
      })
      model.scene.userData.fileUrl = url

      try {
        const response = await fetch(url)
        if (response.ok) {
          const blob = await response.blob()
          const regFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
          fileRegistry.registerModelFile(fileName, regFile)
        }
      } catch (error) {
        console.warn(`[FileRegistry] Could not fetch and register file from URL ${url}:`, error)
      }

      model.scene.visible = false
      model.scene.userData.renderInStreetsGL = true

      const objectId = registerImportedModelInRegistry(model.scene, fileName, {
        fileUrl: url,
        markStreetsGLPending: true
      })
      streetsGLDebugLog('[ModelLoad] City mode URL import registered:', { fileName, objectId, url })

      setTimeout(() => {
        model.scene.updateMatrixWorld(true)
        positionModelOnGround(model.scene, true)
        setTimeout(() => mirrorImportedModelPlacementToRegistry(objectId, model.scene), 2500)
      }, 100)

      return model
    }

    const viewer = currentViewer!
    
    const { scene, renderer } = viewer
    // Remove previous USER-IMPORTED models to prevent duplicates
    // BUT keep auto-loaded models (like the car) - they have isAutoLoaded flag
    removePreviousModel(scene, options.replaceExisting ?? true)
    
    // If the loaded model contains Revit room data (from DXF), push it into app state
    const storeForRooms = useAppStore.getState()
    if (storeForRooms.setRooms) {
      const rooms: RoomInfo[] = []

      if (model.userData && Array.isArray((model.userData as any).rooms)) {
        rooms.push(...((model.userData as any).rooms as RoomInfo[]))
      } else {
        model.scene.traverse((child) => {
          const anyChild = child as any
          if (anyChild.userData?.isRoom) {
            const matColor =
              anyChild.material && anyChild.material.color
                ? (anyChild.material.color as THREE.Color)
                : null
            const color = matColor ? `#${matColor.getHexString()}` : '#cccccc'
            const room: RoomInfo = {
              id: anyChild.uuid || `room-${rooms.length}`,
              name: anyChild.userData.roomName || anyChild.name || 'Room',
              number: anyChild.userData.roomNumber ?? null,
              color,
              metadata: anyChild.userData.roomMetadata || {},
              mesh: child
            }
            rooms.push(room)
          }
        })
      }

      try {
        console.log('[RoomDebug] Discovered rooms after URL model load:', {
          count: rooms.length,
          fromUserDataArray: !!(model.userData && Array.isArray((model.userData as any).rooms)),
          sample: rooms.slice(0, 5).map((r) => ({
            id: r.id,
            name: r.name,
            number: r.number,
            metadataKeys: Object.keys(r.metadata)
          }))
        })
        ;(window as any).debugRooms = () => rooms
      } catch {}

      storeForRooms.setRooms(rooms)
    }

    // Mark the model for easy identification
    // Industry-standard: Use exclusion layers to prevent sky/environmental effects from modifying imported models
    model.scene.userData.isModel = true
    // Mark as auto-loaded if it's from the Pagani path (car model)
    model.scene.userData.isAutoLoaded = url.includes('Pagani') || url.includes('/files-upload/')
    model.scene.userData.excludeFromSkyModifications = true // Industry-standard exclusion flag
    model.scene.userData.excludeFromWeatherModifications = true // Prevent weather system from modifying imported models
    model.scene.animations = model.animations
    
    // Store file name for display in Objects Panel (fileName resolved above)
    if (!model.scene.name || model.scene.name === '') {
      model.scene.name = fileName
    }
    model.scene.userData.fileName = fileName
    // Store the URL for project save/load
    model.scene.userData.fileUrl = url
    
    // IMPROVED: Try to fetch and register the file for project save/load
    // This allows us to embed file data when saving projects
    try {
      const response = await fetch(url)
      if (response.ok) {
        const blob = await response.blob()
        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
        fileRegistry.registerModelFile(fileName, file)
        console.log(`[FileRegistry] Registered model file from URL: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
      }
    } catch (error) {
      // If fetch fails (CORS, network error, etc.), just log a warning
      // The fileUrl will still be saved for reference
      console.warn(`[FileRegistry] Could not fetch and register file from URL ${url}:`, error)
    }
    
    // Check if Streets GL overlay is enabled - if so, hide model in main scene (it will be rendered in Streets GL)
    // BUT: Revit models should always be visible in main viewer
    const store = useAppStore.getState()
    // Detect Revit models by URL pattern or userData flag
    const isRevitModel = url.includes('/api/revit/download') ||
                         url.includes('/api/revit/upload') ||
                         url.includes('revit') || 
                         model.scene.userData.isRevitModel ||
                         url.toLowerCase().includes('revit')

    const importedObjectId = registerImportedModelInRegistry(model.scene, fileName, {
      fileUrl: url,
      markStreetsGLPending:
        store.streetsGLIframeOverlay &&
        !(model.scene as any).userData?.isGaussianSplatViewer &&
        !isRevitModel
    })
    
    if (isRevitModel) {
      // Revit models should always be visible
      model.scene.visible = true
      model.scene.userData.isRevitModel = true
      model.scene.userData.excludeFromStreetsGLHiding = true
      console.log('[ModelLoad] Revit model detected and marked as always visible', { url, isRevitModel: true })
    } else if (store.streetsGLIframeOverlay && !(model.scene as any).userData?.isGaussianSplatViewer) {
      // Non-Revit models: hide if Streets GL overlay is enabled (Gaussian splats stay visible in main scene)
      model.scene.visible = false // Hide in main scene - will be rendered in Streets GL
      model.scene.userData.renderInStreetsGL = true // Mark for Streets GL rendering
      streetsGLDebugLog('[ModelLoad] Model hidden in main scene (will render in Streets GL):', model.scene.name)
    }
    if ((model.scene as any).userData?.isGaussianSplatViewer === true) {
      model.scene.visible = true
      ;(model.scene as any).userData.excludeFromStreetsGLHiding = true
    }
    
    // Mark all children with exclusion flags (industry-standard recursive tagging)
    // Also exclude imported models from fog and other sky textures (only lighting should affect them)
    let fogDisabledCount = 0
    model.scene.traverse((child) => {
      child.userData.isImportedModel = true
      child.userData.excludeFromSkyModifications = true
      child.userData.excludeFromWeatherModifications = true
      
      // Mark Revit models so they're not hidden by Streets GL overlay
      if (isRevitModel) {
        child.userData.isRevitModel = true
        child.userData.excludeFromStreetsGLHiding = true
        child.visible = true // Ensure visibility
      }
      
      // Industry-standard: Disable fog on imported models - fog should only affect lighting, not visual appearance
      // Fog should affect lighting dynamics (brightness, contrast) but NOT visual textures on imported objects
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((mat: THREE.Material) => {
          // Disable fog on all materials of imported models
          // This ensures fog only affects lighting dynamics, not visual textures
          if ('fog' in mat && (mat as any).fog !== false) {
            (mat as any).fog = false
            mat.needsUpdate = true
            fogDisabledCount++
          }
        })
      }
    })
    
    if (fogDisabledCount > 0) {
      try {
        console.log(`[FogDebug] Disabled fog on ${fogDisabledCount} imported model materials - fog only affects lighting, not visual textures`)
      } catch {}
    }
    
    scene.add(model.scene)
    attachModelAnimations(viewer, model)
    requestAnimationFrame(() => {
      try {
        buildScenePickBVH(scene)
      } catch (error) {
        console.warn('[ModelLoad] Failed to build pick BVH:', error)
      }
    })
    
    // Skip mesh-specific post-processing for Gaussian splat viewers
    const isGaussianSplatUrl = (model.scene as any).userData?.isGaussianSplatViewer === true
    
    // Force visibility for Revit models (in case Streets GL overlay was enabled)
    if (isRevitModel) {
      model.scene.visible = true
      model.scene.traverse((child) => {
        child.visible = true
      })
      console.log('[ModelLoad] Forced Revit model visibility after adding to scene')
    }
    
    // Update bounding boxes, texture filtering, CSM setup — skip for Gaussian splats
    if (!isGaussianSplatUrl) {
      setTimeout(() => {
        if ((viewer as any).updateBoundingBoxes) {
          (viewer as any).updateBoundingBoxes()
        }
      }, 100)
      
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
      const appStore = await import('../store/useAppStore')
      const textureAnisotropy = appStore.useAppStore.getState().textureAnisotropy
      const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
      fixTextureFiltering(model.scene, maxAnisotropy, renderer, customAnisotropy)
      
      if ((viewer as any).csmShadowSystem && (viewer as any).csmShadowSystem.isEnabled()) {
        try {
          (viewer as any).csmShadowSystem.setupSceneMaterials()
          console.log('[CSMShadowSystem] Setup CSM materials for newly loaded model')
        } catch (error) {
          console.warn('[CSMShadowSystem] Failed to setup CSM materials for new model:', error)
        }
      }
    }
    
    // Enable shadows on all meshes in the model (skip for Gaussian splats — no standard meshes)
    if (!isGaussianSplatUrl) {
    // Also enhance materials for better HDR reflections
    let appliedEnvMapCount = 0
    let shadowConfiguredCount = 0
    
    // Get current environment map from scene (if available)
    const currentEnvMap = scene.environment
    
    // CRITICAL: Get HDR intensity if HDR is loaded
    // Materials need the correct envMapIntensity to receive proper lighting from HDR
    let hdrIntensity = 1.0 // Default intensity
    try {
      const hdrSystem = (viewer as any)?.hdrSystem
      if (hdrSystem && typeof hdrSystem.getIntensity === 'function') {
        hdrIntensity = hdrSystem.getIntensity() || 1.0
      } else if (hdrSystem && (hdrSystem as any).config?.intensity !== undefined) {
        hdrIntensity = (hdrSystem as any).config.intensity
      }
    } catch (error) {
      // Fallback to default if HDR system not available
      console.warn('[useViewer] Could not get HDR intensity, using default 1.0')
    }
    
    model.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // CRITICAL: Ensure smooth shading for car surfaces and all models
        // Compute vertex normals if geometry doesn't have them or if they're invalid
        if (child.geometry) {
          const geometry = child.geometry
          
          // Check if geometry has normals
          if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
            // No normals - compute them for smooth shading
            geometry.computeVertexNormals()
            console.log(`[useViewer] Computed vertex normals for mesh: ${child.name || 'unnamed'}`)
          } else {
            // Normals exist - ensure they're valid (not all zeros)
            const normals = geometry.attributes.normal.array as Float32Array
            let hasValidNormals = false
            for (let i = 0; i < Math.min(normals.length, 300); i += 3) { // Check first 100 normals
              const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2)
              if (len > 0.1) {
                hasValidNormals = true
                break
              }
            }
            if (!hasValidNormals) {
              // Normals are invalid (all zeros or too small) - recompute
              geometry.computeVertexNormals()
              console.log(`[useViewer] Recomputed invalid vertex normals for mesh: ${child.name || 'unnamed'}`)
            }
          }
          
          // Ensure normals are marked for update
          if (geometry.attributes.normal) {
            geometry.attributes.normal.needsUpdate = true
          }
        }
        
        // CRITICAL: Don't override transparent material settings
        // Transparent materials should have castShadow = false
        const isTransparent = hasTransparentMaterial(child)
        
        // CRITICAL: Ensure shadows are enabled on opaque meshes BEFORE any other operations
        // Skip transparent materials - they should have castShadow = false
        if (!isTransparent && !child.castShadow) {
          child.castShadow = true
          shadowConfiguredCount++
        } else if (isTransparent && child.castShadow) {
          // Ensure transparent materials don't cast shadows
          child.castShadow = false
        }
        // All meshes should receive shadows (including transparent ones)
        if (!child.receiveShadow) {
          child.receiveShadow = true
          shadowConfiguredCount++
        }
        
        // Ensure mesh is visible (shadows don't work on invisible objects)
        if (!child.visible) {
          child.visible = true
        }
        
        // Enhance materials for better photorealism with HDR
        // CRITICAL: Also ensure materials support shadows
        const material = child.material
        if (material) {
          const materials = Array.isArray(material) ? material : [material]
          const convertedMaterials: THREE.Material[] = []
          let materialWasConverted = false
          
          materials.forEach((originalMat: THREE.Material) => {
            let mat = originalMat
            const isUnlitMaterial =
              mat instanceof THREE.MeshBasicMaterial ||
              (mat as any).userData?.gltfExtensions?.KHR_materials_unlit ||
              (mat as any).isUnlitShaderMaterial === true
            // CRITICAL: MeshBasicMaterial doesn't support shadows - convert to MeshStandardMaterial
            // This is a common issue that prevents shadows from working
            if (mat instanceof THREE.MeshBasicMaterial && !isUnlitMaterial) {
              console.warn(`[ShadowDebug] Converting MeshBasicMaterial to MeshStandardMaterial for shadow support on mesh: ${child.name || 'unnamed'}`)
              const newMat = new THREE.MeshStandardMaterial({
                color: mat.color,
                map: mat.map,
                transparent: mat.transparent,
                opacity: mat.opacity,
                side: mat.side
              })
              convertedMaterials.push(newMat)
              materialWasConverted = true
              
              // Process the converted material
              mat = newMat
            } else {
              convertedMaterials.push(mat)
            }
            
            if (isUnlitMaterial) {
              // Preserve unlit appearance
              if ('toneMapped' in mat && mat.toneMapped !== false) {
                ;(mat as any).toneMapped = false
              }
              if ('envMap' in mat && mat.envMap) {
                ;(mat as any).envMap = null
              }
            }
            
            // CRITICAL: Fix transparent materials for proper shadow rendering
            // Transparent materials (glass, windows) need depthWrite = false to allow shadows to pass through
            const isTransparentMat = isMaterialTransparent(mat)
            if (isTransparentMat) {
              // Transparent materials should NOT cast shadows and should have depthWrite = false
              if (mat.depthWrite !== false) {
                mat.depthWrite = false
                mat.needsUpdate = true
              }
            }
            
            // Ensure PBR materials are properly configured for reflections
            if (mat instanceof THREE.MeshStandardMaterial || 
                mat instanceof THREE.MeshPhysicalMaterial) {
              // MATCH WEBEXPORT: Don't explicitly set envMap or envMapIntensity
              // Webexport relies on Three.js automatic behavior where materials automatically use scene.environment
              // with default envMapIntensity of 1.0. To match webexport, we clear explicit envMap so materials
              // use scene.environment automatically.
              if (!isUnlitMaterial && currentEnvMap) {
                // Clear explicit envMap so material uses scene.environment automatically (matching webexport)
                if (mat.envMap !== null) {
                  mat.envMap = null
                  // Don't set envMapIntensity - let it use default 1.0 (matching webexport)
                  mat.needsUpdate = true
                  appliedEnvMapCount++
                }
              }
            } else if (mat instanceof THREE.MeshPhongMaterial) {
              // Apply envMap to Phong materials too
              if (!isUnlitMaterial && currentEnvMap && (!mat.envMap || mat.envMap !== currentEnvMap)) {
                mat.envMap = currentEnvMap
                mat.reflectivity = mat.reflectivity || 0.5
                mat.needsUpdate = true
                appliedEnvMapCount++
              }
            }
          })
          
          // Update material if any were converted
          if (materialWasConverted) {
            if (Array.isArray(child.material)) {
              child.material = convertedMaterials
            } else {
              child.material = convertedMaterials[0]
            }
          }
        }
        
        // CRITICAL: Ensure smooth shading - compute vertex normals if missing
        if (child.geometry) {
          const geometry = child.geometry
          if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
            geometry.computeVertexNormals()
            if (geometry.attributes.normal) {
              geometry.attributes.normal.needsUpdate = true
            }
          }
        }
      }
    })
    
    if (appliedEnvMapCount > 0) {
      try {
        console.log(`[MaterialDebug] Applied envMap to ${appliedEnvMapCount} materials during model load (from URL)`)
      } catch {}
    }
    
    if (shadowConfiguredCount > 0) {
      try {
        console.log(`[ShadowDebug] Configured shadows on ${shadowConfiguredCount} meshes during model load`)
      } catch {}
    }

    // After material/HDR setup — Pagani auto-load uses loadFromUrl; interior pass was missing here
    await applyInteriorEnhancementsToModel(model.scene, scene, viewer)
    refreshHdrShadowPlaneAfterModelLoad(scene, viewer)
    }
    
    // CRITICAL: Diagnostic check for light and material configuration in standard mode
    // Verify all requirements for shadows are met
    try {
      const { scene, renderer } = viewer
      let meshBasicMaterialCount = 0
      let missingReceiveShadowCount = 0
      let missingCastShadowCount = 0
      let shadowCastingLights: THREE.DirectionalLight[] = []
      
      scene.traverse((obj) => {
        // Check for MeshBasicMaterial (should be converted)
        if (obj instanceof THREE.Mesh && obj.material && obj.userData.isImportedModel) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshBasicMaterial) {
              meshBasicMaterialCount++
              console.warn(`[ShadowDebug] ⚠️ MeshBasicMaterial found (should be converted):`, {
                mesh: obj.name || 'unnamed',
                material: mat.name || 'unnamed',
                isUnlit: (mat as any).userData?.gltfExtensions?.KHR_materials_unlit || false
              })
            }
          })
          
          // Check shadow properties
          if (!obj.receiveShadow) {
            missingReceiveShadowCount++
          }
          
          // Opaque meshes should cast shadows
          const isTransparent = hasTransparentMaterial(obj)
          if (!isTransparent && !obj.castShadow) {
            missingCastShadowCount++
          }
        }
        
        // Check lights
        if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
          shadowCastingLights.push(obj)
        }
      })
      
      // CRITICAL: Check for materials that might allow light bleeding through
      let depthWriteFalseCount = 0
      let doubleSidedOpaqueCount = 0
      let transparentOpaqueCount = 0
      let missingCastShadowOpaqueCount = 0
      const fixedMaterials: Array<{mesh: string, material: string, issue: string, fix: string}> = []
      
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material && obj.userData.isImportedModel) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat) => {
            const anyMat = mat as any
            const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
            const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
            const isTransparent = anyMat.transparent === true || opacity < 1.0 || transmission > 0
            const wasConfiguredTransparent = anyMat.userData?.transparentShadowConfigured === true
            
            // Check for opaque materials with depthWrite = false (allows light bleeding)
            if (!isTransparent && !wasConfiguredTransparent && mat.depthWrite === false) {
              depthWriteFalseCount++
              const meshName = obj.name || 'unnamed'
              const matName = mat.name || 'unnamed'
              fixedMaterials.push({
                mesh: meshName,
                material: matName,
                issue: 'depthWrite=false (allows light through)',
                fix: 'Set depthWrite=true'
              })
              // AUTO-FIX: Set depthWrite = true for opaque materials
              mat.depthWrite = true
              mat.needsUpdate = true
            }
            
            // Check for double-sided opaque materials without depthWrite (might allow light through back faces)
            if (!isTransparent && !wasConfiguredTransparent && mat.side === THREE.DoubleSide && mat.depthWrite !== true) {
              doubleSidedOpaqueCount++
              const meshName = obj.name || 'unnamed'
              const matName = mat.name || 'unnamed'
              fixedMaterials.push({
                mesh: meshName,
                material: matName,
                issue: 'Double-sided without depthWrite (allows light through back faces)',
                fix: 'Set depthWrite=true'
              })
              // AUTO-FIX: Ensure depthWrite = true for double-sided opaque materials
              mat.depthWrite = true
              mat.needsUpdate = true
            }
            
            // Check for materials marked as transparent but are actually opaque
            if (anyMat.transparent === true && opacity >= 1.0 && transmission === 0 && !wasConfiguredTransparent) {
              transparentOpaqueCount++
              const meshName = obj.name || 'unnamed'
              const matName = mat.name || 'unnamed'
              fixedMaterials.push({
                mesh: meshName,
                material: matName,
                issue: 'Marked transparent but actually opaque',
                fix: 'Set transparent=false, opacity=1.0, depthWrite=true'
              })
              // AUTO-FIX: Make material fully opaque
              mat.transparent = false
              mat.opacity = 1.0
              mat.depthWrite = true
              mat.needsUpdate = true
            }
            
            // Check for opaque meshes not casting shadows
            if (!isTransparent && !wasConfiguredTransparent && !obj.castShadow) {
              missingCastShadowOpaqueCount++
              const meshName = obj.name || 'unnamed'
              fixedMaterials.push({
                mesh: meshName,
                material: 'N/A',
                issue: 'Opaque mesh not casting shadows',
                fix: 'Set castShadow=true'
              })
              // AUTO-FIX: Enable shadow casting for opaque meshes
              obj.castShadow = true
            }
          })
        }
      })
      
      // Log summary of fixes if any were applied
      if (fixedMaterials.length > 0) {
        console.log(`[ShadowDebug] ✅ Auto-fixed ${fixedMaterials.length} light bleeding issue(s):`, fixedMaterials)
      } else {
        // Log that check completed with no issues found
        const totalChecked = depthWriteFalseCount + doubleSidedOpaqueCount + transparentOpaqueCount + missingCastShadowOpaqueCount
        if (totalChecked === 0) {
          console.log(`[ShadowDebug] ✅ Light bleeding check completed: No issues found (all materials properly configured)`)
        }
      }
      
      // Log diagnostic summary with full details
      const lightConfigs = shadowCastingLights.map(light => {
        const cam = light.shadow?.camera as THREE.OrthographicCamera | undefined
        return {
          name: light.name || 'unnamed',
          castShadow: light.castShadow,
          enabled: light.visible,
          intensity: light.intensity,
          position: { x: light.position.x, y: light.position.y, z: light.position.z },
          shadowMapSize: light.shadow?.mapSize ? { width: light.shadow.mapSize.width, height: light.shadow.mapSize.height } : null,
          shadowBias: light.shadow?.bias,
          shadowNormalBias: light.shadow?.normalBias,
          shadowRadius: light.shadow?.radius,
          shadowCamera: cam ? {
            near: cam.near,
            far: cam.far,
            left: cam.left,
            right: cam.right,
            top: cam.top,
            bottom: cam.bottom,
            position: { x: cam.position.x, y: cam.position.y, z: cam.position.z }
          } : null
        }
      })
      
      const hasLightBleedingIssues = depthWriteFalseCount > 0 || doubleSidedOpaqueCount > 0 || transparentOpaqueCount > 0 || missingCastShadowOpaqueCount > 0
      const status = meshBasicMaterialCount === 0 && missingReceiveShadowCount === 0 && missingCastShadowCount === 0 && shadowCastingLights.length > 0 && !hasLightBleedingIssues ? '✅ OK' : '⚠️ ISSUES FOUND'
      
      // Create a detailed diagnostic object with light bleeding issues grouped
      const diagnostic = {
        rendererShadowMapEnabled: renderer?.shadowMap?.enabled,
        rendererShadowMapType: renderer?.shadowMap?.type === THREE.PCFSoftShadowMap ? 'PCFSoftShadowMap' : renderer?.shadowMap?.type,
        shadowCastingLights: shadowCastingLights.length,
        lightConfigs,
        meshBasicMaterialCount,
        missingReceiveShadowCount,
        missingCastShadowCount,
        lightBleedingIssues: {
          depthWriteFalseCount,
          doubleSidedOpaqueCount,
          transparentOpaqueCount,
          missingCastShadowOpaqueCount,
          total: depthWriteFalseCount + doubleSidedOpaqueCount + transparentOpaqueCount + missingCastShadowOpaqueCount
        },
        status
      }
      
      console.log('[ShadowDebug] Standard Mode Configuration Check:', diagnostic)
      
      // Log detailed light configuration
      if (shadowCastingLights.length > 0) {
        console.log('[ShadowDebug] Light Configuration Details:', lightConfigs)
      }
      
      // Log light bleeding summary separately for visibility
      if (diagnostic.lightBleedingIssues.total > 0) {
        console.warn('[ShadowDebug] ⚠️ Light bleeding issues detected and auto-fixed:', diagnostic.lightBleedingIssues)
      } else {
        console.log('[ShadowDebug] ✅ No light bleeding issues detected - all materials properly configured')
      }
      
      // Warn if other issues found
      if (meshBasicMaterialCount > 0 || missingReceiveShadowCount > 0 || missingCastShadowCount > 0 || shadowCastingLights.length === 0) {
        console.warn('[ShadowDebug] ⚠️ Shadow configuration issues detected. Shadows may not work correctly.')
      }
      
      // CRITICAL: Additional diagnostic for interior shadow issues
      // Check if shadow camera bounds cover all objects (including interior)
      if (shadowCastingLights.length > 0) {
        try {
          const sceneBox = new THREE.Box3()
          let sceneObjectCount = 0
          let shadowCastingObjectCount = 0
          let objectsOutsideShadowCamera = 0
          
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.userData.isImportedModel) {
              sceneObjectCount++
              if (obj.castShadow) {
                shadowCastingObjectCount++
                const objBox = new THREE.Box3().setFromObject(obj)
                if (!objBox.isEmpty()) {
                  if (sceneObjectCount === 1) {
                    sceneBox.copy(objBox)
                  } else {
                    sceneBox.union(objBox)
                  }
                }
              }
            }
          })
          
          // Check if shadow camera bounds cover all objects
          shadowCastingLights.forEach((light) => {
            if (light.shadow && light.shadow.camera instanceof THREE.OrthographicCamera) {
              const cam = light.shadow.camera
              const shadowBounds = {
                left: cam.left,
                right: cam.right,
                top: cam.top,
                bottom: cam.bottom,
                width: cam.right - cam.left,
                height: cam.top - cam.bottom
              }
              
              const sceneSize = sceneBox.getSize(new THREE.Vector3())
              const sceneMaxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z)
              const shadowMaxDim = Math.max(shadowBounds.width, shadowBounds.height)
              
              // Check if shadow camera bounds are too small
              const coverageRatio = shadowMaxDim / sceneMaxDim
              const isBoundsTooSmall = coverageRatio < 1.5 // Shadow bounds should be at least 1.5x scene size
              
              if (isBoundsTooSmall) {
                console.warn('[ShadowDebug] ⚠️ Shadow camera bounds may be too small for interior shadows:', {
                  shadowBounds,
                  sceneSize: { x: sceneSize.x.toFixed(2), y: sceneSize.y.toFixed(2), z: sceneSize.z.toFixed(2) },
                  sceneMaxDim: sceneMaxDim.toFixed(2),
                  shadowMaxDim: shadowMaxDim.toFixed(2),
                  coverageRatio: coverageRatio.toFixed(2),
                  recommendation: 'Shadow camera bounds should be at least 1.5x scene size to cover interior parts'
                })
              }
              
              // Check shadow map resolution
              const shadowMapSize = light.shadow.mapSize
              const shadowMapResolution = shadowMapSize ? Math.max(shadowMapSize.width, shadowMapSize.height) : 0
              if (shadowMapResolution < 1024) {
                console.warn('[ShadowDebug] ⚠️ Shadow map resolution may be too low for interior details:', {
                  resolution: shadowMapResolution,
                  recommendation: 'Use 1024x1024 or higher for better interior shadow quality'
                })
              }
              
              // Log comprehensive shadow camera info
              console.log('[ShadowDebug] Shadow Camera Analysis:', {
                lightName: light.name || 'unnamed',
                shadowBounds,
                sceneSize: { x: sceneSize.x.toFixed(2), y: sceneSize.y.toFixed(2), z: sceneSize.z.toFixed(2) },
                sceneMaxDim: sceneMaxDim.toFixed(2),
                shadowMaxDim: shadowMaxDim.toFixed(2),
                coverageRatio: coverageRatio.toFixed(2),
                shadowMapResolution,
                near: cam.near,
                far: cam.far,
                status: isBoundsTooSmall ? '⚠️ Bounds may be too small' : '✅ Bounds OK'
              })
            }
          })
          
          // Check for interior objects that might not be casting shadows
          let interiorObjectsNotCastingShadows = 0
          const interiorObjectIssues: Array<{mesh: string, reason: string}> = []
          
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.userData.isImportedModel) {
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
              const isTransparent = materials.some((mat: THREE.Material) => {
                const anyMat = mat as any
                return anyMat.transparent === true || 
                       (typeof anyMat.opacity === 'number' && anyMat.opacity < 1.0) ||
                       (typeof anyMat.transmission === 'number' && anyMat.transmission > 0)
              })
              
              // Opaque objects should cast shadows
              if (!isTransparent && !obj.castShadow) {
                interiorObjectsNotCastingShadows++
                interiorObjectIssues.push({
                  mesh: obj.name || 'unnamed',
                  reason: 'Opaque mesh not casting shadows - allows light to pass through'
                })
                // AUTO-FIX: Enable shadow casting
                obj.castShadow = true
              }
            }
          })
          
          if (interiorObjectsNotCastingShadows > 0) {
            console.warn('[ShadowDebug] ⚠️ Found interior objects not casting shadows (auto-fixed):', {
              count: interiorObjectsNotCastingShadows,
              issues: interiorObjectIssues.slice(0, 10) // Show first 10
            })
          }
          
        } catch (error) {
          console.warn('[ShadowDebug] Failed to run interior shadow diagnostic:', error)
        }
      }
    } catch (error) {
      console.warn('[ShadowDebug] Failed to run diagnostic check:', error)
    }
    
    // Position the model AFTER all material processing is complete
    // Use a longer delay to ensure model is fully loaded and all transforms are applied
    // Gaussian splats: only frame camera, skip positionModelOnGround and shadow/mesh fixes
    setTimeout(() => {
      model.scene.updateMatrixWorld(true)
      
      if (!isGaussianSplatUrl) {
        const store = useAppStore.getState()
        if (store.streetsGLIframeOverlay) {
          positionModelOnGround(model.scene, true)
          setTimeout(() => mirrorImportedModelPlacementToRegistry(importedObjectId, model.scene), 2500)
        }
        model.scene.updateMatrixWorld(true)
      }
      
      setTimeout(() => {
        if (viewer && viewer.frameObject) {
          console.log('[ModelLoad] Framing model in viewport (from URL)')
          viewer.frameObject(model.scene)
          if (viewer.renderer && viewer.camera && viewer.scene) {
            viewer.renderer.render(viewer.scene, viewer.camera)
          }
        }
      }, 150)
      
      if (!isGaussianSplatUrl) {
        setTimeout(() => {
          const store = useAppStore.getState()
          if (store.streetsGLIframeOverlay) {
            positionModelOnGround(model.scene, true)
          }
        }, 50)
      }
    }, 300)
    
    if (viewer.updateShadowCameraBounds && !isGaussianSplatUrl) {
      setTimeout(() => {
        let shadowFixedCount = 0
        let shadowCastingCount = 0
        let shadowReceivingCount = 0
        
        model.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const isTransparent = hasTransparentMaterial(child)
            if (!isTransparent && !child.castShadow) {
              child.castShadow = true
              shadowFixedCount++
            }
            if (!child.receiveShadow) {
              child.receiveShadow = true
              shadowFixedCount++
            }
            if (!child.visible) {
              child.visible = true
            }
            if (child.castShadow) shadowCastingCount++
            if (child.receiveShadow) shadowReceivingCount++
          }
        })
        
        if (shadowFixedCount > 0) {
          console.log(`[ShadowDebug] Fixed shadow configuration on ${shadowFixedCount} model meshes after load (from URL)`)
        }
        
        // Debug: Verify shadow configuration after model load
        const { scene, renderer } = viewer
        let totalShadowCasting = 0
        let totalShadowReceiving = 0
        const shadowCastingLights: THREE.Light[] = []
        
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            if (obj.castShadow) totalShadowCasting++
            if (obj.receiveShadow) totalShadowReceiving++
          }
          if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
            shadowCastingLights.push(obj)
          }
        })
        
        console.log('[ShadowDebug] After model load verification:', {
          rendererShadowsEnabled: renderer?.shadowMap?.enabled,
          shadowCastingLights: shadowCastingLights.length,
          totalShadowCastingObjects: totalShadowCasting,
          totalShadowReceivingObjects: totalShadowReceiving,
          modelShadowCasting: shadowCastingCount,
          modelShadowReceiving: shadowReceivingCount
        })
        
        // Update shadow camera bounds (preserves near plane set by enhanceInternalShadows)
        viewer.updateShadowCameraBounds()
        
        // CRITICAL: Re-apply interior shadow near plane after bounds update
        // updateShadowCameraBounds might recalculate near plane, so we need to ensure it stays at 0.001
        scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow && obj.shadow) {
            // Ensure near plane is small enough for interior shadows
            if (obj.shadow.camera.near > 0.001) {
              obj.shadow.camera.near = 0.001
              obj.shadow.camera.updateProjectionMatrix()
            }
            obj.shadow.needsUpdate = true
          }
        })
      }, 100)
    }
    
    // Force a render update to ensure textures are properly applied
    setTimeout(() => {
      if (viewer && viewer.renderer) {
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
    }, 100)
    
    return model
  }, [])

  const reset = useCallback(() => {
    if (sharedViewer) {
      const { scene } = sharedViewer
      removePreviousModel(scene, true)
      sharedViewer.resetCamera()
    }
  }, [])

  const frameObject = useCallback((object: THREE.Object3D) => {
    const store = useAppStore.getState()
    // In city/hybrid mode with the Streets GL overlay, focus navigates the map camera.
    if (shouldUseStreetsGLFocus()) {
      const bridge = store.streetsGLBridge!
      const { object: focusObj, descriptor } = resolveFocusTarget(object)

      let latLon = resolveObjectFocusLatLon(focusObj, descriptor)
      if (!latLon) {
        const fallbackLat = store.streetsGLGroundLat
        const fallbackLon = store.streetsGLGroundLon
        if (fallbackLat != null && fallbackLon != null) {
          latLon = { lat: fallbackLat, lon: fallbackLon }
        }
      }

      if (latLon && Number.isFinite(latLon.lat) && Number.isFinite(latLon.lon)) {
        const maxScale = Math.max(focusObj.scale.x, focusObj.scale.y, focusObj.scale.z)
        const distance = Math.min(Math.max(maxScale * 40, 40), 500)
        const debug = typeof window !== 'undefined' && (window as any).__streetsGLDebug === true
        if (debug) {
          console.log('[Focus] Streets GL: navigating map to object', {
            lat: latLon.lat,
            lon: latLon.lon,
            distance,
            name: focusObj.name,
            projectObjectId: (focusObj.userData as any)?.projectObjectId,
            bridgeReady: bridge.isReady
          })
        }

        const navigate = () => {
          bridge.navigateTo(latLon!.lat, latLon!.lon, undefined, 45, 0, distance)
        }
        if (bridge.isReady) {
          navigate()
        } else {
          bridge.onReady(navigate)
        }
        return
      }

      if (typeof window !== 'undefined' && (window as any).__streetsGLDebug === true) {
        console.warn('[Focus] Streets GL: no coordinates for object', {
          name: object.name,
          projectObjectId: (object.userData as any)?.projectObjectId
        })
      }
    }
    if (sharedViewer) {
      sharedViewer.frameObject(object)
    }
  }, [])

  return {
    setViewer,
    loadFromFile,
    loadFromUrl,
    reset,
    frameObject,
    viewer: sharedViewer,
  }
}



