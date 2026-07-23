/**
 * Streets GL Bridge - Client Side
 * Communicates with Streets GL iframe to add/manipulate objects
 */

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import {
  extractIndexRangeGeometry,
  forceReduceToTriangleBudget,
  meshoptSimplifyToTriangleBudget,
  simpleDecimation
} from './geometryRepair'
import { resolveIframeVisibleForBridge } from '../viewer/streetsGLIframeVisibility'
import {
  DEFAULT_STREETS_GL_ORIGIN,
  envelopeHasCapability,
  generateBridgeCapability,
  isAllowedStreetsGLOrigin,
  parseBridgeEnvelope,
  readCapabilityFromUrl,
  readOriginFromUrl,
  STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES,
  STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS,
  STREETS_GL_BRIDGE_MAX_VERTICES,
  validateExternalObjectGeometry,
  validateSyncObjectsPayload
} from './streetsGLBridgeSecurity'

const isStreetsGLDebugEnabled = (): boolean =>
  typeof window !== 'undefined' && (window as any).__streetsGLDebug === true

/**
 * Vertex budget for a single Streets GL bridge payload (postMessage structured clone).
 * Kept in lockstep with SEC-5 `STREETS_GL_BRIDGE_MAX_VERTICES`.
 */
export const STREETS_GL_MAX_VERTICES = STREETS_GL_BRIDGE_MAX_VERTICES

/** Warn when geometry exceeds this; still attempt sync with TypedArrays. */
export const STREETS_GL_LARGE_VERTEX_WARN = Math.floor(STREETS_GL_MAX_VERTICES * 0.75)

/**
 * extractMeshParts expands indexed triangles to unique verts (3 corners / tri).
 * Target triangle count so expanded vertex count stays under the budget.
 */
const STREETS_GL_EXPAND_VERTS_PER_TRI = 3


/**
 * Cap unique textured/solid parts per object. Materials that share a texture.uuid are
 * merged into one part (correct UVs). Distinct textures become separate draw parts so
 * we never sample one atlas with another mesh's UVs (the striped/scrambled look).
 */
export const STREETS_GL_MAX_MESH_PARTS = 48

/**
 * Max edge length (px) when serializing textures for Streets GL postMessage.
 * Prefer near-original resolution with a firm cap — 512/2k looked muddy vs Product mode
 * on Meshy/GLB buildings with 4k–8k albedos. 4096 keeps roof-tile detail visible; binary
 * ArrayBuffer transfer avoids base64 data-URL budget forcing further half-size retries.
 */
export const STREETS_GL_MAX_TEXTURE_SIZE = 4096

/** JPEG quality for opaque albedo maps sent across the bridge. */
const STREETS_GL_TEXTURE_JPEG_QUALITY = 0.92

/** Compressed texture payload for Streets GL (prefer bytes over data URL). */
export interface StreetsGLSerializedTexture {
  mime: string
  width: number
  height: number
  /** Preferred postMessage transport — no base64 inflation. */
  bytes?: ArrayBuffer
  /** Legacy/fallback when bytes unavailable or under the data-URL char budget. */
  dataUrl?: string
}

export interface GeometryData {
  positions: number[] | Float32Array // [x, y, z, x, y, z, ...]
  indices?: number[] | Uint32Array // [i1, i2, i3, i1, i2, i3, ...]
  normals?: number[] | Float32Array // [nx, ny, nz, nx, ny, nz, ...]
  uvs?: number[] | Float32Array // [u, v, u, v, ...]
}

/** One draw call worth of geometry + its matching base-color map (or solid color). */
export interface StreetsGLMeshPart {
  geometry: GeometryData
  color?: { r: number; g: number; b: number }
  /** Legacy string transport (kept for small maps / older iframe builds). */
  baseColorTextureDataUrl?: string
  /** Preferred: compressed JPEG/PNG bytes (structured-clone ArrayBuffer). */
  baseColorTextureBytes?: ArrayBuffer
  baseColorTextureMime?: string
}

export interface StreetsGLObject {
  id: string
  type: 'box' | 'sphere' | 'marker' | 'custom'
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  color?: { r: number; g: number; b: number }
  visible?: boolean
  metadata?: any
  geometry?: GeometryData // Optional geometry data for rendering (legacy / single-part)
  /** Per-texture (or solid-color) mesh parts — preferred over flattening to one material. */
  parts?: StreetsGLMeshPart[]
}

export interface BridgeResponse {
  type: string
  payload: any
  timestamp: number
}

/**
 * Result of an addObject call.
 * - success: the object was acknowledged as added by Streets GL.
 * - queued: the bridge was not ready, so the object was queued and will be added
 *   automatically once the bridge becomes ready. Callers should treat `queued` as a
 *   non-failure and persist the object id (the queued object keeps the same id when flushed).
 */
export interface AddObjectResult {
  success: boolean
  queued: boolean
}

/** Selected / hidden native OSM building (Streets GL packed feature id). */
export interface StreetsGLBuildingRef {
  buildingId: number
  osmType?: number
  osmId?: number
  osmTypeName?: string
}

/** Default timeout for bridge RPCs that must not hang across iframe reload. */
const STREETS_GL_RPC_TIMEOUT_MS = 8_000

export class StreetsGLBridge {
  private iframe: HTMLIFrameElement | null = null
  private iframeWindow: Window | null = null
  private bridgeReady: boolean = false
  private disposed = false
  private readyCallbacks: Array<() => void> = []
  private messageHandlers: Map<string, Array<(payload: any) => void>> = new Map()
  private pendingObjects: Map<string, StreetsGLObject> = new Map()
  private pendingNavigation: {
    lat: number
    lon: number
    pitch: number
    yaw: number
    distance: number
  } | null = null
  private messageListener: ((event: MessageEvent) => void) | null = null
  private cameraSubscribers = new Set<
    (payload: {
      cameraPosition: { x: number; y: number; z: number }
      cameraTarget?: { x: number; y: number; z: number }
    }) => void
  >()
  private cameraPollTimer: ReturnType<typeof setInterval> | null = null
  private cameraPollInFlight = false
  private cameraPollIntervalMs = 150
  /** Per-session capability shared with the Streets GL iframe via URL + postMessage. */
  private readonly capability: string
  /** Exact postMessage targetOrigin for the Streets GL iframe. */
  private readonly targetOrigin: string

  constructor(
    iframe: HTMLIFrameElement,
    options?: { capability?: string; targetOrigin?: string }
  ) {
    this.iframe = iframe
    this.iframeWindow = iframe.contentWindow
    const srcOrigin = readOriginFromUrl(iframe.src)
    this.capability =
      options?.capability ||
      readCapabilityFromUrl(iframe.src) ||
      generateBridgeCapability()
    this.targetOrigin =
      options?.targetOrigin ||
      (srcOrigin && isAllowedStreetsGLOrigin(srcOrigin) ? srcOrigin : DEFAULT_STREETS_GL_ORIGIN)
    this.setupMessageListener()
    this.waitForBridge()
  }

  /**
   * Await a single bridge response with timeout. Prevents hung promises when the
   * iframe reloads / dispose() clears handlers mid-flight (remove/update races).
   */
  private awaitBridgeResponse<T>(
    eventType: string,
    send: () => void,
    match: (payload: any) => boolean,
    onMatch: (payload: any) => T,
    onFail: () => T,
    timeoutMs = STREETS_GL_RPC_TIMEOUT_MS,
    timeoutLabel?: string
  ): Promise<T> {
    return new Promise((resolve) => {
      if (this.disposed || !this.bridgeReady) {
        resolve(onFail())
        return
      }

      const timeout = setTimeout(() => {
        this.off(eventType, handler)
        if (timeoutLabel) {
          console.warn(`[StreetsGLBridge] ${timeoutLabel} (timeout ${timeoutMs}ms)`)
        }
        resolve(onFail())
      }, timeoutMs)

      const handler = (payload: any) => {
        if (!match(payload)) return
        clearTimeout(timeout)
        this.off(eventType, handler)
        resolve(onMatch(payload))
      }

      this.on(eventType, handler)
      try {
        send()
      } catch (error) {
        clearTimeout(timeout)
        this.off(eventType, handler)
        console.error('[StreetsGLBridge] Failed to send', eventType, error)
        resolve(onFail())
      }
    })
  }

  private debugLog(...args: any[]): void {
    if (isStreetsGLDebugEnabled()) {
      console.log(...args)
    }
  }

  private debugWarn(...args: any[]): void {
    if (isStreetsGLDebugEnabled()) {
      console.warn(...args)
    }
  }

  private setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      // SEC-5: exact origin + source window + per-session capability
      if (!isAllowedStreetsGLOrigin(event.origin)) return
      if (event.source !== this.iframeWindow) return

      const envelope = parseBridgeEnvelope(event.data)
      if (!envelope) return
      if (!envelopeHasCapability(envelope, this.capability)) return

      const { type, payload } = envelope

