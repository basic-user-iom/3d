/**
 * Streets GL Bridge - Client Side
 * Communicates with Streets GL iframe to add/manipulate objects
 */

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { simpleDecimation } from './geometryRepair'

const isStreetsGLDebugEnabled = (): boolean =>
  typeof window !== 'undefined' && (window as any).__streetsGLDebug === true

/** Vertex budget for a single Streets GL bridge payload (postMessage structured clone). */
export const STREETS_GL_MAX_VERTICES = 200_000

/** Warn when geometry exceeds this; still attempt sync with TypedArrays. */
export const STREETS_GL_LARGE_VERTEX_WARN = 150_000

/**
 * Cap unique textured/solid parts per object. Materials that share a texture.uuid are
 * merged into one part (correct UVs). Distinct textures become separate draw parts so
 * we never sample one atlas with another mesh's UVs (the striped/scrambled look).
 */
export const STREETS_GL_MAX_MESH_PARTS = 48

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
  baseColorTextureDataUrl?: string
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

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe
    this.iframeWindow = iframe.contentWindow
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
      // Security: In production, check event.origin === 'http://localhost:8081'
      if (!event.data || typeof event.data !== 'object') return

      const { type, payload } = event.data

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
   * Send message to Streets GL iframe
   */
  private sendMessage(type: string, payload: any): void {
    if (!this.iframeWindow) {
      console.warn('[StreetsGLBridge] Iframe window not available')
      return
    }

    this.iframeWindow.postMessage({
      type,
      payload
    }, '*') // In production, specify exact origin: 'http://localhost:8081'
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

      const vertexCountForTimeout = object.geometry?.positions?.length
        ? Math.floor(object.geometry.positions.length / 3)
        : 0
      const addTimeoutMs = Math.min(
        60_000,
        Math.max(8_000, 5_000 + Math.floor(vertexCountForTimeout / 50))
      )

      const timeout = setTimeout(() => {
        this.off('STREETS_GL_OBJECT_ADDED', handler)
        const msg = `[StreetsGLBridge] Timeout (${addTimeoutMs}ms) waiting for Streets GL to add object: ${object.id} (${vertexCountForTimeout.toLocaleString()} vertices)`
        console.error(msg)
        useAppStore.getState().setError(
          `Streets GL import timed out for "${object.metadata?.name || object.id}" (${vertexCountForTimeout.toLocaleString()} vertices). Try simplifying the model in the Optimize panel.`
        )
        resolve({ success: false, queued: false })
      }, addTimeoutMs)

      const handler = (payload: any) => {
        if (payload.objectId === object.id) {
          clearTimeout(timeout)
          this.off('STREETS_GL_OBJECT_ADDED', handler)
          if (payload.success) {
            const vertexCount = object.geometry?.positions?.length
              ? Math.floor(object.geometry.positions.length / 3)
              : 0
            console.log('[StreetsGLBridge] ✅ Object added to Streets GL:', {
              id: object.id,
              name: object.metadata?.name || object.id,
              visible: object.visible !== false,
              position: object.position,
              vertexCount
            })
            this.debugLog('[StreetsGLBridge] ✅ Object successfully added to Streets GL:', object.id)
          } else {
            console.error('[StreetsGLBridge] ❌ Failed to add object to Streets GL:', object.id, payload.error)
            useAppStore.getState().setError(
              `Streets GL rejected object "${object.metadata?.name || object.id}": ${payload.error || 'unknown error'}`
            )
          }
          resolve({ success: payload.success === true, queued: false })
        }
      }

      this.on('STREETS_GL_OBJECT_ADDED', handler)

      // Ensure geometry arrays are plain arrays for reliable postMessage (structured clone)
      const payload = StreetsGLBridge.ensureGeometrySerializable(object)
      const vertexCount = payload.geometry?.positions?.length
        ? Math.floor(payload.geometry.positions.length / 3)
        : 0
      if (vertexCount > STREETS_GL_LARGE_VERTEX_WARN) {
        console.warn('[StreetsGLBridge] ⚠️ Large geometry for Streets GL bridge:', {
          id: object.id,
          vertexCount,
          note: vertexCount > STREETS_GL_MAX_VERTICES
            ? 'Geometry was auto-simplified for the bridge; full detail remains in the main viewer'
            : 'Using compact TypedArray transport'
        })
      }

      try {
        this.sendMessage('STREETS_GL_ADD_OBJECT', payload)
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
        texturedParts: parts.filter((p) => !!p.baseColorTextureDataUrl).length,
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
      visible: (() => {
        const ud = threeObject.userData || {}
        if (ud.renderInStreetsGL === true) {
          return ud.streetsGLVisible !== false
        }
        return threeObject.visible !== false
      })(),
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
      textureDataUrl?: string
      vertexWeight: number
    }

    const buckets = new Map<string, Accumulator>()
    const disposableGeometries: THREE.BufferGeometry[] = []
    const textureDataUrlCache = new Map<string, string | undefined>()

    let totalSourceVertices = 0
    threeObject.traverse((obj: any) => {
      if (obj.isMesh && obj.geometry?.attributes?.position) {
        totalSourceVertices += obj.geometry.attributes.position.count
      }
    })
    const needsSimplify = totalSourceVertices > STREETS_GL_MAX_VERTICES
    const simplifyRatio = needsSimplify ? STREETS_GL_MAX_VERTICES / totalSourceVertices : 1
    if (needsSimplify) {
      console.warn('[StreetsGLBridge] Auto-simplifying model for Streets GL bridge:', {
        name: threeObject.name || 'unnamed',
        originalVertices: totalSourceVertices,
        targetVertices: STREETS_GL_MAX_VERTICES,
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
        let textureDataUrl: string | undefined
        if (texture) {
          const cacheKey = `${texture.uuid}:${forcePng ? 'png' : 'auto'}`
          if (textureDataUrlCache.has(cacheKey)) {
            textureDataUrl = textureDataUrlCache.get(cacheKey)
          } else {
            textureDataUrl = StreetsGLBridge.textureToDataURL(texture, 512, { forcePng })
            textureDataUrlCache.set(cacheKey, textureDataUrl)
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
          textureDataUrl,
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
      for (let i = indexStart; i < indexStart + indexCount; i += 3) {
        if (i + 2 >= indexStart + indexCount) break
        const cornerIndices = [indexList[i], indexList[i + 1], indexList[i + 2]]
        for (const srcIdx of cornerIndices) {
          if (srcIdx < 0 || srcIdx >= srcVertexCount) {
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
        let geom: THREE.BufferGeometry = obj.geometry
        if (needsSimplify && geom.index) {
          const triCount = geom.index.count / 3
          const targetTris = Math.max(4, Math.floor(triCount * simplifyRatio))
          const simplified = simpleDecimation(geom, targetTris, obj.name || 'mesh')
          if (simplified && simplified !== geom) {
            geom = simplified
            disposableGeometries.push(simplified)
          }
        }

        if (!geom.attributes?.position) {
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

        const indexAttr = geom.index
        const posCount = geom.attributes.position.count
        const fullIndexCount = indexAttr ? indexAttr.count : posCount
        const indexArray: ArrayLike<number> = indexAttr
          ? (indexAttr.array as ArrayLike<number>)
          : (() => {
              const seq = new Uint32Array(posCount)
              for (let i = 0; i < posCount; i++) seq[i] = i
              return seq
            })()

        const groups =
          geom.groups && geom.groups.length > 0
            ? geom.groups
            : [{ start: 0, count: fullIndexCount, materialIndex: 0 }]

        for (const group of groups) {
          const matIndex = Math.min(
            Math.max(0, group.materialIndex ?? 0),
            Math.max(0, materials.length - 1)
          )
          const mat = materials[matIndex]
          const { key, color, texture, forcePng } = partKeyForMaterial(mat)
          const bucket = getBucket(key, color, texture, forcePng)
          appendTriangleVertices(bucket, geom, indexArray, group.start, group.count)
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
    return kept.map(({ bucket }) => {
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
        color: bucket.textureDataUrl ? { r: 1, g: 1, b: 1 } : bucket.color,
        baseColorTextureDataUrl: bucket.textureDataUrl
      } satisfies StreetsGLMeshPart
    })
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
   * Convert a Three.js texture image to a data URL for postMessage transport.
   * Resizes to maxSize to stay within structured-clone / postMessage limits.
   */
  static textureToDataURL(
    texture: THREE.Texture,
    maxSize = 512,
    options?: { forcePng?: boolean }
  ): string | undefined {
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

      const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
      const drawSource = (ctx: CanvasRenderingContext2D, targetW: number, targetH: number) => {
        ctx.clearRect(0, 0, targetW, targetH)
        // glTF/GLB textures use flipY=false in Three.js; canvas drawImage matches that convention.
        if (texture.flipY === true) {
          ctx.translate(0, targetH)
          ctx.scale(1, -1)
        }
        ctx.drawImage(source as CanvasImageSource, 0, 0, targetW, targetH)
      }

      const usePng =
        options?.forcePng === true ||
        texture.format === THREE.RGBAFormat ||
        (texture as any).premultiplyAlpha === true

      if (source !== canvas) {
        canvas.width = Math.max(1, Math.round(srcW * scale))
        canvas.height = Math.max(1, Math.round(srcH * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return undefined
        drawSource(ctx, canvas.width, canvas.height)
      } else if (scale < 1) {
        const scaled = document.createElement('canvas')
        scaled.width = Math.max(1, Math.round(srcW * scale))
        scaled.height = Math.max(1, Math.round(srcH * scale))
        const sctx = scaled.getContext('2d')
        if (!sctx) return undefined
        drawSource(sctx, scaled.width, scaled.height)
        return scaled.toDataURL(usePng ? 'image/png' : 'image/jpeg', usePng ? undefined : 0.9)
      }

      return canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', usePng ? undefined : 0.9)
    } catch (e) {
      console.warn('[StreetsGLBridge] Could not serialize texture to data URL:', e)
      return undefined
    }
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

