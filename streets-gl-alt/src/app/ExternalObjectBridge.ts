/**
 * External Object Bridge
 * Allows parent window to add objects to Streets GL scene via postMessage
 * 
 * This bridge enables communication between the main app (localhost:3000) 
 * and Streets GL iframe (localhost:8081) to add and manipulate objects.
 */

import Object3D from '~/lib/core/Object3D'
import SystemManager from './SystemManager'
import SceneSystem from './systems/SceneSystem'
import Vec3 from '~/lib/math/Vec3'
import MathUtils from '~/lib/math/MathUtils'
import RenderSystem from './systems/RenderSystem'
import AbstractRenderer from '~/lib/renderer/abstract-renderer/AbstractRenderer'
import ExternalRenderableObject, { GeometryData } from './objects/ExternalRenderableObject'
import SettingsSystem from './systems/SettingsSystem'
import MapTimeSystem from './systems/MapTimeSystem'
import PickingSystem from './systems/PickingSystem'
import ControlsSystem from './systems/ControlsSystem'
import TerrainSystem from './systems/TerrainSystem'

const isBridgeDebugEnabled = (): boolean =>
  typeof window !== 'undefined' && (window as any).__streetsGLDebug === true

interface ExternalObject {
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

export class ExternalObjectBridge {
  private sceneSystem: SceneSystem | null = null
  private settingsSystem: SettingsSystem | null = null
  private systemManager: SystemManager | null = null
  private renderSystem: RenderSystem | null = null
  private mapTimeSystem: MapTimeSystem | null = null
  private externalObjects: Map<string, Object3D> = new Map()
  private bridgeReady: boolean = false
  // Only auto-center the camera on the first external object so debugging is easy
  private hasCenteredOnExternalObject: boolean = false
  // Picking ids for external objects are allocated from a high reserved range so they are very
  // unlikely to collide with native building ids ((tileId << 16) + featureId + 1). PickingSystem
  // keeps an authoritative registry of these ids, so external selection never goes through the
  // tile/building decode path.
  private static readonly EXTERNAL_PICKING_ID_BASE = 0x7f000000
  private nextPickingId: number = ExternalObjectBridge.EXTERNAL_PICKING_ID_BASE
  private pickingSelectionWired: boolean = false

  private debugLog(...args: unknown[]): void {
    if (isBridgeDebugEnabled()) {
      console.log(...args)
    }
  }

  constructor(systemManager: SystemManager) {
    this.systemManager = systemManager
    this.init()
  }