      switch (type) {
        case 'STREETS_GL_BRIDGE_READY':
          this.handleBridgeReady()
          break
        case 'STREETS_GL_OBJECT_ADDED':
          this.handleResponse('STREETS_GL_OBJECT_ADDED', payload)
          break
        case 'STREETS_GL_OBJECT_UPDATED':
          this.handleResponse('STREETS_GL_OBJECT_UPDATED', payload)
          break
        case 'STREETS_GL_OBJECT_REMOVED':
          this.handleResponse('STREETS_GL_OBJECT_REMOVED', payload)
          break
        case 'STREETS_GL_OBJECTS_LIST':
          this.handleResponse('STREETS_GL_OBJECTS_LIST', payload)
          break
        case 'STREETS_GL_OBJECTS_SYNCED':
          this.handleResponse('STREETS_GL_OBJECTS_SYNCED', payload)
          break
        case 'STREETS_GL_CAMERA_POSITION':
          this.handleResponse('STREETS_GL_CAMERA_POSITION', payload)
          break
        case 'STREETS_GL_SELECTED_BUILDING':
          this.handleResponse('STREETS_GL_SELECTED_BUILDING', payload)
          break
        case 'STREETS_GL_BUILDING_SELECTED':
          this.handleResponse('STREETS_GL_BUILDING_SELECTED', payload)
          break
        case 'STREETS_GL_BUILDING_HIDDEN':
          this.handleResponse('STREETS_GL_BUILDING_HIDDEN', payload)
          break
        case 'STREETS_GL_BUILDING_SHOWN':
          this.handleResponse('STREETS_GL_BUILDING_SHOWN', payload)
          break
        case 'STREETS_GL_HIDDEN_BUILDINGS_SYNCED':
          this.handleResponse('STREETS_GL_HIDDEN_BUILDINGS_SYNCED', payload)
          break
        case 'STREETS_GL_HIDDEN_BUILDINGS':
          this.handleResponse('STREETS_GL_HIDDEN_BUILDINGS', payload)
          break
      }
    }

    window.addEventListener('message', this.messageListener)
  }

  private waitForBridge(): void {
    // Check if bridge is ready, retry if not
    const checkReady = () => {
      if (!this.bridgeReady) {
        setTimeout(checkReady, 100)
      }
    }
    checkReady()
  }

  private handleBridgeReady(): void {
    if (this.disposed) return
    this.debugLog('[StreetsGLBridge] Bridge is ready!')
    this.bridgeReady = true
    
    // Process any pending objects. Each queued object keeps the same id it was queued with,
    // which is already stored on the corresponding mesh's userData, so flushing reconciles
    // ids automatically without creating duplicates.
    const queued = Array.from(this.pendingObjects.values())
    this.pendingObjects.clear()
    queued.forEach((obj) => {
      this.addObject(obj).then((result) => {
        if (!result.success) {
          console.warn('[StreetsGLBridge] Queued object failed to add on flush:', obj.id, result)
        }
      }).catch((err) => {
        console.error('[StreetsGLBridge] Error flushing queued object:', obj.id, err)
      })
    })

    // Call all ready callbacks
    this.readyCallbacks.forEach(callback => callback())
    this.readyCallbacks = []

    if (this.pendingNavigation) {
      const nav = this.pendingNavigation
      this.pendingNavigation = null
      this.sendMessage('STREETS_GL_NAVIGATE_TO', nav)
      this.debugLog('[StreetsGLBridge] Flushed pending navigation:', nav)
    }
  }

  private handleResponse(type: string, payload: any): void {
    const handlers = this.messageHandlers.get(type) || []
    handlers.forEach(handler => handler(payload))
  }

  /**
   * Wait for bridge to be ready
   */
  onReady(callback: () => void): void {
    if (this.bridgeReady) {
      callback()
    } else {
      this.readyCallbacks.push(callback)
    }
  }

  get isReady(): boolean {
    return this.bridgeReady
  }

  /**
   * Add event listener for bridge messages
   */
  on(type: string, handler: (payload: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, [])
    }
    this.messageHandlers.get(type)!.push(handler)
  }

  /**
   * Remove event listener
   */
  off(type: string, handler: (payload: any) => void): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Send message to Streets GL iframe.
   * @returns false when outbound validation rejected the payload (caller must not wait for ack).
   */
  private sendMessage(type: string, payload: any): boolean {
    if (!this.iframeWindow) {
      console.warn('[StreetsGLBridge] Iframe window not available')
      return false
    }

    if (type === 'STREETS_GL_ADD_OBJECT') {
      const validation = validateExternalObjectGeometry(payload)
      if (!validation.ok) {
        console.error('[StreetsGLBridge] Rejected outbound addObject:', validation.error)
        return false
      }
    } else if (type === 'STREETS_GL_SYNC_OBJECTS') {
      const validation = validateSyncObjectsPayload(payload)
      if (!validation.ok) {
        console.error('[StreetsGLBridge] Rejected outbound syncObjects:', validation.error)
        return false
      }
    }

    this.iframeWindow.postMessage(
      {
        type,
        payload,
        capability: this.capability,
        timestamp: Date.now()
      },
      this.targetOrigin
    )
    return true
  }

  /**
   * Add an object to Streets GL scene
   */
  addObject(object: StreetsGLObject): Promise<AddObjectResult> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve({ success: false, queued: false })
        return
      }
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] ⚠️ Bridge not ready, queuing object:', object.id)
        // Keyed by id so the queued object keeps its id when flushed on ready (no duplicate).
        this.pendingObjects.set(object.id, object)
        // Distinguish "queued" from "failed" so the caller still stores the id.
        resolve({ success: false, queued: true })
        return
      }

      this.debugLog('[StreetsGLBridge] 📤 Sending object to Streets GL:', {
        id: object.id,
        type: object.type,
        position: object.position,
        scale: object.scale,
        hasGeometry: !!object.geometry,
        geometrySize: object.geometry ? {
          positions: object.geometry.positions?.length || 0,
          indices: object.geometry.indices?.length || 0,
          normals: object.geometry.normals?.length || 0,
          uvs: object.geometry.uvs?.length || 0
        } : null
      })

      // Ensure geometry arrays are plain arrays for reliable postMessage (structured clone)
      const payload = StreetsGLBridge.ensureGeometrySerializable(object)
      const vertexCount = StreetsGLBridge.countObjectVertices(payload)

      // Fail fast on SEC-5 budget / malformed geometry — never hang waiting for OBJECT_ADDED.
      const preflight = validateExternalObjectGeometry(payload)
      if (!preflight.ok) {
        const errMsg = preflight.error || 'Geometry rejected by bridge security limits'
        console.error('[StreetsGLBridge] Rejected outbound addObject:', errMsg)
        useAppStore.getState().setError(
          `Could not add "${object.metadata?.name || object.id}" to Streets GL: ${errMsg}. ` +
            (vertexCount > STREETS_GL_MAX_VERTICES
              ? 'Simplify the model in the Optimize panel, or use a lower-poly version.'
              : 'Check the browser console for details.')
        )
        resolve({ success: false, queued: false })
        return
      }

      const addTimeoutMs = Math.min(
        60_000,
        Math.max(8_000, 5_000 + Math.floor(vertexCount / 50))
      )

      const timeout = setTimeout(() => {
        this.off('STREETS_GL_OBJECT_ADDED', handler)
        const msg = `[StreetsGLBridge] Timeout (${addTimeoutMs}ms) waiting for Streets GL to add object: ${object.id} (${vertexCount.toLocaleString()} vertices)`
        console.error(msg)
        useAppStore.getState().setError(
          `Streets GL import timed out for "${object.metadata?.name || object.id}" (${vertexCount.toLocaleString()} vertices). Try simplifying the model in the Optimize panel.`
        )
        resolve({ success: false, queued: false })
      }, addTimeoutMs)

      const handler = (payloadAck: any) => {
        if (payloadAck.objectId === object.id) {
          clearTimeout(timeout)
          this.off('STREETS_GL_OBJECT_ADDED', handler)
          if (payloadAck.success) {
            console.log('[StreetsGLBridge] ✅ Object added to Streets GL:', {
              id: object.id,
              name: object.metadata?.name || object.id,
              visible: object.visible !== false,
              position: object.position,
              vertexCount
            })
            this.debugLog('[StreetsGLBridge] ✅ Object successfully added to Streets GL:', object.id)
          } else {
            console.error('[StreetsGLBridge] ❌ Failed to add object to Streets GL:', object.id, payloadAck.error)
            useAppStore.getState().setError(
              `Streets GL rejected object "${object.metadata?.name || object.id}": ${payloadAck.error || 'unknown error'}`
            )
          }
          resolve({ success: payloadAck.success === true, queued: false })
        }
      }

      this.on('STREETS_GL_OBJECT_ADDED', handler)

      if (vertexCount > STREETS_GL_LARGE_VERTEX_WARN) {
        console.warn('[StreetsGLBridge] ⚠️ Large geometry for Streets GL bridge:', {
          id: object.id,
          vertexCount,
          note: 'Using compact TypedArray transport under SEC-5 vertex budget'
        })
      }

      try {
        const sent = this.sendMessage('STREETS_GL_ADD_OBJECT', payload)
        if (!sent) {
          clearTimeout(timeout)
          this.off('STREETS_GL_OBJECT_ADDED', handler)
          useAppStore.getState().setError(
            `Could not send model to Streets GL (${vertexCount.toLocaleString()} vertices): rejected by bridge limits.`
          )
          resolve({ success: false, queued: false })
        }
      } catch (postError) {
        clearTimeout(timeout)
        this.off('STREETS_GL_OBJECT_ADDED', handler)
        const errMsg = postError instanceof Error ? postError.message : String(postError)
        console.error('[StreetsGLBridge] ❌ postMessage failed for object:', object.id, postError)
        useAppStore.getState().setError(
          `Could not send model to Streets GL (${vertexCount.toLocaleString()} vertices): ${errMsg}. Try simplifying the model.`
        )
        resolve({ success: false, queued: false })
      }
    })
  }

  /**
   * Update an object in Streets GL scene
   */
  updateObject(objectId: string, updates: Partial<StreetsGLObject>): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    if (!this.bridgeReady) {
      console.warn('[StreetsGLBridge] Bridge not ready')
      return Promise.resolve(false)
    }

    return this.awaitBridgeResponse(
      'STREETS_GL_OBJECT_UPDATED',
      () =>
        this.sendMessage('STREETS_GL_UPDATE_OBJECT', {
          id: objectId,
          ...updates
        }),
      (payload) => payload.objectId === objectId,
      (payload) => payload.success === true,
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      `Timeout waiting for update of object ${objectId}`
    )
  }

  /**
   * Remove an object from Streets GL scene
   */
  removeObject(objectId: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)

    // Cancel a not-yet-flushed add so reload/remove races cannot resurrect the object.
    if (this.pendingObjects.has(objectId)) {
      this.pendingObjects.delete(objectId)
      this.debugLog('[StreetsGLBridge] Removed queued (not yet added) object:', objectId)
      return Promise.resolve(true)
    }

    if (!this.bridgeReady) {
      console.warn('[StreetsGLBridge] Bridge not ready')
      return Promise.resolve(false)
    }

    return this.awaitBridgeResponse(
      'STREETS_GL_OBJECT_REMOVED',
      () => this.sendMessage('STREETS_GL_REMOVE_OBJECT', { id: objectId }),
      (payload) => payload.objectId === objectId,
      (payload) => payload.success === true,
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      `Timeout waiting for removal of object ${objectId}`
    )
  }

  /**
   * Get all objects in Streets GL scene
   */
  getObjects(): Promise<StreetsGLObject[]> {
    if (this.disposed || !this.bridgeReady) {
      if (!this.bridgeReady && !this.disposed) {
        console.warn('[StreetsGLBridge] Bridge not ready')
      }
      return Promise.resolve([])
    }

    return this.awaitBridgeResponse(
      'STREETS_GL_OBJECTS_LIST',
      () => this.sendMessage('STREETS_GL_GET_OBJECTS', {}),
      (payload) => payload.success === true,
      (payload) => (payload.objects || []) as StreetsGLObject[],
      () => [] as StreetsGLObject[],
      STREETS_GL_RPC_TIMEOUT_MS,
      'Timeout waiting for Streets GL object list'
    )
  }

  /**
   * Sync multiple objects at once
   */
  syncObjects(objects: StreetsGLObject[]): Promise<boolean> {
    if (this.disposed || !this.bridgeReady) {
      if (!this.bridgeReady && !this.disposed) {
        console.warn('[StreetsGLBridge] Bridge not ready')
      }
      return Promise.resolve(false)
    }

    return this.awaitBridgeResponse(
      'STREETS_GL_OBJECTS_SYNCED',
      () => this.sendMessage('STREETS_GL_SYNC_OBJECTS', objects),
      (payload) => payload.success === true,
      () => true,
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      'Timeout waiting for Streets GL syncObjects'
    )
  }

  /**
   * Navigate Streets GL camera to specific coordinates.
   * Streets GL hash format is #lat,lon,pitch,yaw,distance (5 values).
   * Uses postMessage so the iframe is not reloaded (changing iframe.src resets state).
   *
   * Legacy 6-arg callers pass (lat, lon, _zoomIgnored, pitch, yaw, distance).
   */
  navigateTo(lat: number, lon: number, zoom?: number, pitch?: number, yaw?: number, height?: number): void {
    if (!this.iframe) {
      console.warn('[StreetsGLBridge] Iframe not available')
      return
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('[StreetsGLBridge] Invalid navigate coordinates:', { lat, lon })
      return
    }

    const defaultPitch = pitch ?? 45
    const defaultYaw = yaw ?? 0
    const defaultDistance = height ?? 120
    const payload = {
      lat,
      lon,
      pitch: defaultPitch,
      yaw: defaultYaw,
      distance: defaultDistance
    }

    if (this.bridgeReady) {
      this.sendMessage('STREETS_GL_NAVIGATE_TO', payload)
      this.debugLog('[StreetsGLBridge] Navigating via postMessage:', {
        ...payload,
        legacyZoomArg: zoom
      })
      return
    }

    // Bridge not ready yet: queue navigation and set hash for initial load.
    this.pendingNavigation = payload
    const hash = `${lat.toFixed(5)},${lon.toFixed(5)},${defaultPitch.toFixed(2)},${defaultYaw.toFixed(2)},${defaultDistance.toFixed(2)}`
    const currentUrl = this.iframe.src.split('#')[0]
    this.iframe.src = `${currentUrl}#${hash}`
    this.debugLog('[StreetsGLBridge] Navigating via hash (bridge not ready, queued):', { lat, lon, hash })
  }

  /**
   * Zoom to car position
   * Navigates Streets GL to the car's location with close zoom
   */
  zoomToCar(lat?: number, lon?: number): void {
    // Use provided coordinates or get from store
    const store = useAppStore.getState()
    const targetLat = lat ?? store.streetsGLGroundLat ?? 32.89917
    const targetLon = lon ?? store.streetsGLGroundLon ?? -97.03813
    
    // Zoom in very close to see the car (very high zoom, very low height, steep angle)
    this.navigateTo(targetLat, targetLon, 21, 60, 0, 15) // 21 zoom, 60° pitch, 15m height for very close view
    
    this.debugLog('[StreetsGLBridge] Zooming very close to car at:', { lat: targetLat, lon: targetLon, zoom: 21, height: 15 })
  }

  /**
   * Request camera position and ground target from Streets GL (one-shot).
   * Payload includes cameraPosition and cameraTarget (point on ground the camera is looking at).
   */
  requestCameraPosition(callback: (payload: { cameraPosition: { x: number; y: number; z: number }; cameraTarget?: { x: number; y: number; z: number } }) => void): void {
    if (!this.bridgeReady) {
      console.warn('[StreetsGLBridge] Bridge not ready')
      return
    }

    const handler = (payload: any) => {
      if (payload.cameraPosition) {
        this.off('STREETS_GL_CAMERA_POSITION', handler)
        callback({
          cameraPosition: payload.cameraPosition,
          cameraTarget: payload.cameraTarget || payload.cameraPosition
        })
      }
    }

    this.on('STREETS_GL_CAMERA_POSITION', handler)
    this.sendMessage('STREETS_GL_GET_CAMERA_POSITION', {})
  }

  /**
   * Subscribe to periodic camera updates with a single shared poll loop (avoids N concurrent postMessage calls).
   * Returns an unsubscribe function.
   */
  subscribeCameraPosition(
    callback: (payload: {
      cameraPosition: { x: number; y: number; z: number }
      cameraTarget?: { x: number; y: number; z: number }
    }) => void,
    intervalMs = 150
  ): () => void {
    this.cameraSubscribers.add(callback)
    this.cameraPollIntervalMs = intervalMs

    if (!this.cameraPollTimer && this.bridgeReady) {
      this.startCameraPollLoop()
    } else if (!this.cameraPollTimer) {
      this.onReady(() => this.startCameraPollLoop())
    }

    this.pollCameraPositionOnce()

    return () => {
      this.cameraSubscribers.delete(callback)
      if (this.cameraSubscribers.size === 0 && this.cameraPollTimer) {
        clearInterval(this.cameraPollTimer)
        this.cameraPollTimer = null
        this.cameraPollInFlight = false
      }
    }
  }

  private startCameraPollLoop(): void {
    if (this.cameraPollTimer || this.cameraSubscribers.size === 0) return
    this.cameraPollTimer = setInterval(
      () => this.pollCameraPositionOnce(),
      this.cameraPollIntervalMs
    )
  }

  private pollCameraPositionOnce(): void {
    if (!this.bridgeReady || this.cameraPollInFlight || this.cameraSubscribers.size === 0) {
      return
    }

    this.cameraPollInFlight = true
    const handler = (payload: any) => {
      if (!payload?.cameraPosition) return
      this.off('STREETS_GL_CAMERA_POSITION', handler)
      this.cameraPollInFlight = false
      const result = {
        cameraPosition: payload.cameraPosition as { x: number; y: number; z: number },
        cameraTarget: (payload.cameraTarget || payload.cameraPosition) as {
          x: number
          y: number
          z: number
        }
      }
      this.cameraSubscribers.forEach((cb) => cb(result))
    }

    this.on('STREETS_GL_CAMERA_POSITION', handler)
    this.sendMessage('STREETS_GL_GET_CAMERA_POSITION', {})

    setTimeout(() => {
      if (this.cameraPollInFlight) {
        this.off('STREETS_GL_CAMERA_POSITION', handler)
        this.cameraPollInFlight = false
      }
    }, 2000)
  }

  requestSelectedBuilding(
    callback: (
      position: { x: number; y: number; z: number },
      estimatedHeight: number,
      buildingSize?: { width: number; height: number; depth: number } | null,
      buildingBounds?: {
        min: { x: number; y: number; z: number }
        max: { x: number; y: number; z: number }
        center: { x: number; y: number; z: number }
        size: { width: number; height: number; depth: number }
      } | null,
      building?: StreetsGLBuildingRef | null
    ) => void | Promise<void>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] Bridge not ready')
        resolve(false)
        return
      }

      const timeout = setTimeout(() => {
        this.off('STREETS_GL_SELECTED_BUILDING', handler)
        console.error('[StreetsGLBridge] ❌ Timeout waiting for selected building data')
        resolve(false)
      }, 5000)

      const handler = async (payload: any) => {
        clearTimeout(timeout)
        this.off('STREETS_GL_SELECTED_BUILDING', handler)

        if (!payload?.success || !payload?.position) {
          console.warn('[StreetsGLBridge] Failed to get selected building:', payload?.error)
          resolve(false)
          return
        }

        try {
          const building: StreetsGLBuildingRef | null =
            typeof payload.buildingId === 'number'
              ? {
                  buildingId: payload.buildingId,
                  osmType: payload.osmType,
                  osmId: payload.osmId,
                  osmTypeName: payload.osmTypeName
                }
              : null
          await callback(
            payload.position,
            payload.estimatedHeight ?? 0,
            payload.buildingSize ?? null,
            payload.buildingBounds ?? null,
            building
          )
          resolve(true)
        } catch (error) {
          console.error('[StreetsGLBridge] Error handling selected building payload:', error)
          resolve(false)
        }
      }

      this.on('STREETS_GL_SELECTED_BUILDING', handler)
      this.sendMessage('STREETS_GL_GET_SELECTED_BUILDING', {})
    })
  }

  /**
   * Subscribe to native OSM building pick events from the Streets GL iframe.
   * Returns an unsubscribe function.
   */
  onBuildingSelected(callback: (building: StreetsGLBuildingRef | null) => void): () => void {
    const handler = (payload: any) => {
      if (!payload?.success) return
      if (payload.buildingId == null) {
        callback(null)
        return
      }
      callback({
        buildingId: Number(payload.buildingId),
        osmType: payload.osmType,
        osmId: payload.osmId,
        osmTypeName: payload.osmTypeName
      })
    }
    this.on('STREETS_GL_BUILDING_SELECTED', handler)
    return () => this.off('STREETS_GL_BUILDING_SELECTED', handler)
  }

  /** Hide a native Streets GL / OSM building by packed feature id. */
  hideBuilding(buildingId: number): Promise<boolean> {
    return this.awaitBridgeResponse(
      'STREETS_GL_BUILDING_HIDDEN',
      () => this.sendMessage('STREETS_GL_HIDE_BUILDING', { buildingId }),
      (payload) => payload?.buildingId === buildingId || payload?.success === false,
      (payload) => Boolean(payload?.success),
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      'hideBuilding timed out'
    )
  }

  /** Show a previously hidden native Streets GL / OSM building. */
  showBuilding(buildingId: number): Promise<boolean> {
    return this.awaitBridgeResponse(
      'STREETS_GL_BUILDING_SHOWN',
      () => this.sendMessage('STREETS_GL_SHOW_BUILDING', { buildingId }),
      (payload) => payload?.buildingId === buildingId || payload?.success === false,
      (payload) => Boolean(payload?.success),
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      'showBuilding timed out'
    )
  }

  /** Replace the iframe's user-hidden building set (re-applied after tile reloads). */
  syncHiddenBuildings(buildingIds: number[]): Promise<boolean> {
    return this.awaitBridgeResponse(
      'STREETS_GL_HIDDEN_BUILDINGS_SYNCED',
      () => this.sendMessage('STREETS_GL_SYNC_HIDDEN_BUILDINGS', { buildingIds }),
      () => true,
      (payload) => Boolean(payload?.success),
      () => false,
      STREETS_GL_RPC_TIMEOUT_MS,
      'syncHiddenBuildings timed out'
    )
  }

  getHiddenBuildings(): Promise<StreetsGLBuildingRef[]> {
    return this.awaitBridgeResponse(
      'STREETS_GL_HIDDEN_BUILDINGS',
      () => this.sendMessage('STREETS_GL_GET_HIDDEN_BUILDINGS', {}),
      () => true,
      (payload) => {
        if (!payload?.success) return []
        if (Array.isArray(payload.buildings)) {
          return payload.buildings.map((b: any) => ({
            buildingId: Number(b.buildingId),
            osmType: b.osmType,
            osmId: b.osmId,
            osmTypeName: b.osmTypeName
          }))
        }
        return (payload.buildingIds || []).map((id: number) => ({ buildingId: Number(id) }))
      },
      () => [],
      STREETS_GL_RPC_TIMEOUT_MS,
      'getHiddenBuildings timed out'
    )
  }

  dispose(): void {
    this.disposed = true
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener)
      this.messageListener = null
    }

    this.readyCallbacks = []
    this.messageHandlers.clear()
    this.pendingObjects.clear()
    this.pendingNavigation = null
    this.cameraSubscribers.clear()
    if (this.cameraPollTimer) {
      clearInterval(this.cameraPollTimer)
      this.cameraPollTimer = null
    }
    this.cameraPollInFlight = false
    this.bridgeReady = false
    this.iframe = null
    this.iframeWindow = null
  }

  /**
   * Convert Three.js object to Streets GL object format.
   * Multi-material models are split into per-texture parts so UVs stay matched to maps.
   */
  static fromThreeJSObject(threeObject: any, id?: string): StreetsGLObject {
    const position = threeObject.position || { x: 0, y: 0, z: 0 }
    const rotation = threeObject.rotation || { x: 0, y: 0, z: 0 }
    const scale = threeObject.scale || { x: 1, y: 1, z: 1 }

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(threeObject)
    const geometry = parts.length > 0 ? parts[0].geometry : undefined
    const primaryPart = parts[0]
    const material = StreetsGLBridge.extractMaterialFromThreeJS(threeObject)
    const shadowSettings = StreetsGLBridge.extractShadowSettings(threeObject)

    if (parts.length > 0) {
      const totalVerts = parts.reduce(
        (sum, p) => sum + ((p.geometry.positions?.length || 0) / 3),
        0
      )
      console.log('[StreetsGLBridge] Extracted mesh parts for Streets GL:', {
        id: id || 'unknown',
        partCount: parts.length,
        texturedParts: parts.filter(
          (p) => !!p.baseColorTextureDataUrl || !!p.baseColorTextureBytes
        ).length,
        totalVertices: totalVerts,
        note:
          parts.length > 1
            ? 'Multi-texture model — each unique map is a separate draw part (correct UVs)'
            : 'Single-part model'
      })
    } else {
      console.warn('[StreetsGLBridge] No geometry extracted from object:', id || 'unknown')
    }

    return {
      id: id || `obj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'custom',
      position: {
        x: typeof position.x === 'number' ? position.x : position.x || 0,
        y: typeof position.y === 'number' ? position.y : position.y || 0,
        z: typeof position.z === 'number' ? position.z : position.z || 0
      },
      rotation: {
        x: typeof rotation.x === 'number' ? rotation.x : rotation.x || 0,
        y: typeof rotation.y === 'number' ? rotation.y : rotation.y || 0,
        z: typeof rotation.z === 'number' ? rotation.z : rotation.z || 0
      },
      scale: {
        x: typeof scale.x === 'number' ? scale.x : scale.x || 1,
        y: typeof scale.y === 'number' ? scale.y : scale.y || 1,
        z: typeof scale.z === 'number' ? scale.z : scale.z || 1
      },
      // City/hybrid paths hide the Three.js root (visible=false) while still expecting
      // Streets GL rendering — do not propagate that flag to the iframe object.
      // Visibility: mesh streetsGLVisible channel only (see streetsGLIframeVisibility.ts).
      visible: resolveIframeVisibleForBridge(threeObject),
      color: primaryPart?.color ?? material?.color,
      parts: parts.length > 0 ? parts : undefined,
      metadata: {
        name: threeObject.name || '',
        type: threeObject.type || 'Object3D',
        userData: threeObject.userData || {},
        material: material,
        // Legacy single-texture fields (first textured part) for older iframe builds
        baseColorTextureDataUrl:
          primaryPart?.baseColorTextureDataUrl ?? material?.baseColorTextureDataUrl,
        baseColorTextureBytes: primaryPart?.baseColorTextureBytes,
        baseColorTextureMime: primaryPart?.baseColorTextureMime,
        parts,
        shadows: shadowSettings,
        castShadow: shadowSettings?.castShadow ?? true,
        receiveShadow: shadowSettings?.receiveShadow ?? true
      },
      // Keep first part as geometry for backward-compatible single-mesh iframe builds
      geometry
    }
  }

  /**
   * Count vertices across single geometry + parts (SEC-5 budget accounting).
   */
  static countObjectVertices(object: StreetsGLObject): number {
    if (object.parts && object.parts.length > 0) {
      return object.parts.reduce((sum, part) => {
        const len = part.geometry?.positions?.length || 0
        return sum + Math.floor(len / 3)
      }, 0)
    }
    const len = object.geometry?.positions?.length || 0
    return Math.floor(len / 3)
  }

  /**
   * Thin expanded mesh parts until total vertex count ≤ budget.
   * Drops smallest-area triangles from the heaviest parts first.
   */
  static reducePartsToVertexBudget(
    parts: StreetsGLMeshPart[],
    maxVertices: number = STREETS_GL_MAX_VERTICES
  ): StreetsGLMeshPart[] {
    if (parts.length === 0) return parts

    const totalVerts = parts.reduce(
      (sum, p) => sum + Math.floor((p.geometry.positions?.length || 0) / 3),
      0
    )
    if (totalVerts <= maxVertices) return parts

    // Expanded verts ≈ 3 per triangle (non-indexed corner dump). Target triangle count.
    const targetTris = Math.max(4, Math.floor(maxVertices / STREETS_GL_EXPAND_VERTS_PER_TRI))
    const currentTris = parts.reduce((sum, p) => {
      const idx = p.geometry.indices
      if (idx && idx.length > 0) return sum + Math.floor(idx.length / 3)
      return sum + Math.floor((p.geometry.positions?.length || 0) / 9)
    }, 0)
    if (currentTris <= targetTris) {
      // Degenerate case: verts over budget without enough tris to thin — drop trailing parts.
      let remaining = maxVertices
      const kept: StreetsGLMeshPart[] = []
      for (const part of parts) {
        const verts = Math.floor((part.geometry.positions?.length || 0) / 3)
        if (verts <= remaining) {
          kept.push(part)
          remaining -= verts
        }
      }
      return kept
    }

    const ratio = targetTris / currentTris
    console.warn('[StreetsGLBridge] Post-extract triangle thin to meet vertex budget:', {
      totalVerts,
      maxVertices,
      currentTris,
      targetTris,
      ratio: ratio.toFixed(3)
    })

    return parts
      .map((part) => {
        const positions = part.geometry.positions
        const normals = part.geometry.normals
        const uvs = part.geometry.uvs
        const indices = part.geometry.indices
        if (!positions || positions.length < 9) return part

        // Build triangle list with areas (expanded or indexed)
        type Tri = { area: number; corners: [number, number, number] }
        const tris: Tri[] = []
        const posArr = positions as ArrayLike<number>

        const areaFor = (i0: number, i1: number, i2: number): number => {
          const x0 = posArr[i0 * 3]
          const y0 = posArr[i0 * 3 + 1]
          const z0 = posArr[i0 * 3 + 2]
          const x1 = posArr[i1 * 3]
          const y1 = posArr[i1 * 3 + 1]
          const z1 = posArr[i1 * 3 + 2]
          const x2 = posArr[i2 * 3]
          const y2 = posArr[i2 * 3 + 1]
          const z2 = posArr[i2 * 3 + 2]
          const v0x = x1 - x0
          const v0y = y1 - y0
          const v0z = z1 - z0
          const v1x = x2 - x0
          const v1y = y2 - y0
          const v1z = z2 - z0
          const cx = v0y * v1z - v0z * v1y
          const cy = v0z * v1x - v0x * v1z
          const cz = v0x * v1y - v0y * v1x
          return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
        }

        if (indices && indices.length >= 3) {
          const idx = indices as ArrayLike<number>
          for (let i = 0; i + 2 < idx.length; i += 3) {
            const a = idx[i]
            const b = idx[i + 1]
            const c = idx[i + 2]
            tris.push({ area: areaFor(a, b, c), corners: [a, b, c] })
          }
        } else {
          const vertCount = Math.floor(posArr.length / 3)
          for (let i = 0; i + 2 < vertCount; i += 3) {
            tris.push({ area: areaFor(i, i + 1, i + 2), corners: [i, i + 1, i + 2] })
          }
        }

        const keepCount = Math.max(1, Math.floor(tris.length * ratio))
        if (keepCount >= tris.length) return part
        tris.sort((a, b) => b.area - a.area)
        const keep = tris.slice(0, keepCount)

        // Re-expand kept triangles into compact buffers
        const newPos: number[] = []
        const newNorm: number[] = []
        const newUv: number[] = []
        const newIdx: number[] = []
        const normArr = normals as ArrayLike<number> | undefined
        const uvArr = uvs as ArrayLike<number> | undefined
        let vOut = 0
        for (const tri of keep) {
          for (const src of tri.corners) {
            newPos.push(posArr[src * 3], posArr[src * 3 + 1], posArr[src * 3 + 2])
            if (normArr && normArr.length >= (src + 1) * 3) {
              newNorm.push(normArr[src * 3], normArr[src * 3 + 1], normArr[src * 3 + 2])
            } else {
              newNorm.push(0, 1, 0)
            }
            if (uvArr && uvArr.length >= (src + 1) * 2) {
              newUv.push(uvArr[src * 2], uvArr[src * 2 + 1])
            } else {
              newUv.push(0, 0)
            }
            newIdx.push(vOut++)
          }
        }

        return {
          ...part,
          geometry: {
            positions: Float32Array.from(newPos),
            normals: Float32Array.from(newNorm),
            uvs: Float32Array.from(newUv),
            indices: Uint32Array.from(newIdx)
          }
        }
      })
      .filter((p) => (p.geometry.positions?.length || 0) >= 9)
  }

  /**
   * Reduce a source BufferGeometry for Streets GL bridge transport.
   * Prefer Meshopt (UV-preserving edge collapse), then SimpleDecimation, then
   * forced largest-triangle reduce. Area fallbacks moth-eat the mesh — Meshopt first.
   */
  static simplifyGeometryForBridge(
    geom: THREE.BufferGeometry,
    targetTris: number,
    meshName: string
  ): THREE.BufferGeometry | null {
    const triCount = geom.index
      ? Math.floor(geom.index.count / 3)
      : Math.floor((geom.attributes.position?.count || 0) / 3)
    if (triCount <= targetTris) return null

    const viaMeshopt = meshoptSimplifyToTriangleBudget(geom, targetTris, meshName)
    if (viaMeshopt) return viaMeshopt

    const viaSimple = simpleDecimation(geom, targetTris, meshName, { bridgeProxy: true })
    if (viaSimple && viaSimple !== geom) return viaSimple

    return forceReduceToTriangleBudget(geom, targetTris, meshName)
  }

  /**
   * Ensure geometry uses compact TypedArrays for postMessage (structured clone).
   * TypedArrays are ~4× smaller than plain JS number arrays and clone faster.
   */
  static ensureGeometrySerializable(object: StreetsGLObject): StreetsGLObject {
    const toFloat32 = (a: number[] | Float32Array | undefined): Float32Array | undefined => {
      if (a == null) return undefined
      if (a instanceof Float32Array) return a
      return Float32Array.from(a as ArrayLike<number>)
    }
    const toUint32 = (a: number[] | Uint32Array | undefined): Uint32Array | undefined => {
      if (a == null) return undefined
      if (a instanceof Uint32Array) return a
      return Uint32Array.from(a as ArrayLike<number>)
    }
    const serializeGeometry = (g: GeometryData): GeometryData => ({
      positions: toFloat32(g.positions as number[] | Float32Array) ?? new Float32Array(0),
      normals: toFloat32(g.normals as number[] | Float32Array | undefined),
      uvs: toFloat32(g.uvs as number[] | Float32Array | undefined),
      indices: toUint32(g.indices as number[] | Uint32Array | undefined)
    })

    if (!object.geometry && (!object.parts || object.parts.length === 0)) {
      return { ...object }
    }

    const parts = object.parts?.map((part) => ({
      ...part,
      geometry: serializeGeometry(part.geometry)
    }))

    return {
      ...object,
      parts,
      metadata: object.metadata
        ? {
            ...object.metadata,
            parts: parts ?? object.metadata.parts
          }
        : object.metadata,
      geometry: object.geometry
        ? serializeGeometry(object.geometry)
        : parts?.[0]?.geometry
    }
  }

  /**
   * Compute normals from positions and indices
   * This is needed when geometry doesn't have normals but has indices
   */
  static computeNormalsFromPositionsAndIndices(positions: number[], indices: number[]): number[] {
    const normals: number[] = new Array(positions.length).fill(0)
    
    // Compute face normals and accumulate to vertex normals
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3
      const i1 = indices[i + 1] * 3
      const i2 = indices[i + 2] * 3
      
      const v0x = positions[i0]
      const v0y = positions[i0 + 1]
      const v0z = positions[i0 + 2]
      
      const v1x = positions[i1]
      const v1y = positions[i1 + 1]
      const v1z = positions[i1 + 2]
      
      const v2x = positions[i2]
      const v2y = positions[i2 + 1]
      const v2z = positions[i2 + 2]
      
      // Edge vectors
      const ex = v1x - v0x
      const ey = v1y - v0y
      const ez = v1z - v0z
      
      const fx = v2x - v0x
      const fy = v2y - v0y
      const fz = v2z - v0z
      
      // Cross product to get face normal
      let nx = ey * fz - ez * fy
      let ny = ez * fx - ex * fz
      let nz = ex * fy - ey * fx
      
      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 0.0001) {
        nx /= len
        ny /= len
        nz /= len
      }
      
      // Accumulate to vertex normals
      normals[i0] += nx
      normals[i0 + 1] += ny
      normals[i0 + 2] += nz
      
      normals[i1] += nx
      normals[i1 + 1] += ny
      normals[i1 + 2] += nz
      
      normals[i2] += nx
      normals[i2 + 1] += ny
      normals[i2 + 2] += nz
    }
    
    // Normalize accumulated normals
    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i]
      const ny = normals[i + 1]
      const nz = normals[i + 2]
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 0.0001) {
        normals[i] = nx / len
        normals[i + 1] = ny / len
        normals[i + 2] = nz / len
      } else {
        // Default normal if couldn't compute
        normals[i] = 0
        normals[i + 1] = 1
        normals[i + 2] = 0
      }
    }
    
    return normals
  }

  /**
   * Extract geometry data from a Three.js object (legacy single-mesh merge).
   * Prefer {@link extractMeshPartsFromThreeJS} for textured multi-material models.
   */
  static extractGeometryFromThreeJS(threeObject: any): GeometryData | undefined {
    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(threeObject)
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0].geometry

    // Merge parts only for callers that still expect one buffer (UVs will be wrong across
    // different textures — those callers should use parts instead).
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    let vertexOffset = 0
    for (const part of parts) {
      const g = part.geometry
      const pos = g.positions
      const nor = g.normals
      const uv = g.uvs
      const idx = g.indices
      const vertCount = (pos?.length || 0) / 3
      for (let i = 0; i < (pos?.length || 0); i++) positions.push(pos![i] as number)
      if (nor && nor.length === pos!.length) {
        for (let i = 0; i < nor.length; i++) normals.push(nor[i] as number)
      } else {
        for (let v = 0; v < vertCount; v++) normals.push(0, 1, 0)
      }
      if (uv && uv.length === vertCount * 2) {
        for (let i = 0; i < uv.length; i++) uvs.push(uv[i] as number)
      } else {
        for (let v = 0; v < vertCount; v++) uvs.push(0, 0)
      }
      if (idx && idx.length > 0) {
        for (let i = 0; i < idx.length; i++) indices.push((idx[i] as number) + vertexOffset)
      } else {
        for (let i = 0; i < vertCount; i++) indices.push(vertexOffset + i)
      }
      vertexOffset += vertCount
    }
    return {
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint32Array.from(indices)
    }
  }

  /**
   * Extract per-texture (or solid-color) mesh parts from a Three.js object.
   *
   * Critical for buildings/FBX with many materials: merging all meshes into one buffer while
   * sending only the dominant texture causes extreme UV stretching / scrambled atlas look.
   * Materials that share the same `texture.uuid` are merged (UVs stay valid). Distinct maps
   * become separate parts that Streets GL draws with their own base-color texture.
   */
  static extractMeshPartsFromThreeJS(threeObject: any): StreetsGLMeshPart[] {
    type Accumulator = {
      positions: number[]
      normals: number[]
      uvs: number[]
      indices: number[]
      vertexOffset: number
      color: { r: number; g: number; b: number }
      texture?: THREE.Texture
      serializedTexture?: StreetsGLSerializedTexture
      vertexWeight: number
    }

    const buckets = new Map<string, Accumulator>()
    const disposableGeometries: THREE.BufferGeometry[] = []
    const textureSerializeCache = new Map<string, StreetsGLSerializedTexture | undefined>()

    let totalSourceVertices = 0
    let totalSourceTris = 0
    threeObject.traverse((obj: any) => {
      if (obj.isMesh && obj.geometry?.attributes?.position) {
        const geom = obj.geometry as THREE.BufferGeometry
        const posCount = geom.attributes.position.count
        totalSourceVertices += posCount
        if (geom.index) {
          totalSourceTris += Math.floor(geom.index.count / 3)
        } else {
          totalSourceTris += Math.floor(posCount / 3)
        }
      }
    })
    // After extract, each triangle becomes 3 unique verts — budget against expanded size.
    const estimatedExpandedVerts = totalSourceTris * STREETS_GL_EXPAND_VERTS_PER_TRI
    const needsSimplify = estimatedExpandedVerts > STREETS_GL_MAX_VERTICES
    const targetExpandedTris = Math.max(
      4,
      Math.floor(STREETS_GL_MAX_VERTICES / STREETS_GL_EXPAND_VERTS_PER_TRI)
    )
    const simplifyRatio = needsSimplify ? targetExpandedTris / Math.max(1, totalSourceTris) : 1
    if (needsSimplify) {
      console.warn('[StreetsGLBridge] Auto-simplifying model for Streets GL bridge:', {
        name: threeObject.name || 'unnamed',
        originalVertices: totalSourceVertices,
        originalTriangles: totalSourceTris,
        estimatedExpandedVerts,
        targetVertices: STREETS_GL_MAX_VERTICES,
        targetTriangles: targetExpandedTris,
        ratio: simplifyRatio.toFixed(3)
      })
    }

    threeObject.updateMatrixWorld(true)
    const rootInverse = new THREE.Matrix4().copy(threeObject.matrixWorld).invert()
    const toRoot = new THREE.Matrix4()
    const normalMatrix = new THREE.Matrix3()
    const vertex = new THREE.Vector3()
    const normalVec = new THREE.Vector3()

    const partKeyForMaterial = (
      mat: any
    ): {
      key: string
      color: { r: number; g: number; b: number }
      texture?: THREE.Texture
      forcePng?: boolean
    } => {
      const color = StreetsGLBridge.readMaterialColor(mat)
      const tex =
        mat?.map instanceof THREE.Texture
          ? mat.map
          : mat?.emissiveMap instanceof THREE.Texture
            ? mat.emissiveMap
            : undefined
      const forcePng =
        mat?.transparent === true ||
        (typeof mat?.opacity === 'number' && mat.opacity < 0.999) ||
        (typeof mat?.alphaTest === 'number' && mat.alphaTest > 0)
      if (tex) {
        return { key: `tex:${tex.uuid}`, color: { r: 1, g: 1, b: 1 }, texture: tex, forcePng }
      }
      // Solid-color bucket (quantize slightly so near-identical paints merge)
      const key = `col:${color.r.toFixed(3)},${color.g.toFixed(3)},${color.b.toFixed(3)}`
      return { key, color, texture: undefined, forcePng }
    }

    const getBucket = (
      key: string,
      color: { r: number; g: number; b: number },
      texture?: THREE.Texture,
      forcePng?: boolean
    ): Accumulator => {
      let bucket = buckets.get(key)
      if (!bucket) {
        let serializedTexture: StreetsGLSerializedTexture | undefined
        if (texture) {
          const cacheKey = `${texture.uuid}:${forcePng ? 'png' : 'auto'}`
          if (textureSerializeCache.has(cacheKey)) {
            serializedTexture = textureSerializeCache.get(cacheKey)
          } else {
            serializedTexture = StreetsGLBridge.serializeTextureForBridge(
              texture,
              STREETS_GL_MAX_TEXTURE_SIZE,
              { forcePng }
            )
            textureSerializeCache.set(cacheKey, serializedTexture)
          }
        }
        bucket = {
          positions: [],
          normals: [],
          uvs: [],
          indices: [],
          vertexOffset: 0,
          color,
          texture,
          serializedTexture,
          vertexWeight: 0
        }
        buckets.set(key, bucket)
      }
      return bucket
    }

    const appendTriangleVertices = (
      bucket: Accumulator,
      geom: THREE.BufferGeometry,
      indexList: ArrayLike<number>,
      indexStart: number,
      indexCount: number
    ) => {
      const posAttr = geom.attributes.position
      const normalAttr = geom.attributes.normal
      const uvAttr = geom.attributes.uv
      if (!posAttr) return

      const posArray = posAttr.array as ArrayLike<number>
      const normalArray = normalAttr?.array as ArrayLike<number> | undefined
      const uvArray = uvAttr?.array as ArrayLike<number> | undefined
      const srcVertexCount = posAttr.count

      // Expand indexed triangles so each part owns a compact vertex buffer (avoids sharing
      // vertices across different materials on the same BufferGeometry).
      // Clamp to index buffer length — stale geometry.groups after simplify used to read
      // past the new index and inject undefined→NaN verts / UV (0,0) white-noise samples.
      const indexLen = (indexList as ArrayLike<number>).length
      const indexEnd = Math.min(indexStart + indexCount, indexLen)
      for (let i = indexStart; i + 2 < indexEnd; i += 3) {
        const cornerIndices = [indexList[i], indexList[i + 1], indexList[i + 2]]
        for (const rawIdx of cornerIndices) {
          const srcIdx = rawIdx as number
          if (
            typeof srcIdx !== 'number' ||
            !Number.isFinite(srcIdx) ||
            srcIdx < 0 ||
            srcIdx >= srcVertexCount
          ) {
            bucket.positions.push(0, 0, 0)
            bucket.normals.push(0, 1, 0)
            bucket.uvs.push(0, 0)
            bucket.indices.push(bucket.vertexOffset++)
            continue
          }
          const pi = srcIdx * 3
          vertex.set(posArray[pi], posArray[pi + 1], posArray[pi + 2])
          vertex.applyMatrix4(toRoot)
          bucket.positions.push(vertex.x, vertex.y, vertex.z)

          if (normalArray && normalAttr && srcIdx < normalAttr.count) {
            normalVec.set(normalArray[pi], normalArray[pi + 1], normalArray[pi + 2])
            normalVec.applyMatrix3(normalMatrix).normalize()
            bucket.normals.push(normalVec.x, normalVec.y, normalVec.z)
          } else {
            bucket.normals.push(0, 1, 0)
          }

          if (uvArray && uvAttr && srcIdx < uvAttr.count) {
            const ui = srcIdx * 2
            bucket.uvs.push(uvArray[ui], uvArray[ui + 1])
          } else {
            bucket.uvs.push(0, 0)
          }

          bucket.indices.push(bucket.vertexOffset++)
        }
        bucket.vertexWeight += 3
      }
    }

    const traverse = (obj: any) => {
      if (obj.isMesh && obj.geometry) {
        const sourceGeom: THREE.BufferGeometry = obj.geometry

        if (!sourceGeom.attributes?.position) {
          if (obj.children?.length) {
            for (const child of obj.children) traverse(child)
          }
          return
        }

        obj.updateMatrixWorld(true)
        toRoot.multiplyMatrices(rootInverse, obj.matrixWorld)
        normalMatrix.getNormalMatrix(toRoot)

        const materials: any[] = Array.isArray(obj.material)
          ? obj.material
          : [obj.material]

        const indexAttr = sourceGeom.index
        const posCount = sourceGeom.attributes.position.count
        const fullIndexCount = indexAttr ? indexAttr.count : posCount
        const indexArray: ArrayLike<number> = indexAttr
          ? (indexAttr.array as ArrayLike<number>)
          : (() => {
              const seq = new Uint32Array(posCount)
              for (let i = 0; i < posCount; i++) seq[i] = i
              return seq
            })()

        const groups =
          sourceGeom.groups && sourceGeom.groups.length > 0
            ? sourceGeom.groups
            : [{ start: 0, count: fullIndexCount, materialIndex: 0 }]

        for (const group of groups) {
          const matIndex = Math.min(
            Math.max(0, group.materialIndex ?? 0),
            Math.max(0, materials.length - 1)
          )
          const mat = materials[matIndex]
          const { key, color, texture, forcePng } = partKeyForMaterial(mat)
          const bucket = getBucket(key, color, texture, forcePng)

          // Simplify per material group so (1) Meshopt/area-reduce cannot leave stale
          // group ranges that read past the new index, and (2) multi-material cars keep
          // each texture matched to its own triangles after reduction.
          if (needsSimplify) {
            const groupTris = Math.floor(group.count / 3)
            const targetTris = Math.max(4, Math.floor(groupTris * simplifyRatio))
            const sliced =
              extractIndexRangeGeometry(sourceGeom, group.start, group.count) ||
              sourceGeom
            if (sliced !== sourceGeom) disposableGeometries.push(sliced)

            let workGeom = sliced
            if (groupTris > targetTris) {
              const simplified = StreetsGLBridge.simplifyGeometryForBridge(
                sliced,
                targetTris,
                obj.name || 'mesh'
              )
              if (simplified && simplified !== sliced) {
                workGeom = simplified
                disposableGeometries.push(simplified)
              }
            }

            const workIndex = workGeom.index
              ? (workGeom.index.array as ArrayLike<number>)
              : (() => {
                  const n = workGeom.attributes.position.count
                  const seq = new Uint32Array(n)
                  for (let i = 0; i < n; i++) seq[i] = i
                  return seq
                })()
            const workCount = workGeom.index
              ? workGeom.index.count
              : workGeom.attributes.position.count
            appendTriangleVertices(bucket, workGeom, workIndex, 0, workCount)
          } else {
            appendTriangleVertices(bucket, sourceGeom, indexArray, group.start, group.count)
          }
        }
      }

      if (obj.children?.length) {
        for (const child of obj.children) traverse(child)
      }
    }

    try {
      traverse(threeObject)
    } finally {
      disposableGeometries.forEach((g) => g.dispose())
    }

    if (needsSimplify) {
      threeObject.userData.streetsGLGeometrySimplified = true
      threeObject.userData.streetsGLOriginalVertexCount = totalSourceVertices
      threeObject.userData.streetsGLOriginalTriangleCount = totalSourceTris
    }

    const sorted = Array.from(buckets.entries())
      .map(([key, bucket]) => ({ key, bucket }))
      .filter(({ bucket }) => bucket.positions.length >= 9)
      .sort((a, b) => b.bucket.vertexWeight - a.bucket.vertexWeight)

    if (sorted.length > STREETS_GL_MAX_MESH_PARTS) {
      console.warn(
        `[StreetsGLBridge] Model has ${sorted.length} unique material/texture parts; keeping top ${STREETS_GL_MAX_MESH_PARTS} by surface area`
      )
    }

    const kept = sorted.slice(0, STREETS_GL_MAX_MESH_PARTS)
    const parts = kept.map(({ bucket }) => {
      const positions = Float32Array.from(bucket.positions)
      let normals = Float32Array.from(bucket.normals)
      if (normals.length !== positions.length) {
        normals = Float32Array.from(
          StreetsGLBridge.computeNormalsFromPositionsAndIndices(
            Array.from(positions),
            bucket.indices
          )
        )
      }
      const vertexCount = positions.length / 3
      let uvs = Float32Array.from(bucket.uvs)
      if (uvs.length !== vertexCount * 2) {
        const padded = new Float32Array(vertexCount * 2)
        for (let v = 0; v < vertexCount; v++) {
          padded[v * 2] = uvs[v * 2] ?? 0
          padded[v * 2 + 1] = uvs[v * 2 + 1] ?? 0
        }
        uvs = padded
      }

      return {
        geometry: {
          positions,
          normals,
          uvs,
          indices: Uint32Array.from(bucket.indices)
        },
        color: bucket.serializedTexture ? { r: 1, g: 1, b: 1 } : bucket.color,
        baseColorTextureDataUrl: bucket.serializedTexture?.dataUrl,
        baseColorTextureBytes: bucket.serializedTexture?.bytes,
        baseColorTextureMime: bucket.serializedTexture?.mime
      } satisfies StreetsGLMeshPart
    })

    return StreetsGLBridge.reducePartsToVertexBudget(parts, STREETS_GL_MAX_VERTICES)
  }

  /**
   * Wait until texture images used by a model are decoded (GLB textures often load async).
   */
  static async ensureTexturesReady(root: THREE.Object3D, timeoutMs = 12000): Promise<void> {
    const waits: Promise<void>[] = []
    const textureKeys = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of materials) {
        if (!mat) continue
        for (const key of textureKeys) {
          const tex = (mat as any)[key] as THREE.Texture | undefined
          if (tex instanceof THREE.Texture) {
            waits.push(StreetsGLBridge.waitForTexture(tex, timeoutMs))
          }
        }
      }
    })

    if (waits.length > 0) {
      await Promise.all(waits)
    }
  }

  private static waitForTexture(texture: THREE.Texture, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const image = texture.image as HTMLImageElement | undefined
      if (
        !image ||
        typeof HTMLImageElement === 'undefined' ||
        !(image instanceof HTMLImageElement)
      ) {
        resolve()
        return
      }
      if (image.complete && image.naturalWidth > 0) {
        resolve()
        return
      }

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        image.removeEventListener('load', finish)
        image.removeEventListener('error', finish)
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, timeoutMs)
      image.addEventListener('load', finish)
      image.addEventListener('error', finish)
    })
  }

  /**
   * Decode a data URL into an ArrayBuffer (sync). Used to prefer binary postMessage
   * transport and avoid base64 inflation against the SEC char budget.
   */
  static dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | undefined {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return undefined
    const meta = dataUrl.slice(0, comma)
    const payload = dataUrl.slice(comma + 1)
    try {
      if (/;base64/i.test(meta)) {
        const binary = atob(payload)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
      }
      const decoded = decodeURIComponent(payload)
      const bytes = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
      return bytes.buffer
    } catch {
      return undefined
    }
  }

  /**
   * Serialize a Three.js texture for Streets GL postMessage.
   * Caps the longest edge at maxSize (default 4k). Opaque maps use JPEG; PNG only when
   * alpha is required. Prefers compressed ArrayBuffer bytes (no base64 bloat); attaches a
   * data URL only when it fits the SEC char budget. Downscales only when the compressed
   * byte budget is exceeded.
   */
  static serializeTextureForBridge(
    texture: THREE.Texture,
    maxSize = STREETS_GL_MAX_TEXTURE_SIZE,
    options?: { forcePng?: boolean }
  ): StreetsGLSerializedTexture | undefined {
    const image = texture?.image as CanvasImageSource & {
      width?: number
      height?: number
      data?: ArrayLike<number>
      isDataTexture?: boolean
    } | undefined
    if (!image) return undefined

    try {
      const canvas = document.createElement('canvas')
      let source: CanvasImageSource | null = null
      let srcW = 0
      let srcH = 0

      if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
        if (!image.complete || image.naturalWidth === 0) return undefined
        source = image
        srcW = image.naturalWidth
        srcH = image.naturalHeight
      } else if (
        (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
        (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
      ) {
        source = image
        srcW = image.width
        srcH = image.height
      } else if (
        typeof (image as any).width === 'number' &&
        typeof (image as any).height === 'number' &&
        ((image as any).data instanceof Uint8Array || (image as any).data instanceof Uint8ClampedArray)
      ) {
        // THREE.DataTexture / raw RGBA buffer
        srcW = (image as any).width
        srcH = (image as any).height
        const data = (image as any).data as Uint8Array | Uint8ClampedArray
        canvas.width = srcW
        canvas.height = srcH
        const ctx = canvas.getContext('2d')
        if (!ctx) return undefined
        const imageData = ctx.createImageData(srcW, srcH)
        imageData.data.set(data.subarray(0, srcW * srcH * 4) as Uint8ClampedArray)
        ctx.putImageData(imageData, 0, 0)
        source = canvas
      } else if (typeof (image as any).width === 'number' && typeof (image as any).height === 'number') {
        source = image as CanvasImageSource
        srcW = (image as any).width
        srcH = (image as any).height
      }

      if (!source || srcW <= 0 || srcH <= 0) return undefined

      const drawSource = (ctx: CanvasRenderingContext2D, targetW: number, targetH: number) => {
        ctx.clearRect(0, 0, targetW, targetH)
        // glTF/GLB textures use flipY=false in Three.js; canvas drawImage matches that convention.
        if (texture.flipY === true) {
          ctx.translate(0, targetH)
          ctx.scale(1, -1)
        }
        ctx.drawImage(source as CanvasImageSource, 0, 0, targetW, targetH)
      }

      // Prefer JPEG for opaque albedo. Three.js defaults to RGBAFormat even for opaque
      // maps — using that alone as a PNG trigger forced aggressive 512px downscales.
      const usePng =
        options?.forcePng === true || (texture as { premultiplyAlpha?: boolean }).premultiplyAlpha === true

      const encodeAt = (
        edgeCap: number
      ): { dataUrl: string; width: number; height: number; mime: string } | undefined => {
        const scale = Math.min(1, edgeCap / Math.max(srcW, srcH))
        const outW = Math.max(1, Math.round(srcW * scale))
        const outH = Math.max(1, Math.round(srcH * scale))
        const mime = usePng ? 'image/png' : 'image/jpeg'
        const quality = usePng ? undefined : STREETS_GL_TEXTURE_JPEG_QUALITY

        let dataUrl: string
        if (source !== canvas) {
          canvas.width = outW
          canvas.height = outH
          const ctx = canvas.getContext('2d')
          if (!ctx) return undefined
          drawSource(ctx, outW, outH)
          dataUrl = canvas.toDataURL(mime, quality)
        } else if (scale < 1) {
          const scaled = document.createElement('canvas')
          scaled.width = outW
          scaled.height = outH
          const sctx = scaled.getContext('2d')
          if (!sctx) return undefined
          drawSource(sctx, outW, outH)
          dataUrl = scaled.toDataURL(mime, quality)
        } else {
          dataUrl = canvas.toDataURL(mime, quality)
        }
        return { dataUrl, width: outW, height: outH, mime }
      }

      let edgeCap = Math.max(1, Math.min(maxSize, STREETS_GL_MAX_TEXTURE_SIZE))
      let encoded = encodeAt(edgeCap)
      if (!encoded) return undefined

      let bytes = StreetsGLBridge.dataUrlToArrayBuffer(encoded.dataUrl)

      // Budget against compressed bytes (preferred). Fall back to data-URL char length
      // when base64 decode is unavailable.
      const overBudget = (): boolean => {
        if (bytes) return bytes.byteLength > STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES
        return encoded!.dataUrl.length > STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS
      }

      while (overBudget() && edgeCap > 256) {
        edgeCap = Math.max(256, Math.floor(edgeCap / 2))
        encoded = encodeAt(edgeCap)
        if (!encoded) return undefined
        bytes = StreetsGLBridge.dataUrlToArrayBuffer(encoded.dataUrl)
      }

      if (overBudget()) {
        console.warn(
          `[StreetsGLBridge] Texture still exceeds budget after downscale (` +
            `${bytes ? `${bytes.byteLength} bytes` : `${encoded.dataUrl.length} chars`})`
        )
        return undefined
      }

      const result: StreetsGLSerializedTexture = {
        mime: encoded.mime,
        width: encoded.width,
        height: encoded.height
      }

      if (bytes) {
        result.bytes = bytes
        // Attach data URL only when it fits the legacy SEC char cap (small maps / old iframe).
        if (encoded.dataUrl.length <= STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS) {
          result.dataUrl = encoded.dataUrl
        }
      } else {
        result.dataUrl = encoded.dataUrl
      }

      return result
    } catch (e) {
      console.warn('[StreetsGLBridge] Could not serialize texture for bridge:', e)
      return undefined
    }
  }

  /**
   * Convert a Three.js texture image to a data URL for postMessage transport.
   * Caps the longest edge at maxSize (default 4k). Prefer {@link serializeTextureForBridge}
   * for new call sites (binary transfer).
   */
  static textureToDataURL(
    texture: THREE.Texture,
    maxSize = STREETS_GL_MAX_TEXTURE_SIZE,
    options?: { forcePng?: boolean }
  ): string | undefined {
    const serialized = StreetsGLBridge.serializeTextureForBridge(texture, maxSize, options)
    if (!serialized) return undefined
    if (serialized.dataUrl) return serialized.dataUrl
    // Large maps may omit dataUrl — rebuild a data URL from bytes for legacy callers.
    if (serialized.bytes) {
      const view = new Uint8Array(serialized.bytes)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < view.length; i += chunk) {
        binary += String.fromCharCode(...view.subarray(i, i + chunk))
      }
      return `data:${serialized.mime};base64,${btoa(binary)}`
    }
    return undefined
  }

  /** Read RGB from a Three.js material (MeshStandardMaterial, MeshBasicMaterial, etc.) */
  private static readMaterialColor(mat: any): { r: number; g: number; b: number } {
    if (mat.color) {
      if (mat.color.r !== undefined) {
        return { r: mat.color.r, g: mat.color.g, b: mat.color.b }
      }
      if (mat.color instanceof THREE.Color) {
        return { r: mat.color.r, g: mat.color.g, b: mat.color.b }
      }
    }
    if (mat.emissive instanceof THREE.Color) {
      return { r: mat.emissive.r, g: mat.emissive.g, b: mat.emissive.b }
    }
    return { r: 1, g: 1, b: 1 }
  }

  /**
   * Extract material information from Three.js object
   * Returns color, textures, and other material properties for Streets GL rendering
   */
  static extractMaterialFromThreeJS(threeObject: any): { 
    color?: { r: number; g: number; b: number }
    baseColorTextureDataUrl?: string
    textures?: {
      map?: string // Albedo/diffuse texture URL
      normalMap?: string // Normal map URL
      roughnessMap?: string // Roughness map URL
      metalnessMap?: string // Metalness map URL
      aoMap?: string // Ambient occlusion map URL
      emissiveMap?: string // Emissive map URL
    }
    materialProperties?: {
      roughness?: number
      metalness?: number
      emissive?: { r: number; g: number; b: number }
      emissiveIntensity?: number
    }
  } | undefined {
    // Streets GL external objects support a single base-color texture. Pick the material
    // covering the most surface area instead of averaging every sub-mesh (which tints GLTF cars).
    let dominantWeight = 0
    let dominantMaterial: any = null
    let dominantColor = { r: 1, g: 1, b: 1 }

    let texturedWeight = 0
    let baseColorTextureDataUrl: string | undefined
    let texturedMaterialColor = { r: 1, g: 1, b: 1 }

    const considerMaterial = (mat: any, vertexWeight: number) => {
      if (!mat) return
      const weight = Math.max(1, vertexWeight)
      const color = StreetsGLBridge.readMaterialColor(mat)

      if (weight >= dominantWeight) {
        dominantWeight = weight
        dominantMaterial = mat
        dominantColor = color
      }

      const baseColorTex = (mat.map instanceof THREE.Texture ? mat.map : undefined)
        ?? (mat.emissiveMap instanceof THREE.Texture ? mat.emissiveMap : undefined)

      if (baseColorTex instanceof THREE.Texture) {
        const texUrl = StreetsGLBridge.textureToDataURL(baseColorTex)
        if (texUrl && weight >= texturedWeight) {
          texturedWeight = weight
          baseColorTextureDataUrl = texUrl
          // Sample the texture untinted in Streets GL (shader multiplies by color).
          texturedMaterialColor = { r: 1, g: 1, b: 1 }
        } else if (
          !texUrl &&
          typeof HTMLImageElement !== 'undefined' &&
          baseColorTex.image instanceof HTMLImageElement &&
          !baseColorTex.image.complete
        ) {
          console.warn('[StreetsGLBridge] Base color texture not yet loaded — Streets GL will use material color fallback')
        }
      }
    }

    const traverse = (obj: any) => {
      if (obj.isMesh && obj.geometry) {
        const vertexCount = obj.geometry.attributes?.position?.count
          || (obj.geometry.attributes?.position?.array?.length ?? 0) / 3
          || 1
        const mat = obj.material
        if (Array.isArray(mat)) {
          mat.forEach((m) => considerMaterial(m, Math.max(1, Math.floor(vertexCount / mat.length))))
        } else {
          considerMaterial(mat, vertexCount)
        }
      }
      if (obj.children?.length) {
        for (const child of obj.children) traverse(child)
      }
    }

    traverse(threeObject)

    if (!dominantMaterial) {
      return undefined
    }

    const material = dominantMaterial
    const objectColor = baseColorTextureDataUrl ? texturedMaterialColor : dominantColor

    // Extract texture URLs (convert to data URLs or keep as URLs)
    const textures: any = {}
    const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
    
    for (const prop of textureProps) {
      const texture = material[prop] as THREE.Texture | undefined
      if (texture && texture instanceof THREE.Texture) {
        // Prefer canvas/data URL serialization over raw blob/src URLs (unreliable in iframe).
        const dataUrl = prop === 'map' ? baseColorTextureDataUrl : StreetsGLBridge.textureToDataURL(texture)
        if (dataUrl) {
          textures[prop] = dataUrl
          continue
        }

        let textureUrl: string | undefined = undefined
        
        if (texture.image) {
          if (typeof HTMLImageElement !== 'undefined' && texture.image instanceof HTMLImageElement) {
            textureUrl = texture.image.src
          } else if (typeof HTMLCanvasElement !== 'undefined' && texture.image instanceof HTMLCanvasElement) {
            try {
              textureUrl = texture.image.toDataURL('image/png')
            } catch (e) {
              console.warn(`[StreetsGLBridge] Could not convert ${prop} canvas to data URL:`, e)
            }
          } else if ((texture.image as any).src) {
            textureUrl = (texture.image as any).src
          }
        }
        
        if (!textureUrl && (texture as any).userData?.url) {
          textureUrl = (texture as any).userData.url
        }
        
        if (textureUrl) {
          textures[prop] = textureUrl
        }
      }
    }

    // Extract material properties
    const materialProperties: any = {}
    if (material.roughness !== undefined) {
      materialProperties.roughness = material.roughness
    }
    if (material.metalness !== undefined) {
      materialProperties.metalness = material.metalness
    }
    if (material.emissive && material.emissive.r !== undefined) {
      materialProperties.emissive = {
        r: material.emissive.r,
        g: material.emissive.g,
        b: material.emissive.b
      }
    }
    if (material.emissiveIntensity !== undefined) {
      materialProperties.emissiveIntensity = material.emissiveIntensity
    }

    const result: any = {
      color: objectColor
    }
    if (baseColorTextureDataUrl) {
      result.baseColorTextureDataUrl = baseColorTextureDataUrl
    }
    if (Object.keys(textures).length > 0) result.textures = textures
    if (Object.keys(materialProperties).length > 0) result.materialProperties = materialProperties

    return result
  }

  /**
   * Extract shadow settings from Three.js object
   * Returns castShadow and receiveShadow settings for Streets GL rendering
   */
  static extractShadowSettings(threeObject: any): { castShadow?: boolean; receiveShadow?: boolean } | undefined {
    let castShadow: boolean | undefined = undefined
    let receiveShadow: boolean | undefined = undefined

    // Traverse to find first mesh with shadow settings
    const traverse = (obj: any) => {
      if (obj.type === 'Mesh') {
        if (obj.castShadow !== undefined) {
          castShadow = obj.castShadow
        }
        if (obj.receiveShadow !== undefined) {
          receiveShadow = obj.receiveShadow
        }
        if (castShadow !== undefined || receiveShadow !== undefined) {
          return true // Found shadow settings
        }
      }

      // Check children
      if (obj.children && obj.children.length > 0) {
        for (const child of obj.children) {
          if (traverse(child)) {
            return true
          }
        }
      }
      return false
    }

    traverse(threeObject)

    if (castShadow === undefined && receiveShadow === undefined) {
      return undefined
    }

    return {
      castShadow: castShadow ?? true, // Default to true for full rendering
      receiveShadow: receiveShadow ?? true // Default to true for full rendering
    }
  }

  /**
   * Set shadow quality in Streets GL
   */
  setShadowQuality(quality: 'low' | 'medium' | 'high'): void {
    this.sendMessage('STREETS_GL_SET_SHADOW_QUALITY', { quality })
  }

  /**
   * Set sun direction in Streets GL
   */
  setSunDirection(direction: { x: number; y: number; z: number }): void {
    this.sendMessage('STREETS_GL_SET_SUN_DIRECTION', { direction })
  }

  /**
   * Set sun intensity in Streets GL
   */
  setSunIntensity(intensity: number): void {
    this.sendMessage('STREETS_GL_SET_SUN_INTENSITY', { intensity })
  }

  /**
   * Set sun color in Streets GL
   */
  setSunColor(color: { r: number; g: number; b: number }): void {
    this.sendMessage('STREETS_GL_SET_SUN_COLOR', { color })
  }
}

