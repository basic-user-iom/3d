/**
 * Streets GL registry ↔ project-file persistence (Phase 2–3).
 *
 * Persists iframe-critical object state so save → reload does not lose Mercator
 * anchors / visibility channel / ids, and does not force GPS→anchor rewrite on
 * ResyncCoordinator re-add.
 *
 * On load we restore channel + anchors, then mark iframe presence as `absent`
 * (the iframe is empty after reopen). ResyncCoordinator re-adds when ready.
 *
 * Phase 3: legacy / scene-only snapshots (no `projectObjects`) rebuild the registry
 * from the restored scene with iframe channel defaults — never copy Three.js
 * product-hide (`visible=false`) into `streetsGLVisible`.
 */

import * as THREE from 'three'
import type { ProjectObject, ProjectObjectKind } from '../store/useAppStore'
import type { StreetsGLIframePresence } from './streetsGLIframeVisibility'
import { cacheImportedModelScene } from './importedModelCache'

/** userData keys that must round-trip for correct Streets GL re-add. */
export const STREETS_GL_REGISTRY_USERDATA_KEYS = [
  'streetsGLPosition',
  'streetsGLBaseTransform',
  'streetsGLPlacementWorldPosition',
  'streetsGLVisible',
  'streetsGLIframePresence',
  'renderInStreetsGL',
  'streetsGLAdded',
  'streetsGLPending',
  'fileName',
  'fileUrl',
  'primitiveScale',
  'gpsLat',
  'gpsLon'
] as const

export type StreetsGLRegistryUserDataKey = (typeof STREETS_GL_REGISTRY_USERDATA_KEYS)[number]

function isPlainVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number'
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Pick only Streets GL–critical (+ identity) userData for the project snapshot.
 * Drops transient flags like streetsGLSyncing.
 */
