/**
 * UnifiedAnimationLoop - Single animation loop for all systems
 * 
 * Replaces multiple competing animation loops with a single coordinated loop.
 * This improves performance and prevents conflicts between different systems.
 */

export type AnimationCallback = (delta: number, time: number) => void

export class UnifiedAnimationLoop {
  private rafId: number | null = null
  private subscribers = new Set<AnimationCallback>()
  private lastTime = 0
  private isRunning = false
  private isDisposed = false

  /**
   * Subscribe to the animation loop
   * @param callback Function to call each frame with (delta, time)
   * @returns Unsubscribe function
   */
  subscribe(callback: AnimationCallback): () => void {
    if (this.isDisposed) {
      console.warn('[UnifiedAnimationLoop] Loop is disposed, ignoring subscription')
      return () => {}
    }

    this.subscribers.add(callback)
    
    if (!this.isRunning) {
      this.start()
    }
    
    return () => this.unsubscribe(callback)
  }

  /**
   * Unsubscribe from the animation loop
   */
  unsubscribe(callback: AnimationCallback): void {
    this.subscribers.delete(callback)
    
    if (this.subscribers.size === 0) {
      this.stop()
    }
  }

  /**
   * Start the animation loop
   */
  private start(): void {
    if (this.isDisposed || this.isRunning) {
      return
    }

    this.isRunning = true
    this.lastTime = performance.now()
    this.tick()
  }

  /**
   * Stop the animation loop
   */
  private stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.isRunning = false
  }

  /**
   * Animation tick function
   */
  private tick = (currentTime: number = performance.now()): void => {
    if (this.isDisposed) {
      return
    }

    const delta = Math.min((currentTime - this.lastTime) / 1000, 0.05) // Cap at 50ms
    this.lastTime = currentTime

    // Execute all subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(delta, currentTime)
      } catch (error) {
        console.error('[UnifiedAnimationLoop] Subscriber error:', error)
      }
    })

    if (this.isRunning && !this.isDisposed) {
      this.rafId = requestAnimationFrame(this.tick)
    }
  }

  /**
   * Get the number of active subscribers
   */
  getSubscriberCount(): number {
    return this.subscribers.size
  }

  /**
   * Check if the loop is running
   */
  isActive(): boolean {
    return this.isRunning && !this.isDisposed
  }

  /**
   * Dispose of the animation loop
   */
  dispose(): void {
    this.isDisposed = true
    this.stop()
    this.subscribers.clear()
  }
}

// Singleton instance for global use
export const unifiedAnimationLoop = new UnifiedAnimationLoop()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    unifiedAnimationLoop.dispose()
  })
}


















