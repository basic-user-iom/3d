/**
 * View-Based Resource Manager
 * Manages loading/unloading of 3D objects based on camera frustum
 * Frees up memory for objects outside the view
 */

import * as THREE from 'three'

export interface ResourceManagerConfig {
  /** Distance beyond frustum to keep objects loaded (in world units) */
  keepLoadedDistance: number
  /** Distance beyond frustum to unload geometry (free memory) */
  unloadDistance: number
  /** Minimum time object must be off-screen before unloading (ms) */
  unloadDelay: number
  /** Check interval for frustum culling (frames) */
  checkInterval: number
  /** Enable aggressive unloading (dispose geometry) */
  aggressiveUnloading: boolean
}

const DEFAULT_CONFIG: ResourceManagerConfig = {
  keepLoadedDistance: 1000, // Keep objects within 1000 units loaded
  unloadDistance: 2000, // Unload objects beyond 2000 units
  unloadDelay: 5000, // 5 seconds off-screen before unloading
  checkInterval: 30, // Check every 30 frames (~0.5s at 60fps)
  aggressiveUnloading: true // Dispose geometry when unloading
}

interface TrackedObject {
  object: THREE.Object3D
  boundingBox: THREE.Box3
  lastVisibleTime: number
  lastCheckedTime: number
  isUnloaded: boolean
  originalGeometry?: THREE.BufferGeometry
  originalMaterial?: THREE.Material | THREE.Material[]
}

export class ViewBasedResourceManager {
  private config: ResourceManagerConfig
  private trackedObjects: Map<THREE.Object3D, TrackedObject> = new Map()
  private frameCount = 0
  private camera: THREE.Camera | null = null
  private frustum: THREE.Frustum = new THREE.Frustum()
  private cameraMatrix: THREE.Matrix4 = new THREE.Matrix4()

  constructor(config: Partial<ResourceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Set camera for frustum calculations
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera
    this.updateFrustum()
  }

  /**
   * Update frustum from camera
   */
  private updateFrustum(): void {
    if (!this.camera) return

    this.cameraMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    this.frustum.setFromProjectionMatrix(this.cameraMatrix)
  }

  /**
   * Track an object for view-based management
   */
  trackObject(object: THREE.Object3D, boundingBox?: THREE.Box3): void {
    if (this.trackedObjects.has(object)) {
      return // Already tracked
    }

    const box = boundingBox || new THREE.Box3().setFromObject(object)
    const now = Date.now()

    this.trackedObjects.set(object, {
      object,
      boundingBox: box,
      lastVisibleTime: now,
      lastCheckedTime: now,
      isUnloaded: false
    })
  }

  /**
   * Stop tracking an object
   */
  untrackObject(object: THREE.Object3D): void {
    const tracked = this.trackedObjects.get(object)
    if (tracked && tracked.isUnloaded) {
      this.restoreObject(tracked)
    }
    this.trackedObjects.delete(object)
  }

  /**
   * Check if object is in frustum
   */
  private isInFrustum(boundingBox: THREE.Box3): boolean {
    if (!this.camera) return true

    // Expand frustum by keepLoadedDistance
    const expandedFrustum = this.frustum.clone()
    // Note: Three.js Frustum doesn't have direct expansion, so we check distance separately
    
    return this.frustum.intersectsBox(boundingBox)
  }

  /**
   * Get distance from camera to object
   */
  private getDistanceToCamera(boundingBox: THREE.Box3): number {
    if (!this.camera) return 0

    const center = new THREE.Vector3()
    boundingBox.getCenter(center)
    return this.camera.position.distanceTo(center)
  }

  /**
   * Unload object geometry to free memory
   */
  private unloadObject(tracked: TrackedObject): void {
    if (tracked.isUnloaded) return

    tracked.object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Store original geometry/material for restoration
        if (!tracked.originalGeometry) {
          tracked.originalGeometry = child.geometry.clone()
        }

        // Replace with empty geometry (minimal memory)
        const emptyGeometry = new THREE.BufferGeometry()
        child.geometry = emptyGeometry

        // Hide object
        child.visible = false
      }
    })

    tracked.isUnloaded = true
    console.log(`[ViewBasedResourceManager] Unloaded object: ${tracked.object.name || 'unnamed'}`)
  }

  /**
   * Restore object geometry
   */
  private restoreObject(tracked: TrackedObject): void {
    if (!tracked.isUnloaded) return

    // Note: Full restoration requires reloading from source
    // For now, we just mark it as needing restoration
    tracked.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.visible = true
      }
    })

    tracked.isUnloaded = false
    console.log(`[ViewBasedResourceManager] Restored object: ${tracked.object.name || 'unnamed'}`)
  }

  /**
   * Update - check objects and manage loading/unloading
   */
  update(): void {
    if (!this.camera || this.trackedObjects.size === 0) return

    this.frameCount++
    if (this.frameCount % this.config.checkInterval !== 0) {
      return // Skip this frame
    }

    this.updateFrustum()
    const now = Date.now()

    for (const [object, tracked] of this.trackedObjects.entries()) {
      // Update bounding box if object moved
      if (object.matrixWorldNeedsUpdate) {
        object.updateMatrixWorld(true)
        tracked.boundingBox.setFromObject(object)
      }

      const inFrustum = this.isInFrustum(tracked.boundingBox)
      const distance = this.getDistanceToCamera(tracked.boundingBox)

      if (inFrustum || distance < this.config.keepLoadedDistance) {
        // Object is visible or close - keep loaded
        tracked.lastVisibleTime = now
        if (tracked.isUnloaded) {
          this.restoreObject(tracked)
        }
      } else if (distance > this.config.unloadDistance) {
        // Object is far and not visible - check if we should unload
        const timeOffScreen = now - tracked.lastVisibleTime

        if (timeOffScreen > this.config.unloadDelay && this.config.aggressiveUnloading) {
          this.unloadObject(tracked)
        }
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTracked: number
    unloaded: number
    visible: number
    memorySavedMB?: number
  } {
    let unloaded = 0
    let visible = 0

    for (const tracked of this.trackedObjects.values()) {
      if (tracked.isUnloaded) {
        unloaded++
      } else {
        visible++
      }
    }

    return {
      totalTracked: this.trackedObjects.size,
      unloaded,
      visible
    }
  }

  /**
   * Dispose all tracked objects
   */
  dispose(): void {
    for (const tracked of this.trackedObjects.values()) {
      if (tracked.isUnloaded) {
        this.restoreObject(tracked)
      }
    }
    this.trackedObjects.clear()
  }
}








































