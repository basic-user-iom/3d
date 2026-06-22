/**
 * MaterialUpdateBatcher - Batches and debounces material updates for performance
 * 
 * This class batches material property updates and applies them together,
 * reducing the number of material.needsUpdate calls and improving performance.
 */

import * as THREE from 'three'

export class MaterialUpdateBatcher {
  private pendingUpdates = new Map<THREE.Material, Map<string, any>>()
  private flushTimeout: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number

  constructor(debounceMs: number = 16) { // ~1 frame at 60fps
    this.debounceMs = debounceMs
  }

  /**
   * Queue a material property update
   * @param material The material to update
   * @param property Property name to update
   * @param value New value for the property
   */
  queueUpdate(material: THREE.Material, property: string, value: any): void {
    if (!this.pendingUpdates.has(material)) {
      this.pendingUpdates.set(material, new Map())
    }
    this.pendingUpdates.get(material)!.set(property, value)
    this.scheduleFlush()
  }

  /**
   * Queue multiple property updates for a material
   */
  queueUpdates(material: THREE.Material, updates: Record<string, any>): void {
    if (!this.pendingUpdates.has(material)) {
      this.pendingUpdates.set(material, new Map())
    }
    const materialUpdates = this.pendingUpdates.get(material)!
    Object.entries(updates).forEach(([property, value]) => {
      materialUpdates.set(property, value)
    })
    this.scheduleFlush()
  }

  /**
   * Schedule a flush of pending updates
   */
  private scheduleFlush(): void {
    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => {
        this.flush()
      }, this.debounceMs)
    }
  }

  /**
   * Immediately flush all pending updates
   */
  flush(): void {
    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout)
      this.flushTimeout = null
    }

    this.pendingUpdates.forEach((updates, material) => {
      updates.forEach((value, property) => {
        try {
          ;(material as any)[property] = value
        } catch (error) {
          console.error(`[MaterialUpdateBatcher] Error setting ${property}:`, error)
        }
      })
      material.needsUpdate = true
      updates.clear()
    })
    this.pendingUpdates.clear()
  }

  /**
   * Clear all pending updates without applying them
   */
  clear(): void {
    if (this.flushTimeout !== null) {
      clearTimeout(this.flushTimeout)
      this.flushTimeout = null
    }
    this.pendingUpdates.clear()
  }

  /**
   * Dispose of the batcher
   */
  dispose(): void {
    this.clear()
  }

  /**
   * Get the number of pending updates
   */
  getPendingCount(): number {
    let count = 0
    this.pendingUpdates.forEach(updates => {
      count += updates.size
    })
    return count
  }
}

// Singleton instance for global use
export const materialUpdateBatcher = new MaterialUpdateBatcher()


























