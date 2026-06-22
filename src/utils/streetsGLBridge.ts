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

export interface GeometryData {
  positions: number[] | Float32Array // [x, y, z, x, y, z, ...]
  indices?: number[] | Uint32Array // [i1, i2, i3, i1, i2, i3, ...]
  normals?: number[] | Float32Array // [nx, ny, nz, nx, ny, nz, ...]
  uvs?: number[] | Float32Array // [u, v, u, v, ...]
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
  geometry?: GeometryData // Optional geometry data for rendering
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

export class StreetsGLBridge {
  private iframe: HTMLIFrameElement | null = null
  private iframeWindow: Window | null = null
  private bridgeReady: boolean = false
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
    return new Promise((resolve) => {
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] Bridge not ready')
        resolve(false)
        return
      }

      const handler = (payload: any) => {
        if (payload.objectId === objectId) {
          this.off('STREETS_GL_OBJECT_UPDATED', handler)
          resolve(payload.success === true)
        }
      }

      this.on('STREETS_GL_OBJECT_UPDATED', handler)
      this.sendMessage('STREETS_GL_UPDATE_OBJECT', {
        id: objectId,
        ...updates
      })
    })
  }

  /**
   * Remove an object from Streets GL scene
   */
  removeObject(objectId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] Bridge not ready')
        resolve(false)
        return
      }

      const handler = (payload: any) => {
        if (payload.objectId === objectId) {
          this.off('STREETS_GL_OBJECT_REMOVED', handler)
          resolve(payload.success === true)
        }
      }

      this.on('STREETS_GL_OBJECT_REMOVED', handler)
      this.sendMessage('STREETS_GL_REMOVE_OBJECT', { id: objectId })
    })
  }

  /**
   * Get all objects in Streets GL scene
   */
  getObjects(): Promise<StreetsGLObject[]> {
    return new Promise((resolve) => {
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] Bridge not ready')
        resolve([])
        return
      }

      const handler = (payload: any) => {
        if (payload.success) {
          this.off('STREETS_GL_OBJECTS_LIST', handler)
          resolve(payload.objects || [])
        }
      }

      this.on('STREETS_GL_OBJECTS_LIST', handler)
      this.sendMessage('STREETS_GL_GET_OBJECTS', {})
    })
  }

  /**
   * Sync multiple objects at once
   */
  syncObjects(objects: StreetsGLObject[]): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bridgeReady) {
        console.warn('[StreetsGLBridge] Bridge not ready')
        resolve(false)
        return
      }

      const handler = (payload: any) => {
        if (payload.success) {
          this.off('STREETS_GL_OBJECTS_SYNCED', handler)
          resolve(true)
        }
      }

      this.on('STREETS_GL_OBJECTS_SYNCED', handler)
      this.sendMessage('STREETS_GL_SYNC_OBJECTS', objects)
    })
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
      } | null
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
          await callback(
            payload.position,
            payload.estimatedHeight ?? 0,
            payload.buildingSize ?? null,
            payload.buildingBounds ?? null
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

  dispose(): void {
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
   * Convert Three.js object to Streets GL object format
   */
  static fromThreeJSObject(threeObject: any, id?: string): StreetsGLObject {
    const position = threeObject.position || { x: 0, y: 0, z: 0 }
    const rotation = threeObject.rotation || { x: 0, y: 0, z: 0 }
    const scale = threeObject.scale || { x: 1, y: 1, z: 1 }

    // Extract geometry data from Three.js object
    const geometry = StreetsGLBridge.extractGeometryFromThreeJS(threeObject)
    
    // Extract material information (color, etc.)
    const material = StreetsGLBridge.extractMaterialFromThreeJS(threeObject)
    
    // Extract shadow settings
    const shadowSettings = StreetsGLBridge.extractShadowSettings(threeObject)
    
    // Log geometry extraction for debugging
    if (geometry) {
      const vertexCount = geometry.positions ? geometry.positions.length / 3 : 0
      const indexCount = geometry.indices ? geometry.indices.length : 0
      if (isStreetsGLDebugEnabled()) {
        console.log('[StreetsGLBridge] Extracted geometry and material:', {
          id: id || 'unknown',
          vertexCount,
          indexCount,
          hasNormals: !!geometry.normals,
          hasUVs: !!geometry.uvs,
          hasMaterial: !!material,
          materialColor: material?.color,
          hasTextures: !!(material?.textures && Object.keys(material.textures).length > 0),
          textureCount: material?.textures ? Object.keys(material.textures).length : 0,
          textureTypes: material?.textures ? Object.keys(material.textures) : [],
          materialProperties: material?.materialProperties,
          shadowSettings,
          position: { x: position.x, y: position.y, z: position.z },
          scale: { x: scale.x, y: scale.y, z: scale.z }
        })
      }
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
      color: material?.color, // Include material color
      metadata: {
        name: threeObject.name || '',
        type: threeObject.type || 'Object3D',
        userData: threeObject.userData || {},
        // Include material and shadow settings in metadata for Streets GL
        material: material,
        baseColorTextureDataUrl: material?.baseColorTextureDataUrl,
        shadows: shadowSettings,
        castShadow: shadowSettings?.castShadow ?? true, // Default to true for full rendering
        receiveShadow: shadowSettings?.receiveShadow ?? true // Default to true for full rendering
      },
      geometry: geometry // Include geometry data if available
    }
  }

  /**
   * Ensure geometry uses compact TypedArrays for postMessage (structured clone).
   * TypedArrays are ~4× smaller than plain JS number arrays and clone faster.
   */
  static ensureGeometrySerializable(object: StreetsGLObject): StreetsGLObject {
    if (!object.geometry) return { ...object }
    const g = object.geometry
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
    return {
      ...object,
      geometry: {
        positions: toFloat32(g.positions as number[] | Float32Array) ?? new Float32Array(0),
        normals: toFloat32(g.normals as number[] | Float32Array | undefined),
        uvs: toFloat32(g.uvs as number[] | Float32Array | undefined),
        indices: toUint32(g.indices as number[] | Uint32Array | undefined)
      }
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
   * Extract geometry data from a Three.js object (traverses the scene graph)
   */
  static extractGeometryFromThreeJS(threeObject: any): GeometryData | undefined {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    let vertexOffset = 0
    const disposableGeometries: THREE.BufferGeometry[] = []

    // Count vertices across all meshes — Pagani-scale models (~340k verts) exceed postMessage
    // budgets when serialized as plain JS arrays; simplify per-mesh before extraction when needed.
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

    // Bake child mesh transforms into the root object's local space so multi-mesh GLTF/GLB
    // models (body, wheels, etc.) keep their relative layout when sent as one external object.
    threeObject.updateMatrixWorld(true)
    const rootInverse = new THREE.Matrix4().copy(threeObject.matrixWorld).invert()
    const toRoot = new THREE.Matrix4()
    const normalMatrix = new THREE.Matrix3()
    const vertex = new THREE.Vector3()
    const normalVec = new THREE.Vector3()

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

        const posAttr = geom.attributes?.position
        const normalAttr = geom.attributes?.normal
        const uvAttr = geom.attributes?.uv

        obj.updateMatrixWorld(true)
        toRoot.multiplyMatrices(rootInverse, obj.matrixWorld)
        normalMatrix.getNormalMatrix(toRoot)

        if (!posAttr) {
          if (obj.children?.length) {
            for (const child of obj.children) traverse(child)
          }
          return
        }

        const posArray = posAttr.array as ArrayLike<number>
        const vertexCount = posAttr.count || posArray.length / 3

        for (let v = 0; v < vertexCount; v++) {
          const i = v * 3
          vertex.set(posArray[i], posArray[i + 1], posArray[i + 2])
          vertex.applyMatrix4(toRoot)
          positions.push(vertex.x, vertex.y, vertex.z)
        }

        if (normalAttr) {
          const normalArray = normalAttr.array as ArrayLike<number>
          const normalCount = normalAttr.count || normalArray.length / 3

          for (let v = 0; v < vertexCount; v++) {
            if (v < normalCount) {
              const i = v * 3
              normalVec.set(normalArray[i], normalArray[i + 1], normalArray[i + 2])
              normalVec.applyMatrix3(normalMatrix).normalize()
              normals.push(normalVec.x, normalVec.y, normalVec.z)
            } else {
              normals.push(0, 1, 0)
            }
          }
        } else {
          for (let v = 0; v < vertexCount; v++) {
            normals.push(0, 1, 0)
          }
        }

        if (uvAttr) {
          const uvArray = uvAttr.array as ArrayLike<number>
          const uvCount = uvAttr.count || uvArray.length / 2
          for (let v = 0; v < vertexCount; v++) {
            if (v < uvCount) {
              const i = v * 2
              uvs.push(uvArray[i], uvArray[i + 1])
            } else {
              uvs.push(0, 0)
            }
          }
        } else {
          for (let v = 0; v < vertexCount; v++) {
            uvs.push(0, 0)
          }
        }

        if (geom.index) {
          const indexArray = geom.index.array as ArrayLike<number>
          for (let i = 0; i < indexArray.length; i++) {
            indices.push(indexArray[i] + vertexOffset)
          }
          vertexOffset += vertexCount
        } else {
          for (let i = 0; i < vertexCount; i++) {
            indices.push(vertexOffset + i)
          }
          vertexOffset += vertexCount
        }
      }

      if (obj.children && obj.children.length > 0) {
        for (const child of obj.children) {
          traverse(child)
        }
      }
    }

    try {
      traverse(threeObject)
    } finally {
      disposableGeometries.forEach((g) => g.dispose())
    }

    // Only return geometry if we found any vertices
    if (positions.length > 0) {
      // Ensure normals match vertex count (per-mesh gaps are padded above; recompute if still short).
      let finalNormals: Float32Array | undefined = undefined
      if (normals.length === positions.length) {
        finalNormals = Float32Array.from(normals)
      } else if (indices.length > 0) {
        const computedNormals = StreetsGLBridge.computeNormalsFromPositionsAndIndices(positions, indices)
        if (computedNormals.length > 0) {
          finalNormals = Float32Array.from(computedNormals)
          if (isStreetsGLDebugEnabled()) {
            console.log('[StreetsGLBridge] Computed normals from positions and indices:', {
              normalCount: finalNormals.length / 3,
              vertexCount: positions.length / 3
            })
          }
        }
      }

      const vertexCount = positions.length / 3
      let finalUvs: Float32Array | undefined = undefined
      if (uvs.length === vertexCount * 2) {
        finalUvs = Float32Array.from(uvs)
      } else if (uvs.length > 0) {
        // Pad/truncate to match vertex count so Streets GL mesh attributes stay aligned.
        const paddedUvs = new Float32Array(vertexCount * 2)
        for (let v = 0; v < vertexCount; v++) {
          paddedUvs[v * 2] = uvs[v * 2] ?? 0
          paddedUvs[v * 2 + 1] = uvs[v * 2 + 1] ?? 0
        }
        finalUvs = paddedUvs
      }

      if (needsSimplify) {
        threeObject.userData.streetsGLGeometrySimplified = true
        threeObject.userData.streetsGLOriginalVertexCount = totalSourceVertices
      }

      return {
        positions: Float32Array.from(positions),
        normals: finalNormals,
        uvs: finalUvs,
        indices: indices.length > 0 ? Uint32Array.from(indices) : undefined
      }
    }

    return undefined
  }

  /**
   * Convert a Three.js texture image to a JPEG data URL for postMessage transport.
   * Resizes to maxSize to stay within structured-clone / postMessage limits.
   */
  static textureToDataURL(texture: THREE.Texture, maxSize = 512): string | undefined {
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

      if (image instanceof HTMLImageElement) {
        if (!image.complete || image.naturalWidth === 0) return undefined
        source = image
        srcW = image.naturalWidth
        srcH = image.naturalHeight
      } else if (image instanceof HTMLCanvasElement || image instanceof ImageBitmap) {
        source = image
        srcW = image.width
        srcH = image.height
      } else if (
        typeof (image as any).width === 'number' &&
        typeof (image as any).height === 'number' &&
        (image as any).data instanceof Uint8Array
      ) {
        // THREE.DataTexture / raw RGBA buffer
        srcW = (image as any).width
        srcH = (image as any).height
        const data = (image as any).data as Uint8Array
        canvas.width = srcW
        canvas.height = srcH
        const ctx = canvas.getContext('2d')
        if (!ctx) return undefined
        const imageData = ctx.createImageData(srcW, srcH)
        imageData.data.set(data.subarray(0, srcW * srcH * 4))
        ctx.putImageData(imageData, 0, 0)
        source = canvas
      } else if (typeof (image as any).width === 'number' && typeof (image as any).height === 'number') {
        source = image as CanvasImageSource
        srcW = (image as any).width
        srcH = (image as any).height
      }

      if (!source || srcW <= 0 || srcH <= 0) return undefined

      const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
      if (source !== canvas) {
        canvas.width = Math.max(1, Math.round(srcW * scale))
        canvas.height = Math.max(1, Math.round(srcH * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return undefined
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
      } else if (scale < 1) {
        const scaled = document.createElement('canvas')
        scaled.width = Math.max(1, Math.round(srcW * scale))
        scaled.height = Math.max(1, Math.round(srcH * scale))
        const sctx = scaled.getContext('2d')
        if (!sctx) return undefined
        sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
        return scaled.toDataURL('image/jpeg', 0.85)
      }

      return canvas.toDataURL('image/jpeg', 0.85)
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

      if (mat.map instanceof THREE.Texture) {
        const texUrl = StreetsGLBridge.textureToDataURL(mat.map)
        if (texUrl && weight >= texturedWeight) {
          texturedWeight = weight
          baseColorTextureDataUrl = texUrl
          texturedMaterialColor = color
        } else if (!texUrl && mat.map.image instanceof HTMLImageElement && !mat.map.image.complete) {
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
          if (texture.image instanceof HTMLImageElement) {
            textureUrl = texture.image.src
          } else if (texture.image instanceof HTMLCanvasElement) {
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