  private init(): void {
    // Wait for SceneSystem and RenderSystem to be available
    const checkSystems = () => {
      try {
        this.sceneSystem = this.systemManager?.getSystem(SceneSystem) || null
        this.renderSystem = this.systemManager?.getSystem(RenderSystem) || null
        this.settingsSystem = this.systemManager?.getSystem(SettingsSystem) || null
        this.mapTimeSystem = this.systemManager?.getSystem(MapTimeSystem) || null
        
        if (this.sceneSystem && this.renderSystem) {
          this.setupMessageListener()
          this.bridgeReady = true
          this.notifyParentReady()
        } else {
          // Retry after a short delay
          setTimeout(checkSystems, 100)
        }
      } catch (e) {
        // Systems not ready yet, retry
        setTimeout(checkSystems, 100)
      }
    }
    checkSystems()
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      try {
        // Security: In production, check event.origin === 'http://localhost:3000'
        if (!event.data || typeof event.data !== 'object') return

        const { type, payload } = event.data

        switch (type) {
        case 'STREETS_GL_ADD_OBJECT':
          this.handleAddObject(payload)
          break
        case 'STREETS_GL_UPDATE_OBJECT':
          this.handleUpdateObject(payload)
          break
        case 'STREETS_GL_REMOVE_OBJECT':
          this.handleRemoveObject(payload)
          break
        case 'STREETS_GL_GET_OBJECTS':
          this.handleGetObjects()
          break
        case 'STREETS_GL_GET_CAMERA_POSITION':
          this.handleGetCameraPosition()
          break
        case 'STREETS_GL_GET_SELECTED_BUILDING':
          this.handleGetSelectedBuilding()
          break
        case 'STREETS_GL_SYNC_OBJECTS':
          this.handleSyncObjects(payload)
          break
        case 'STREETS_GL_SET_SHADOW_QUALITY':
          this.handleSetShadowQuality(payload)
          break
        case 'STREETS_GL_SET_SUN_DIRECTION':
          this.handleSetSunDirection(payload)
          break
        case 'STREETS_GL_SET_SUN_INTENSITY':
          this.handleSetSunIntensity(payload)
          break
        case 'STREETS_GL_SET_SUN_COLOR':
          this.handleSetSunColor(payload)
          break
        case 'STREETS_GL_NAVIGATE_TO':
          this.handleNavigateTo(payload)
          break
        default:
          // Unknown message type - log but don't error; ignore webpack HMR messages
          if (type && !type.startsWith('STREETS_GL_') && type !== 'webpackInvalid' && type !== 'webpackOk') {
            console.warn('[ExternalObjectBridge] Unknown message type:', type)
          }
          break
      }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ExternalObjectBridge] ❌ Error handling message:', {
          type: event.data?.type,
          error: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          payload: event.data?.payload
        })
      }
    })

    // Add global error handlers
    window.addEventListener('error', (event) => {
      console.error('[ExternalObjectBridge] ❌ Global error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      })
    })

    window.addEventListener('unhandledrejection', (event) => {
      console.error('[ExternalObjectBridge] ❌ Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise
      })
    })

    this.debugLog('[ExternalObjectBridge] Message listener set up with error handlers')
  }

  private notifyParentReady(): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'STREETS_GL_BRIDGE_READY',
        ready: true,
        timestamp: Date.now()
      }, '*') // In production, specify exact origin: 'http://localhost:3000'
      this.debugLog('[ExternalObjectBridge] Notified parent that bridge is ready')
    }
  }

  private handleAddObject(data: ExternalObject): void {
    if (!this.sceneSystem || !this.sceneSystem.scene) {
      console.warn('[ExternalObjectBridge] Scene not available')
      this.sendResponse('STREETS_GL_OBJECT_ADDED', {
        success: false,
        error: 'Scene not available',
        objectId: data.id
      })
      return
    }

    try {
      this.debugLog('[ExternalObjectBridge] Adding object:', data)

      let object: Object3D

      // If geometry data is provided, create a renderable object
      if (data.geometry && data.geometry.positions && data.geometry.positions.length > 0) {
        // Convert Float32Array from postMessage (it comes as a regular array)
        const positions = data.geometry.positions instanceof Float32Array 
          ? data.geometry.positions 
          : new Float32Array(data.geometry.positions)
        
        const normals = data.geometry.normals 
          ? (data.geometry.normals instanceof Float32Array 
              ? data.geometry.normals 
              : new Float32Array(data.geometry.normals))
          : undefined
        
        const uvs = data.geometry.uvs 
          ? (data.geometry.uvs instanceof Float32Array 
              ? data.geometry.uvs 
              : new Float32Array(data.geometry.uvs))
          : undefined
        
        const indices = data.geometry.indices 
          ? (data.geometry.indices instanceof Uint32Array 
              ? data.geometry.indices 
              : new Uint32Array(data.geometry.indices))
          : undefined

        const geometryData: GeometryData = {
          positions,
          normals,
          uvs,
          indices
        }

        // Reject NaN/Inf geometry — it breaks bounding boxes and frustum culling.
        for (let i = 0; i < positions.length; i++) {
          if (!Number.isFinite(positions[i])) {
            throw new Error(`Invalid geometry position at index ${i}`)
          }
        }

        const scale = data.scale || { x: 1, y: 1, z: 1 }
        if (
          Math.abs(scale.x || 0) < 1e-8 ||
          Math.abs(scale.y || 0) < 1e-8 ||
          Math.abs(scale.z || 0) < 1e-8
        ) {
          console.warn('[ExternalObjectBridge] Object has near-zero scale — forcing 1:', data.id, scale)
          data.scale = { x: 1, y: 1, z: 1 }
        }

        // Use provided color or default to white
        const objectColor = data.color || { r: 1.0, g: 1.0, b: 1.0 }
        this.debugLog('[ExternalObjectBridge] Received color from data:', {
          dataColor: data.color,
          objectColor,
          colorType: typeof data.color,
          colorKeys: data.color ? Object.keys(data.color) : []
        })
        const renderableObject = new ExternalRenderableObject(geometryData, objectColor)
        this.debugLog('[ExternalObjectBridge] Object color after creation:', {
          objectColor: renderableObject.color,
          matches: renderableObject.color.r === objectColor.r && renderableObject.color.g === objectColor.g && renderableObject.color.b === objectColor.b
        })

        const textureDataUrl = data.metadata?.baseColorTextureDataUrl
          || data.metadata?.material?.baseColorTextureDataUrl
        if (textureDataUrl && typeof textureDataUrl === 'string' && this.renderSystem) {
          const renderer = this.renderSystem.getRenderer()
          if (renderer) {
            renderableObject.setBaseColorTextureFromDataUrl(renderer, textureDataUrl)
          }
        }
        // Bridge positions are absolute Web-Mercator meters (same space as tiles). Do not re-ground
        // Y here — the parent app computes placement; updates use the same absolute convention.
        renderableObject.position = new Vec3(
          data.position.x,
          data.position.y ?? 1.5,
          data.position.z
        )
        renderableObject.rotation = new Vec3(data.rotation.x, data.rotation.y, data.rotation.z)
        renderableObject.scale = new Vec3(data.scale.x, data.scale.y, data.scale.z)
        ;(renderableObject as any).visible = data.visible !== false
        
        // CRITICAL: Update matrices so object renders correctly
        renderableObject.updateMatrix()
        renderableObject.updateMatrixWorld()
        
        // Store metadata
        ;(renderableObject as any).externalId = data.id
        ;(renderableObject as any).externalType = data.type
        ;(renderableObject as any).externalMetadata = data.metadata || {}

        // Assign a unique G-buffer picking id so PickingSystem can select this object.
        ;(renderableObject as any).pickingId = this.allocatePickingId(data.id)

        object = renderableObject
        this.debugLog('[ExternalObjectBridge] Created renderable object with geometry:', {
          id: data.id,
          vertexCount: positions.length / 3,
          hasNormals: !!normals,
          hasUVs: !!uvs,
          hasIndices: !!indices
        })
      } else {
        // No geometry - create a simple container object (invisible but can be used as a marker)
        object = new Object3D()
        object.position = new Vec3(data.position.x, data.position.y ?? 0, data.position.z)
        object.rotation = new Vec3(data.rotation.x, data.rotation.y, data.rotation.z)
        object.scale = new Vec3(data.scale.x, data.scale.y, data.scale.z)
        ;(object as any).visible = data.visible !== false
        
        // CRITICAL: Update matrices so object transforms correctly
        object.updateMatrix()
        object.updateMatrixWorld()
        
        // Store metadata
        ;(object as any).externalId = data.id
        ;(object as any).externalType = data.type
        ;(object as any).externalMetadata = data.metadata || {}
        
        this.debugLog('[ExternalObjectBridge] Created simple container object (no geometry):', data.id)
      }

      // Add the object UNDER the floating-origin `wrapper` (the same parent as tiles, terrain and
      // native instanced objects) rather than directly to `scene`. The wrapper is recentered to
      // `-cameraPos` every frame, so authoring positions in absolute Web-Mercator meters now renders
      // in the exact same near-origin render space as native geometry. This is what makes external
      // objects appear at the correct on-screen location and lets frustum culling work normally.
      this.sceneSystem.objects.wrapper.add(object)
      this.externalObjects.set(data.id, object)
      
      const isVisible = (object as any).visible !== false
      this.debugLog('[ExternalObjectBridge] Object added to scene:', {
        id: data.id,
        visible: isVisible,
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
        isRenderable: object instanceof ExternalRenderableObject,
        sceneChildrenCount: this.sceneSystem.scene.children.length
      })
      if (!isVisible && data.geometry?.positions?.length) {
        console.warn(
          '[ExternalObjectBridge] ⚠️ Object has geometry but visible=false — it will not render. Check parent sync visible flag.',
          data.id
        )
      }

      // If it's a renderable object, trigger mesh creation
      if (object instanceof ExternalRenderableObject && this.renderSystem) {
        const renderer = this.renderSystem.getRenderer()
        if (renderer) {
          this.debugLog('[ExternalObjectBridge] Creating mesh for renderable object:', data.id)
          object.updateMesh(renderer)
          this.debugLog('[ExternalObjectBridge] Mesh creation completed for:', data.id, {
            meshReady: object.isMeshReady(),
            hasMesh: !!object.mesh
          })
        } else {
          console.warn('[ExternalObjectBridge] Renderer not available for mesh creation:', data.id)
        }
      }

      // Frame the FIRST external object once so the user immediately sees something after adding.
      // This is now a convenience only (NOT a correctness crutch): placement is handled by the
      // floating-origin parenting above, so subsequent adds no longer hijack the camera on every
      // call. Removing/clearing all external objects resets this so the next add re-centers.
      if (this.systemManager && !this.hasCenteredOnExternalObject) {
        try {
          const controlsSystem = this.systemManager.getSystem(ControlsSystem)
          if (controlsSystem && object.position) {
            const { x, z } = object.position
            const { lat, lon } = MathUtils.meters2degrees(x, z)

            // Estimate the object's world-space size to pick a sensible viewing distance.
            const maxObjectSize = this.estimateObjectWorldSize(data)
            // Distance: keep the object comfortably in frame, with sane min/max bounds.
            const framingDistance = Math.min(Math.max(maxObjectSize * 4, 40), 2000)

            const debugPitchDeg = 60
            const debugYawDeg = 0

            controlsSystem.setState(lat, lon, debugPitchDeg, debugYawDeg, framingDistance)
            this.hasCenteredOnExternalObject = true

            this.debugLog('[ExternalObjectBridge] 📍 Framed camera on newly added external object:', {
              objectId: data.id,
              worldPosition: { x, y: object.position.y, z },
              lat,
              lon,
              pitchDeg: debugPitchDeg,
              yawDeg: debugYawDeg,
              maxObjectSize,
              distance: framingDistance
            })
          }
        } catch (e) {
          console.warn('[ExternalObjectBridge] Failed to frame camera on external object:', e)
        }
      }

      this.debugLog('[ExternalObjectBridge] ✅ Object added successfully:', data.id)

      this.sendResponse('STREETS_GL_OBJECT_ADDED', {
        success: true,
        objectId: data.id,
        message: 'Object added to Streets GL scene',
        hasGeometry: !!(data.geometry && data.geometry.positions)
      })
    } catch (error) {
      console.error('[ExternalObjectBridge] Error adding object:', error)
      this.sendResponse('STREETS_GL_OBJECT_ADDED', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        objectId: data.id
      })
    }
  }

  /**
   * Estimate an external object's largest world-space dimension from its geometry extent and
   * scale. Used to choose a sensible camera framing distance. Falls back to a small default.
   */
  private estimateObjectWorldSize(data: ExternalObject): number {
    const positions = data.geometry?.positions
    const scale = data.scale || { x: 1, y: 1, z: 1 }
    if (positions && positions.length >= 3) {
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (z < minZ) minZ = z
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        if (z > maxZ) maxZ = z
      }
      const sizeX = (maxX - minX) * Math.abs(scale.x || 1)
      const sizeY = (maxY - minY) * Math.abs(scale.y || 1)
      const sizeZ = (maxZ - minZ) * Math.abs(scale.z || 1)
      const maxSize = Math.max(sizeX, sizeY, sizeZ)
      if (Number.isFinite(maxSize) && maxSize > 0) {
        return maxSize
      }
    }
    // No geometry (e.g. container/marker) - use scale as a rough proxy.
    const scaleMax = Math.max(Math.abs(scale.x || 1), Math.abs(scale.y || 1), Math.abs(scale.z || 1))
    return Number.isFinite(scaleMax) && scaleMax > 0 ? scaleMax : 1
  }

  /**
   * Resolve the world Y for an object by sampling the terrain height at (x, z) and adding the
   * requested height offset. Falls back to the offset above ground=0 when terrain data isn't
   * available yet. This avoids brittle magic-number altitude thresholds.
   */
  private resolveGroundedHeight(x: number, z: number, heightOffset: number): number {
    let terrainHeight: number | null | undefined = null
    try {
      const terrainSystem = this.systemManager?.getSystem(TerrainSystem)
      terrainHeight = terrainSystem?.terrainHeightProvider?.getHeightGlobalInterpolated?.(x, z, true)
    } catch (e) {
      terrainHeight = null
    }

    if (terrainHeight != null && Number.isFinite(terrainHeight)) {
      return terrainHeight + heightOffset
    }

    return heightOffset
  }

  /**
   * Allocate a unique G-buffer picking id for an external object and register it with the
   * PickingSystem so clicks/hovers on the object resolve to its external id (and never go through
   * the native tile/building decode path).
   */
  private allocatePickingId(externalId: string): number {
    const pickingId = this.nextPickingId++

    try {
      const pickingSystem = this.systemManager?.getSystem(PickingSystem)
      if (pickingSystem) {
        this.wirePickingSelection(pickingSystem)
        pickingSystem.registerExternalObject(pickingId, externalId)
      }
    } catch (e) {
      console.warn('[ExternalObjectBridge] Failed to register external picking id:', e)
    }

    return pickingId
  }

  /**
   * Wire a one-time callback so the PickingSystem notifies the parent window when an external
   * object is selected (or selection is cleared).
   */
  private wirePickingSelection(pickingSystem: PickingSystem): void {
    if (this.pickingSelectionWired) {
      return
    }
    this.pickingSelectionWired = true
    pickingSystem.onExternalObjectSelected = (externalId: string | null) => {
      this.sendResponse('STREETS_GL_OBJECT_SELECTED', {
        success: true,
        objectId: externalId
      })
    }
  }

  private handleUpdateObject(data: Partial<ExternalObject> & { id: string }): void {
    if (!data.id) {
      console.warn('[ExternalObjectBridge] Update request missing object ID')
      return
    }

    const object = this.externalObjects.get(data.id)
    if (!object) {
      console.warn('[ExternalObjectBridge] Object not found:', data.id)
      this.sendResponse('STREETS_GL_OBJECT_UPDATED', {
        success: false,
        error: 'Object not found',
        objectId: data.id
      })
      return
    }

    try {
      const oldPosition = { x: object.position.x, y: object.position.y, z: object.position.z }
      
      if (data.position) {
        object.position.x = data.position.x
        object.position.y = data.position.y
        object.position.z = data.position.z
      }

      if (data.rotation) {
        object.rotation.x = data.rotation.x
        object.rotation.y = data.rotation.y
        object.rotation.z = data.rotation.z
      }

      if (data.scale) {
        object.scale.x = data.scale.x
        object.scale.y = data.scale.y
        object.scale.z = data.scale.z
      }

      if (data.visible !== undefined) {
        ;(object as any).visible = data.visible
      }

      // Force matrix update to ensure position/rotation/scale changes are reflected
      // Must call updateMatrix() first to rebuild local matrix from position/rotation/scale
      object.updateMatrix()
      // Then update world matrix (which includes parent transforms)
      object.updateMatrixWorld()
      
      // Verify the position was actually updated
      const actualNewPosition = { x: object.position.x, y: object.position.y, z: object.position.z }
      
      // Extract world position from matrixWorld to verify it's correct
      const worldPosFromMatrix = object.matrixWorld ? {
        x: object.matrixWorld.values[12],
        y: object.matrixWorld.values[13],
        z: object.matrixWorld.values[14]
      } : null
      this.debugLog('[ExternalObjectBridge] ✅ Object updated:', {
        id: data.id,
        oldPosition: { x: oldPosition.x.toFixed(3), y: oldPosition.y.toFixed(3), z: oldPosition.z.toFixed(3) },
        requestedPosition: data.position ? { x: data.position.x.toFixed(3), y: data.position.y.toFixed(3), z: data.position.z.toFixed(3) } : 'none',
        actualNewPosition: { x: actualNewPosition.x.toFixed(3), y: actualNewPosition.y.toFixed(3), z: actualNewPosition.z.toFixed(3) },
        worldPosFromMatrix: worldPosFromMatrix ? { x: worldPosFromMatrix.x.toFixed(3), y: worldPosFromMatrix.y.toFixed(3), z: worldPosFromMatrix.z.toFixed(3) } : 'no matrix',
        hasRotation: !!data.rotation,
        hasScale: !!data.scale,
        scale: data.scale ? { x: data.scale.x.toFixed(3), y: data.scale.y.toFixed(3), z: data.scale.z.toFixed(3) } : 'none',
        hasMatrixWorld: !!object.matrixWorld
      })

      this.sendResponse('STREETS_GL_OBJECT_UPDATED', {
        success: true,
        objectId: data.id
      })
    } catch (error) {
      console.error('[ExternalObjectBridge] Error updating object:', error)
      this.sendResponse('STREETS_GL_OBJECT_UPDATED', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        objectId: data.id
      })
    }
  }

  private handleRemoveObject(data: { id: string }): void {
    const object = this.externalObjects.get(data.id)
    if (!object) {
      console.warn('[ExternalObjectBridge] Object not found for removal:', data.id)
      return
    }

    try {
      if (object.parent) {
        object.parent.remove(object)
      }
      this.externalObjects.delete(data.id)

      const pickingId = (object as any).pickingId
      if (typeof pickingId === 'number') {
        try {
          this.systemManager?.getSystem(PickingSystem)?.unregisterExternalObject(pickingId)
        } catch (e) {
          // PickingSystem may not be available; ignore
        }
      }

      // If no external objects remain, allow the next add to re-center the camera.
      if (this.externalObjects.size === 0) {
        this.hasCenteredOnExternalObject = false
      }

      this.sendResponse('STREETS_GL_OBJECT_REMOVED', {
        success: true,
        objectId: data.id
      })
    } catch (error) {
      console.error('[ExternalObjectBridge] Error removing object:', error)
      this.sendResponse('STREETS_GL_OBJECT_REMOVED', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        objectId: data.id
      })
    }
  }

  private handleGetObjects(): void {
    const objects = Array.from(this.externalObjects.entries()).map(([id, obj]) => ({
      id,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      visible: (obj as any).visible !== false,
      type: (obj as any).externalType || 'unknown',
      metadata: (obj as any).externalMetadata || {}
    }))

    this.sendResponse('STREETS_GL_OBJECTS_LIST', {
      success: true,
      objects
    })
  }

  private handleNavigateTo(payload: {
    lat: number
    lon: number
    pitch?: number
    yaw?: number
    distance?: number
  }): void {
    if (!this.systemManager) {
      console.warn('[ExternalObjectBridge] SystemManager not available for navigation')
      return
    }
    if (typeof payload?.lat !== 'number' || typeof payload?.lon !== 'number') {
      console.warn('[ExternalObjectBridge] Invalid navigate payload:', payload)
      return
    }

    const pitch = payload.pitch ?? 45
    const yaw = payload.yaw ?? 0
    const distance = payload.distance ?? 120

    const attemptNavigate = (retriesLeft: number) => {
      try {
        const controlsSystem = this.systemManager!.getSystem(ControlsSystem)
        if (!controlsSystem) {
          if (retriesLeft > 0) {
            setTimeout(() => attemptNavigate(retriesLeft - 1), 50)
          } else {
            console.warn('[ExternalObjectBridge] ControlsSystem not available for navigation')
          }
          return
        }

        controlsSystem.setState(payload.lat, payload.lon, pitch, yaw, distance)

        this.debugLog('[ExternalObjectBridge] 📍 Navigated camera to:', {
          lat: payload.lat,
          lon: payload.lon,
          pitch,
          yaw,
          distance,
          retriesLeft
        })
      } catch (e) {
        if (retriesLeft > 0) {
          setTimeout(() => attemptNavigate(retriesLeft - 1), 50)
        } else {
          console.warn('[ExternalObjectBridge] Failed to navigate camera:', e)
        }
      }
    }

    attemptNavigate(40)
  }

  private handleSyncObjects(objects: ExternalObject[]): void {
    // Sync multiple objects at once (useful for bulk updates)
    const results = objects.map(obj => {
      if (this.externalObjects.has(obj.id)) {
        this.handleUpdateObject(obj)
        return { id: obj.id, success: true }
      } else {
        this.handleAddObject(obj)
        return { id: obj.id, success: true }
      }
    })

    this.sendResponse('STREETS_GL_OBJECTS_SYNCED', {
      success: true,
      results
    })
  }

  private handleGetCameraPosition(): void {
    try {
      if (!this.sceneSystem || !this.sceneSystem.objects || !this.sceneSystem.objects.camera) {
        const error = 'Camera not available'
        console.error('[ExternalObjectBridge] ❌ Camera not available', {
          hasSceneSystem: !!this.sceneSystem,
          hasObjects: !!this.sceneSystem?.objects,
          hasCamera: !!this.sceneSystem?.objects?.camera
        })
        this.sendResponse('STREETS_GL_CAMERA_POSITION', {
          success: false,
          error
        })
        return
      }

      const camera = this.sceneSystem.objects.camera
      
      // Get camera position
      const cameraPos = camera.position
      
      // Try to get the actual camera target from ControlsSystem (most accurate)
      // GroundControlsNavigator has a 'target' property that is the point the camera is looking at
      let groundTarget: Vec3 | null = null
      
      try {
        const controlsSystem = this.systemManager?.getSystem(ControlsSystem)
        if (controlsSystem && controlsSystem.groundNavigator && controlsSystem.groundNavigator.target) {
          // Use the actual camera target from GroundControlsNavigator
          groundTarget = controlsSystem.groundNavigator.target
          this.debugLog('[ExternalObjectBridge] Using camera target from GroundControlsNavigator:', {
            target: { x: groundTarget.x, y: groundTarget.y, z: groundTarget.z }
          })
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[ExternalObjectBridge] ❌ Error getting target from ControlsSystem:', error, e)
      }
    
    // Fallback: Calculate ground intersection from camera forward direction
    if (!groundTarget) {
      // Calculate camera forward direction from view matrix
      // The forward direction is the negative Z axis in view space
      // We can extract it from the camera's matrixWorldInverse
      const forward = new Vec3(
        -camera.matrixWorldInverse.values[2],  // Forward X
        -camera.matrixWorldInverse.values[6],  // Forward Y
        -camera.matrixWorldInverse.values[10]  // Forward Z
      ).normalize()
      
      // Calculate intersection of camera ray with ground plane (y = 0)
      // Ray equation: P = cameraPos + t * forward
      // Ground plane: y = 0
      // Solve for t: cameraPos.y + t * forward.y = 0
      // t = -cameraPos.y / forward.y
      
      if (Math.abs(forward.y) > 0.001) {
        // Camera is not looking horizontally - can intersect ground
        const t = -cameraPos.y / forward.y
        
        if (t > 0) {
          // Intersection is in front of camera
          groundTarget = new Vec3(
            cameraPos.x + forward.x * t,
            0, // Ground level
            cameraPos.z + forward.z * t
          )
        } else {
          // Camera is looking up or intersection is behind - use a point far ahead at ground level
          const farDistance = 1000 // 1km ahead
          groundTarget = new Vec3(
            cameraPos.x + forward.x * farDistance,
            0,
            cameraPos.z + forward.z * farDistance
          )
        }
      } else {
        // Camera is looking horizontally - use a point far ahead at ground level
        const farDistance = 1000 // 1km ahead
        groundTarget = new Vec3(
          cameraPos.x + forward.x * farDistance,
          0,
          cameraPos.z + forward.z * farDistance
        )
      }
      
      this.debugLog('[ExternalObjectBridge] Calculated ground target from camera forward:', {
        cameraPosition: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
        forward: { x: forward.x, y: forward.y, z: forward.z },
        groundTarget: { x: groundTarget.x, y: groundTarget.y, z: groundTarget.z }
      })
    }
    
      this.debugLog('[ExternalObjectBridge] Camera position and ground target:', {
        cameraPosition: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
        groundTarget: { x: groundTarget.x, y: groundTarget.y, z: groundTarget.z }
      })
      
      this.sendResponse('STREETS_GL_CAMERA_POSITION', {
        success: true,
        cameraPosition: {
          x: cameraPos.x,
          y: cameraPos.y,
          z: cameraPos.z
        },
        cameraTarget: {
          x: groundTarget.x,
          y: groundTarget.y,
          z: groundTarget.z
        }
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ExternalObjectBridge] ❌ Error in handleGetCameraPosition:', errorMsg, error)
      this.sendResponse('STREETS_GL_CAMERA_POSITION', {
        success: false,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      })
    }
  }

  private handleGetSelectedBuilding(): void {
    try {
      const pickingSystem = this.systemManager?.getSystem(PickingSystem)
      if (!pickingSystem || !pickingSystem.selectedTileBuilding) {
        this.sendResponse('STREETS_GL_SELECTED_BUILDING', {
          success: false,
          error: 'No building selected'
        })
        return
      }

      const selectedBuilding = pickingSystem.selectedTileBuilding
      const buildingTile = selectedBuilding.holder
      
      if (!buildingTile) {
        this.sendResponse('STREETS_GL_SELECTED_BUILDING', {
          success: false,
          error: 'Building tile not available'
        })
        return
      }

      // Get building's local ID in the tile
      const buildingLocalId = buildingTile.buildingPackedToLocalMap.get(selectedBuilding.id)
      
      if (buildingLocalId === undefined) {
        this.sendResponse('STREETS_GL_SELECTED_BUILDING', {
          success: false,
          error: 'Building local ID not found'
        })
        return
      }

      // Get building position from tile
      const tilePosition = buildingTile.position
      
      // Get building bounding box from the extruded mesh
      let buildingBounds = null
      let buildingHeight = 25.0 // Default estimate
      let buildingWidth = 20.0 // Default estimate
      let buildingDepth = 20.0 // Default estimate
      
      if (buildingTile.extrudedMesh && buildingTile.extrudedMesh.boundingBox) {
        const bbox = buildingTile.extrudedMesh.boundingBox
        // AABB3D has min and max Vec3 properties
        buildingHeight = bbox.max.y - bbox.min.y
        buildingWidth = bbox.max.x - bbox.min.x
        buildingDepth = bbox.max.z - bbox.min.z
        
        // Calculate building center position (relative to tile)
        const buildingCenterX = (bbox.min.x + bbox.max.x) / 2
        const buildingCenterZ = (bbox.min.z + bbox.max.z) / 2
        const buildingBaseY = bbox.min.y
        
        buildingBounds = {
          min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
          max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
          center: { x: buildingCenterX, y: buildingBaseY + buildingHeight / 2, z: buildingCenterZ },
          size: { width: buildingWidth, height: buildingHeight, depth: buildingDepth }
        }
      }
      
      // Position for the duplicate (on top of the original building)
      // If we have bounds, use the building's actual center; otherwise use tile center
      const buildingPosition = buildingBounds 
        ? {
            x: tilePosition.x + buildingBounds.center.x,
            y: buildingBounds.max.y + buildingHeight / 2, // Center of duplicate at top of original + half its height
            z: tilePosition.z + buildingBounds.center.z
          }
        : {
            x: tilePosition.x,
            y: buildingHeight * 1.5, // Place duplicate on top (original height + duplicate half height)
            z: tilePosition.z
          }

      this.debugLog('[ExternalObjectBridge] Selected building info:', {
        buildingId: selectedBuilding.id,
        buildingLocalId,
        tilePosition,
        buildingPosition,
        buildingBounds,
        buildingHeight,
        buildingWidth,
        buildingDepth
      })

      this.sendResponse('STREETS_GL_SELECTED_BUILDING', {
        success: true,
        buildingId: selectedBuilding.id,
        position: buildingPosition,
        tilePosition: {
          x: tilePosition.x,
          y: tilePosition.y,
          z: tilePosition.z
        },
        estimatedHeight: buildingHeight,
        buildingBounds: buildingBounds ? {
          min: buildingBounds.min,
          max: buildingBounds.max,
          center: buildingBounds.center,
          size: buildingBounds.size
        } : null,
        buildingSize: {
          width: buildingWidth,
          height: buildingHeight,
          depth: buildingDepth
        }
      })
    } catch (error) {
      console.error('[ExternalObjectBridge] Error getting selected building:', error)
      this.sendResponse('STREETS_GL_SELECTED_BUILDING', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private handleSetShadowQuality(payload: { quality: 'low' | 'medium' | 'high' }): void {
    if (!this.settingsSystem) {
      this.settingsSystem = this.systemManager?.getSystem(SettingsSystem) || null
    }
    
    if (this.settingsSystem && this.settingsSystem.settings) {
      this.settingsSystem.settings.update('shadows', {
        statusValue: payload.quality
      })
      this.debugLog('[ExternalObjectBridge] Shadow quality set to:', payload.quality)
    }
  }

  private handleSetSunDirection(payload: { direction: { x: number; y: number; z: number } }): void {
    if (!this.sceneSystem) return
    
    const sunDir = new Vec3(payload.direction.x, payload.direction.y, payload.direction.z)
    
    // Update CSM direction (for shadows)
    const csm = this.sceneSystem.objects.csm
    if (csm) {
      csm.direction = Vec3.clone(sunDir)
      csm.update()
    }
    
    // CRITICAL: Update MapTimeSystem so atmosphere system uses the new sun direction
    // The atmosphere system uses mapTimeSystem.sunDirection, not CSM direction
    // SceneSystem.update() syncs CSM from MapTimeSystem.lightDirection, so we need to update both
    if (this.mapTimeSystem) {
      // Set MapTimeSystem to Static state so it doesn't recalculate from time/date
      // This prevents the system from overwriting our manual sun direction
      this.mapTimeSystem.setState(1) // Static state (preset 0)
      
      // Update lightDirection (used by SceneSystem.update() to sync CSM direction)
      this.mapTimeSystem.lightDirection = Vec3.clone(sunDir)
      
      // Update sunDirection (used by AtmosphereLUTPass for atmospheric scattering)
      if (!this.mapTimeSystem.sunDirection) {
        this.mapTimeSystem.sunDirection = new Vec3()
      }
      this.mapTimeSystem.sunDirection = Vec3.clone(sunDir)
      
      // Update staticLights preset so direction persists across frames
      // staticLights[0] is sun direction, staticLights[1] is moon direction
      // We need to update the private staticLights array so getTargetSunAndMoonDirection() returns our custom direction
      const staticLights = (this.mapTimeSystem as any).staticLights as [Vec3, Vec3] | undefined
      if (staticLights && Array.isArray(staticLights)) {
        staticLights[0] = Vec3.clone(sunDir)
        // Keep moon direction as is (staticLights[1])
      }
      
      this.debugLog('[ExternalObjectBridge] ✅ Sun direction set (CSM + Atmosphere + MapTimeSystem):', payload.direction)
    } else {
      this.debugLog('[ExternalObjectBridge] ⚠️ Sun direction set (CSM only, MapTimeSystem not available):', payload.direction)
    }
  }

  private handleSetSunIntensity(payload: { intensity: number }): void {
    if (!this.sceneSystem) return
    
    const csm = this.sceneSystem.objects.csm
    if (csm) {
      csm.intensity = payload.intensity
      // Note: No need to call update() - intensity is just a property
      // Uniforms are updated each frame in ShadingPass via getUniformsBuffers()
      this.debugLog('[ExternalObjectBridge] Sun intensity set to:', payload.intensity)
    }
  }

  private handleSetSunColor(payload: { color: { r: number; g: number; b: number } }): void {
    // Note: Streets GL calculates sun color from atmosphere system based on sun direction
    // The color is derived from atmospheric scattering (sunColor from transmittance LUT)
    // Direct color control would require modifying the atmosphere system
    // For now, we log the request - sun color will change naturally when sun direction changes
    // as the atmosphere system recalculates based on sun position
    this.debugLog('[ExternalObjectBridge] Sun color requested:', payload.color)
    this.debugLog('[ExternalObjectBridge] Note: Streets GL calculates sun color from atmosphere based on sun direction.')
    this.debugLog('[ExternalObjectBridge] Changing sun direction will naturally affect sun color through atmospheric scattering.')
    
    // TODO: If direct color control is needed, would need to:
    // 1. Modify atmosphere system to accept color override
    // 2. Or modify shader to multiply sunColor by a color multiplier uniform
    // For now, this is a known limitation - sun color is atmospheric, not directly controllable
  }

  private sendResponse(type: string, payload: any): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type,
        payload,
        timestamp: Date.now()
      }, '*') // In production, specify exact origin
    }
  }
}

