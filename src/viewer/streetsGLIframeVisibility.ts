/**
 * Streets GL iframe visibility — single source of truth.
 *
 * Phase 0 invariants:
 * 1. Three.js `object.visible=false` on city/hybrid imports means "product viewer hidden;
 *    iframe owns the draw". NEVER copy it into bridge payloads.
 * 2. Mesh `userData.streetsGLVisible` is the ONLY iframe visibility channel. Descriptor
 *    `visible` / descriptor-only `streetsGLVisible=false` are treated as pollution when
 *    the mesh channel is open (or unset) — that was the show→hide regression.
 * 3. Transform sync is pose-only: never include `visible` unless the user explicitly
 *    dirty-toggled via `setIframeVisible(..., { pushToBridge: true })`.
 * 4. `setIframeVisible` persists the channel on mesh.userData AND the project registry.
 *
 * Phase 1: light iframe presence enum (`Absent | Pending | Present | Hidden`) lives on
 * mesh.userData.streetsGLIframePresence (+ registry mirror). Heal/resync read it instead
 * of guessing from leftover streetsGLAdded / streetsGLPending flags alone.
 *
 * Phase 2: project save/load persists anchors + streetsGLVisible + presence (normalized
 * to Absent on load). ResyncCoordinator re-adds; GPS must not rewrite restored anchors.
 *
 * Phase 3: legacy / scene-only loads (no projectObjects) rebuild registry from the
 * restored scene with channel defaults; never copy Three.js product-hide into the channel.
 *
 * Bridge `{ visible }` RPCs: ONLY via `setIframeVisible(..., { pushToBridge: true })`
 * (user Objects Panel toggle, or intentional heal that reasserts through this API).
 */

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import type { ProjectObject } from '../store/useAppStore'
import type { StreetsGLBridge } from '../utils/streetsGLBridge'
import { getCachedImportedModelScene } from './importedModelCache'

/**
 * Iframe lifecycle for a registry/mesh object at the Streets GL sync boundary.
 * - absent: not in the iframe (and not mid-add)
 * - pending: add/resync in flight
 * - present: in iframe and should draw
 * - hidden: in iframe but user-hidden (Objects Panel)
 */
export type StreetsGLIframePresence = 'absent' | 'pending' | 'present' | 'hidden'

const PRESENCE_KEY = 'streetsGLIframePresence' as const

/** Read presence from mesh, falling back to legacy streetsGLAdded / Pending / Visible flags. */
export function getIframePresence(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): StreetsGLIframePresence {
  const ud = obj.userData as any
  const descUd = descriptor?.userData as any
  const explicit = (ud[PRESENCE_KEY] ?? descUd?.[PRESENCE_KEY]) as
    | StreetsGLIframePresence
    | undefined
  if (
    explicit === 'absent' ||
    explicit === 'pending' ||
    explicit === 'present' ||
    explicit === 'hidden'
  ) {
    return explicit
  }

  const added = ud.streetsGLAdded === true || descUd?.streetsGLAdded === true
  const pending = ud.streetsGLPending === true || descUd?.streetsGLPending === true
  if (pending && !added) return 'pending'
  if (!added) return 'absent'
  if (ud.streetsGLVisible === false) return 'hidden'
  return 'present'
}

/**
 * Write presence on mesh (+ optional registry). Also keeps legacy streetsGLAdded /
 * streetsGLPending in sync so older readers keep working.
 */
export function setIframePresence(
  mesh: THREE.Object3D,
  presence: StreetsGLIframePresence,
  opts?: { projectId?: string; persistRegistry?: boolean }
): void {
  const ud = mesh.userData as any
  ud[PRESENCE_KEY] = presence

  switch (presence) {
    case 'absent':
      ud.streetsGLAdded = false
      ud.streetsGLPending = false
      break
    case 'pending':
      ud.streetsGLAdded = false
      ud.streetsGLPending = true
      break
    case 'present':
      ud.streetsGLAdded = true
      ud.streetsGLPending = false
      if (ud.streetsGLVisible === undefined) ud.streetsGLVisible = true
      break
    case 'hidden':
      ud.streetsGLAdded = true
      ud.streetsGLPending = false
      ud.streetsGLVisible = false
      break
  }

  const projectId = opts?.projectId ?? (ud.projectObjectId as string | undefined)
  if (opts?.persistRegistry !== false && projectId) {
    const store = useAppStore.getState()
    const existing = store.projectObjects.find((p) => p.id === projectId)
    store.updateProjectObject(projectId, {
      userData: {
        ...(existing?.userData || {}),
        [PRESENCE_KEY]: presence,
        streetsGLAdded: ud.streetsGLAdded === true,
        streetsGLPending: ud.streetsGLPending === true,
        ...(presence === 'hidden'
          ? { streetsGLVisible: false, renderInStreetsGL: true }
          : presence === 'present'
            ? { streetsGLVisible: ud.streetsGLVisible !== false, renderInStreetsGL: true }
            : {})
      }
    })
  }
}

/**
 * True when this object is authored for iframe display while the Three.js root may be hidden.
 */
export function isStreetsGLIframeRenderable(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): boolean {
  const ud = obj.userData as any
  const descUd = descriptor?.userData as any
  if (ud.renderInStreetsGL === true || descUd?.renderInStreetsGL === true) return true
  if (ud.streetsGLVisible !== undefined || descUd?.streetsGLVisible !== undefined) return true
  const projectId = (ud.projectObjectId as string | undefined) || descriptor?.id
  if (projectId) {
    const cached = getCachedImportedModelScene(projectId)
    if ((cached?.userData as any)?.renderInStreetsGL === true) return true
  }
  // City registry proxies often omit renderInStreetsGL but still represent iframe objects.
  if (descUd?.streetsGLAdded === true || ud.streetsGLAdded === true) return true
  return false
}