export function pickStreetsGLRegistryUserData(
  userData: Record<string, unknown> | undefined | null
): Record<string, unknown> | undefined {
  if (!userData || typeof userData !== 'object') return undefined
  const out: Record<string, unknown> = {}
  for (const key of STREETS_GL_REGISTRY_USERDATA_KEYS) {
    if (userData[key] === undefined) continue
    const value = userData[key]
    if (key === 'streetsGLPosition' || key === 'streetsGLPlacementWorldPosition') {
      if (isPlainVec3(value)) out[key] = { x: value.x, y: value.y, z: value.z }
      continue
    }
    if (key === 'streetsGLBaseTransform') {
      const t = value as any
      if (
        t &&
        typeof t === 'object' &&
        isPlainVec3(t.position) &&
        isPlainVec3(t.rotation) &&
        isPlainVec3(t.scale)
      ) {
        out[key] = {
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z },
          scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z }
        }
      }
      continue
    }
    if (key === 'streetsGLIframePresence') {
      if (
        value === 'absent' ||
        value === 'pending' ||
        value === 'present' ||
        value === 'hidden'
      ) {
        out[key] = value
      }
      continue
    }
    if (
      key === 'streetsGLVisible' ||
      key === 'renderInStreetsGL' ||
      key === 'streetsGLAdded' ||
      key === 'streetsGLPending'
    ) {
      if (typeof value === 'boolean') out[key] = value
      continue
    }
    if (key === 'fileName' || key === 'fileUrl') {
      if (typeof value === 'string' && value.length > 0) out[key] = value
      continue
    }
    if (key === 'primitiveScale' && isPlainVec3(value)) {
      out[key] = { x: value.x, y: value.y, z: value.z }
      continue
    }
    if ((key === 'gpsLat' || key === 'gpsLon') && typeof value === 'number') {
      out[key] = value
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Serialize live projectObjects for SavedProject.store.projectObjects.
 * Strips threeObjectId (session-local) and normalizes Streets GL userData.
 */
export function serializeProjectObjectsForSave(
  projectObjects: ProjectObject[]
): ProjectObject[] {
  return projectObjects.map((obj) => {
    const userData = pickStreetsGLRegistryUserData(obj.userData as Record<string, unknown> | undefined)
    const saved: ProjectObject = {
      id: obj.id,
      name: obj.name,
      kind: obj.kind,
      transform: cloneJson(obj.transform),
      visible: obj.visible !== false,
      streetsGLObjectId: obj.streetsGLObjectId || obj.id
    }
    if (obj.primitiveType) saved.primitiveType = obj.primitiveType
    if (typeof obj.color === 'number') saved.color = obj.color
    if (obj.gps && typeof obj.gps.lat === 'number' && typeof obj.gps.lon === 'number') {
      saved.gps = { lat: obj.gps.lat, lon: obj.gps.lon }
    }
    if (userData) saved.userData = userData
    return saved
  })
}

/**
 * After project reopen the iframe is empty — keep visibility channel + anchors,
 * but reset presence / streetsGLAdded so ResyncCoordinator re-adds cleanly.
 * Does not invent streetsGLPosition from GPS.
 */
export function normalizeProjectObjectsForLoad(raw: unknown): ProjectObject[] {
  if (!Array.isArray(raw)) return []
  const out: ProjectObject[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || !e.id) continue
    if (!e.transform || typeof e.transform !== 'object') continue
    const t = e.transform as any
    if (!isPlainVec3(t.position) || !isPlainVec3(t.rotation) || !isPlainVec3(t.scale)) continue

    const kind: ProjectObjectKind =
      e.kind === 'primitive' || e.kind === 'imported' || e.kind === 'other'
        ? e.kind
        : 'other'

    const picked = pickStreetsGLRegistryUserData(e.userData as Record<string, unknown> | undefined) || {}
    // Iframe is empty on load — do not claim Present/Hidden/Pending.
    // Phase 3: do NOT treat bare `kind === 'imported'` as iframe-owned (product-only
    // legacy imports must keep Three.js visibility). Channel/presence flags decide.
    const priorPresence = picked.streetsGLIframePresence as StreetsGLIframePresence | undefined
    const wasIframeOwned =
      picked.renderInStreetsGL === true ||
      priorPresence === 'present' ||
      priorPresence === 'hidden' ||
      priorPresence === 'pending' ||
      picked.streetsGLAdded === true ||
      picked.streetsGLVisible !== undefined

    if (wasIframeOwned) {
      picked.renderInStreetsGL = true
      // Preserve explicit hide; default channel open otherwise.
      if (picked.streetsGLVisible !== false) {
        picked.streetsGLVisible = true
      }
      // Absent until ResyncCoordinator re-adds (streetsGLAdded semantics).
      picked.streetsGLIframePresence = 'absent'
      picked.streetsGLAdded = false
      picked.streetsGLPending = false
    }

    const descriptor: ProjectObject = {
      id: e.id,
      name: typeof e.name === 'string' ? e.name : e.id,
      kind,
      transform: {
        position: { x: t.position.x, y: t.position.y, z: t.position.z },
        rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z },
        scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z }
      },
      // Iframe-owned: channel is streetsGLVisible only — never seed hide from polluted
      // descriptor.visible / Three.js product-hide copied into older saves.
      visible: wasIframeOwned
        ? picked.streetsGLVisible !== false
        : e.visible !== false,
      streetsGLObjectId:
        typeof e.streetsGLObjectId === 'string' && e.streetsGLObjectId
          ? e.streetsGLObjectId
          : e.id
    }
    if (typeof e.primitiveType === 'string') descriptor.primitiveType = e.primitiveType
    if (typeof e.color === 'number') descriptor.color = e.color
    if (e.gps && typeof e.gps === 'object') {
      const g = e.gps as { lat?: unknown; lon?: unknown }
      if (typeof g.lat === 'number' && typeof g.lon === 'number') {
        descriptor.gps = { lat: g.lat, lon: g.lon }
      }
    }
    if (Object.keys(picked).length > 0) descriptor.userData = picked
    out.push(descriptor)
  }
  return out
}

