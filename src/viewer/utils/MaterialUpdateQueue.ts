/**
 * MaterialUpdateQueue - Prevents race conditions when multiple systems update materials
 * 
 * This queue batches material updates and processes them in a single frame,
 * ensuring that the last update wins and preventing conflicts between systems.
 */

import * as THREE from 'three'

export class MaterialUpdateQueue {
  private queue: Map<THREE.Material, Set<() => void>> = new Map()
  private rafId: number | null = null
  private isProcessing = false
  private isDisposed = false

  /**
   * Enqueue a material update to be processed in the next frame
   * @param material The material to update
   * @param updateFn Function that performs the update
   */
  enqueue(material: THREE.Material, updateFn: () => void): void {
    if (this.isDisposed) {
      console.warn('[MaterialUpdateQueue] Queue is disposed, ignoring update')
      return
    }

    if (!this.queue.has(material)) {
      this.queue.set(material, new Set())
    }
    this.queue.get(material)!.add(updateFn)
    this.schedule()
  }

  /**
   * Schedule processing of queued updates
   */
  private schedule(): void {
    if (this.rafId === null && !this.isProcessing && !this.isDisposed) {
      this.rafId = requestAnimationFrame(() => this.process())
    }
  }

  /**
   * Process all queued material updates
   */
  private process(): void {
    if (this.isDisposed) {
      return
    }

    this.isProcessing = true
    this.rafId = null

    // Process all queued updates
    this.queue.forEach((updates, material) => {
      // Execute all updates for this material
      updates.forEach(updateFn => {
        try {
          updateFn()
        } catch (error) {
          console.error('[MaterialUpdateQueue] Error updating material:', error)
        }
      })
      updates.clear()
      
      // Mark material as needing update
      material.needsUpdate = true
    })

    this.queue.clear()
    this.isProcessing = false
  }

  /**
   * Force immediate processing of all queued updates
   * Use sparingly - normally updates are batched per frame
   */
  flush(): void {
    if (this.isDisposed) {
      return
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    this.process()
  }

  /**
   * Clear all pending updates without processing them
   */
  clear(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.queue.clear()
    this.isProcessing = false
  }

  /**
   * Dispose of the queue and cancel any pending updates
   */
  dispose(): void {
    this.isDisposed = true
    this.clear()
  }

  /**
   * Get the number of pending updates
   */
  getPendingCount(): number {
    let count = 0
    this.queue.forEach(updates => {
      count += updates.size
    })
    return count
  }
}

// Singleton instance for global use
export const materialUpdateQueue = new MaterialUpdateQueue()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    materialUpdateQueue.dispose()
  })
}


