/**
 * Establish the iframe visibility channel on an object that should render in Streets GL.
 * Sets `renderInStreetsGL` and defaults mesh `streetsGLVisible=true` unless the user hid it
 * on the mesh itself. Call before any bridge serialize / transform sync / resync.
 */
export function ensureStreetsGLIframeVisibilityChannel(
  obj: THREE.Object3D,
  descriptor?: ProjectObject,
  opts?: { markRenderable?: boolean }
): void {
  const ud = obj.userData as any
  const store = useAppStore.getState()
  const already = isStreetsGLIframeRenderable(obj, descriptor)
  const shouldMark =
    opts?.markRenderable === true ||
    already ||
    store.streetsGLIframeOverlay === true ||
    (obj.visible === false &&
      (descriptor?.kind === 'imported' ||
        ud.isModel === true ||
        ud.isImportedModel === true ||
        descriptor?.kind === 'primitive' ||
        ud.isPrimitive === true))

  if (!shouldMark) return

  ud.renderInStreetsGL = true
  // Mesh-level flag is authoritative. Descriptor-only streetsGLVisible=false is often
  // Three.js-hide pollution — do NOT let it clobber a mesh channel ViewerCanvas/import opened.
  // Objects Panel hide sets streetsGLVisible=false on the mesh itself via setIframeVisible.
  if (ud.streetsGLVisible === false) {
    // keep explicit mesh hide
  } else {
    ud.streetsGLVisible = true
  }
}

/**
 * Resolve whether the object should render in the Streets GL iframe.
 * Alias: getIframeVisible — prefer this name at new call sites.
 */
export function getIframeVisible(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): boolean {
  const ud = obj.userData as any

  if (isStreetsGLIframeRenderable(obj, descriptor)) {
    // Panel hide must set streetsGLVisible=false on the MESH/proxy itself.
    // Descriptor-only streetsGLVisible=false is registry pollution — honoring it caused
    // "shows then disappears" when a later transform/resync pushed visible:false.
    if (ud.streetsGLVisible === false) return false
    return true
  }

  const descriptorVisible = descriptor?.visible
  if (descriptorVisible === false) return false
  return obj.visible !== false
}

/** @deprecated Prefer getIframeVisible — kept for existing imports. */
export const getStreetsGLVisibleFromObject = getIframeVisible

export type SetIframeVisibleOptions = {
  /** Registry id; defaults to mesh.userData.projectObjectId */
  projectId?: string
  /** Persist channel onto projectObjects (default true when projectId known) */
  persistRegistry?: boolean
  /** When true, also RPC `{ visible }` to the iframe (user hide/show only) */
  pushToBridge?: boolean
  bridge?: StreetsGLBridge | null
  streetsGLId?: string
}

/**
 * Set the iframe visibility channel. Persists on mesh.userData and (by default) the registry.
 * Only pushes `{ visible }` to the bridge when `pushToBridge: true` (user toggle or heal).
 * This is the SOLE allowed path for `bridge.updateObject(..., { visible })`.
 */
export function setIframeVisible(
  mesh: THREE.Object3D,
  visible: boolean,
  opts?: SetIframeVisibleOptions
): void {
  const ud = mesh.userData as any
  ud.renderInStreetsGL = true
  ud.streetsGLVisible = visible

  const projectId =
    opts?.projectId ?? (ud.projectObjectId as string | undefined)
  const persistRegistry = opts?.persistRegistry !== false && !!projectId

  // Presence: once an object has been (or is being) synced, toggle Present ↔ Hidden.
  // Do not invent Present for pure channel opens on never-synced meshes.
  const prior = getIframePresence(mesh)
  if (prior === 'present' || prior === 'hidden' || prior === 'pending' || ud.streetsGLAdded === true) {
    const next: StreetsGLIframePresence = visible ? 'present' : 'hidden'
    ud[PRESENCE_KEY] = next
    if (visible) {
      ud.streetsGLAdded = true
      ud.streetsGLPending = false
    } else {
      ud.streetsGLAdded = true
      ud.streetsGLPending = false
    }
  }

  if (persistRegistry && projectId) {
    const store = useAppStore.getState()
    const existing = store.projectObjects.find((p) => p.id === projectId)
    store.updateProjectObject(projectId, {
      visible,
      userData: {
        ...(existing?.userData || {}),
        renderInStreetsGL: true,
        streetsGLVisible: visible,
        ...(ud[PRESENCE_KEY]
          ? {
              [PRESENCE_KEY]: ud[PRESENCE_KEY],
              streetsGLAdded: ud.streetsGLAdded === true,
              streetsGLPending: ud.streetsGLPending === true
            }
          : {})
      }
    })
  }

  if (opts?.pushToBridge) {
    const bridge = opts.bridge ?? useAppStore.getState().streetsGLBridge
    const streetsGLId =
      opts.streetsGLId ??
      (ud.streetsGLObjectId as string | undefined) ??
      projectId
    if (bridge && streetsGLId) {
      bridge.updateObject(streetsGLId, { visible }).catch((err) => {
        console.warn(
          '[StreetsGLVisibility] Failed to push iframe visibility:',
          streetsGLId,
          err
        )
      })
    }
  }
}

/**
 * Visibility value for bridge serialize / add payloads.
 * Never returns Three.js object.visible for iframe-renderable meshes.
 */
export function resolveIframeVisibleForBridge(
  obj: THREE.Object3D,
  descriptor?: ProjectObject
): boolean {
  ensureStreetsGLIframeVisibilityChannel(obj, descriptor)
  return getIframeVisible(obj, descriptor)
}