/**
 * Stamp restored registry Streets GL fields onto live scene meshes / roots.
 * Matches by projectObjectId, streetsGLObjectId, then imported fileName.
 */
export function applyStreetsGLRegistryToScene(
  scene: THREE.Object3D,
  projectObjects: ProjectObject[]
): number {
  if (!projectObjects.length) return 0
  const byId = new Map<string, ProjectObject>()
  const byFileName = new Map<string, ProjectObject>()
  for (const d of projectObjects) {
    byId.set(d.id, d)
    if (d.streetsGLObjectId) byId.set(d.streetsGLObjectId, d)
    const fileName = d.userData?.fileName
    if (typeof fileName === 'string' && fileName) {
      byFileName.set(fileName, d)
      const base = fileName.split('/').pop()?.split('\\').pop()
      if (base) byFileName.set(base, d)
    }
  }

  let stamped = 0
  scene.traverse((obj) => {
    const ud = obj.userData as any
    if (!ud?.isModel && !ud?.isImportedModel && !ud?.isPrimitive) return

    let descriptor: ProjectObject | undefined
    if (typeof ud.projectObjectId === 'string') descriptor = byId.get(ud.projectObjectId)
    if (!descriptor && typeof ud.streetsGLObjectId === 'string') {
      descriptor = byId.get(ud.streetsGLObjectId)
    }
    if (!descriptor && typeof ud.fileName === 'string') {
      descriptor = byFileName.get(ud.fileName) || byFileName.get(ud.fileName.split('/').pop() || '')
    }
    if (!descriptor) return

    ud.projectObjectId = descriptor.id
    ud.streetsGLObjectId = descriptor.streetsGLObjectId || descriptor.id
    const extra = descriptor.userData || {}
    for (const key of STREETS_GL_REGISTRY_USERDATA_KEYS) {
      if (extra[key] !== undefined) ud[key] = cloneJson(extra[key])
    }
    if (descriptor.gps) {
      ud.gpsLat = descriptor.gps.lat
      ud.gpsLon = descriptor.gps.lon
    }
    // Dual-ownership: iframe-owned imports stay hidden in Three.js; channel is streetsGLVisible.
    if (extra.renderInStreetsGL === true) {
      ud.renderInStreetsGL = true
      obj.visible = false
    }
    if (descriptor.kind === 'imported') {
      cacheImportedModelScene(descriptor.id, obj)
    }
    stamped++
  })
  return stamped
}

/**
 * Extract Streets GL fields from a live mesh for scene-object serialization
 * (belt-and-suspenders alongside store.projectObjects).
 */
export function extractStreetsGLFieldsFromMesh(
  obj: THREE.Object3D
): Record<string, unknown> {
  const ud = obj.userData as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof ud.projectObjectId === 'string') out.projectObjectId = ud.projectObjectId
  if (typeof ud.streetsGLObjectId === 'string') out.streetsGLObjectId = ud.streetsGLObjectId
  const picked = pickStreetsGLRegistryUserData(ud)
  if (picked) Object.assign(out, picked)
  return out
}

function isLegacyRootImport(obj: THREE.Object3D): boolean {
  const ud = obj.userData as any
  if (ud?.isGaussianSplatViewer || ud?.excludeFromStreetsGLHiding) return false
  if (ud?.isModel !== true || !ud?.fileName) return false
  // Skip child meshes of another named import root.
  if (obj.parent && (obj.parent as any).userData?.fileName && (obj.parent as any).userData?.isModel) {
    return false
  }
  return true
}

function isLegacyRootPrimitive(obj: THREE.Object3D, sceneRoot: THREE.Object3D): boolean {
  const ud = obj.userData as any
  if (ud?.isPrimitive !== true) return false
  if (ud?.isGaussianSplatViewer || ud?.excludeFromStreetsGLHiding) return false
  // Prefer direct scene children; also accept roots that are not nested under another primitive.
  if (obj.parent && obj.parent !== sceneRoot && (obj.parent as any).userData?.isPrimitive) {
    return false
  }
  return true
}

/**
 * Phase 3: Rebuild `projectObjects` from a restored Three.js scene when the snapshot
 * had no `store.projectObjects` (legacy / scene-only).
 *
 * - Defaults iframe channel open (`streetsGLVisible=true`) unless user-hidden on mesh.
 * - Presence → `absent` (via normalize) so ResyncCoordinator re-adds.
 * - Never copies Three.js `visible=false` (city product-hide) into the iframe channel.
 * - Preserves Mercator anchors / GPS / ids already on scene userData; does not invent anchors.
 *
 * @param streetsGLContext When true (city/hybrid/overlay), mark imports as iframe-owned.
 */
export function rebuildProjectObjectsFromSceneForLegacyLoad(
  scene: THREE.Object3D,
  opts?: { streetsGLContext?: boolean }
): ProjectObject[] {
  const streetsGLContext = opts?.streetsGLContext === true
  const raw: Record<string, unknown>[] = []
  const seenIds = new Set<string>()

  scene.traverse((obj) => {
    const ud = obj.userData as any
    const isImport = isLegacyRootImport(obj)
    const isPrimitive = isLegacyRootPrimitive(obj, scene)
    if (!isImport && !isPrimitive) return

    const fileName = typeof ud.fileName === 'string' ? ud.fileName : undefined
    const id =
      (typeof ud.projectObjectId === 'string' && ud.projectObjectId) ||
      (typeof ud.streetsGLObjectId === 'string' && ud.streetsGLObjectId) ||
      (fileName ? `legacy_${fileName}` : `legacy_${obj.uuid}`)

    if (seenIds.has(id)) return
    seenIds.add(id)

    const picked = pickStreetsGLRegistryUserData(ud) || {}
    const hadStreetsFields =
      picked.renderInStreetsGL === true ||
      picked.streetsGLVisible !== undefined ||
      picked.streetsGLPosition !== undefined ||
      picked.streetsGLAdded === true ||
      picked.streetsGLPending === true ||
      picked.streetsGLIframePresence !== undefined

    // City/hybrid/overlay OR scene already carries Streets GL fields → iframe channel rules.
    // Pure product legacy keeps Three.js visibility (no channel invent).
    const treatAsIframeOwned = streetsGLContext || hadStreetsFields

    // Explicit user hide only — never obj.visible (city product dual-ownership hide).
    const channelHidden = picked.streetsGLVisible === false

    const userData: Record<string, unknown> = { ...picked }
    if (fileName) userData.fileName = fileName
    if (typeof ud.fileUrl === 'string' && ud.fileUrl) userData.fileUrl = ud.fileUrl
    if (ud.primitiveScale && isPlainVec3(ud.primitiveScale)) {
      userData.primitiveScale = {
        x: ud.primitiveScale.x,
        y: ud.primitiveScale.y,
        z: ud.primitiveScale.z
      }
    }
    if (treatAsIframeOwned) {
      userData.renderInStreetsGL = true
      if (!channelHidden) userData.streetsGLVisible = true
    }

    const entry: Record<string, unknown> = {
      id,
      name: obj.name || fileName || id,
      kind: isPrimitive ? 'primitive' : 'imported',
      transform: {
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
      },
      visible: treatAsIframeOwned
        ? channelHidden
          ? false
          : true
        : obj.visible !== false,
      streetsGLObjectId:
        (typeof ud.streetsGLObjectId === 'string' && ud.streetsGLObjectId) || id,
      userData
    }

    if (typeof ud.primitiveType === 'string') entry.primitiveType = ud.primitiveType
    if (typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number') {
      entry.gps = { lat: ud.gpsLat, lon: ud.gpsLon }
    }

    raw.push(entry)
  })

  return normalizeProjectObjectsForLoad(raw)
}
