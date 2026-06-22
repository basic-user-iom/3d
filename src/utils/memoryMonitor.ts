/**
 * Memory Monitoring Utility
 * Tracks memory usage and provides warnings for large files
 */

export interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
  available: number
  usedMB: number
  totalMB: number
  limitMB: number
  availableMB: number
  usagePercent: number
}

export interface MemoryWarning {
  level: 'info' | 'warning' | 'error'
  message: string
  usedMB: number
  limitMB: number
}

/**
 * Get current memory usage from performance API
 */
export function getMemoryInfo(): MemoryInfo | null {
  if (!('memory' in performance)) {
    return null
  }

  const memory = (performance as any).memory
  const usedJSHeapSize = memory.usedJSHeapSize || 0
  const totalJSHeapSize = memory.totalJSHeapSize || 0
  const jsHeapSizeLimit = memory.jsHeapSizeLimit || 0

  const usedMB = usedJSHeapSize / (1024 * 1024)
  const totalMB = totalJSHeapSize / (1024 * 1024)
  const limitMB = jsHeapSizeLimit / (1024 * 1024)
  const availableMB = limitMB - usedMB
  const usagePercent = limitMB > 0 ? (usedMB / limitMB) * 100 : 0

  return {
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit,
    available: availableMB * 1024 * 1024,
    usedMB,
    totalMB,
    limitMB,
    availableMB,
    usagePercent
  }
}

/**
 * Check if memory usage is concerning
 */
export function checkMemoryWarning(): MemoryWarning | null {
  const memory = getMemoryInfo()
  if (!memory) return null

  const { usedMB, limitMB, usagePercent } = memory

  if (usagePercent >= 90) {
    return {
      level: 'error',
      message: `Critical: Memory usage is at ${usagePercent.toFixed(1)}% (${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB). Browser may crash soon.`,
      usedMB,
      limitMB
    }
  } else if (usagePercent >= 75) {
    return {
      level: 'warning',
      message: `Warning: Memory usage is high at ${usagePercent.toFixed(1)}% (${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB). Consider unloading unused objects.`,
      usedMB,
      limitMB
    }
  } else if (usagePercent >= 50) {
    return {
      level: 'info',
      message: `Memory usage: ${usagePercent.toFixed(1)}% (${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB)`,
      usedMB,
      limitMB
    }
  }

  return null
}

/**
 * Estimate memory needed for a GLB file
 * GLB files typically use 2-3x their file size in memory after parsing
 */
export function estimateGLBMemory(fileSizeMB: number): number {
  // Conservative estimate: 2.5x file size
  return fileSizeMB * 2.5
}

/**
 * Check if a file can be safely loaded based on available memory
 */
export function canLoadFile(fileSizeMB: number): { canLoad: boolean; reason?: string; estimatedMemoryMB?: number } {
  const memory = getMemoryInfo()
  if (!memory) {
    // Can't check memory, allow load but warn
    return {
      canLoad: true,
      reason: 'Memory API not available. Proceed with caution.',
      estimatedMemoryMB: estimateGLBMemory(fileSizeMB)
    }
  }

  const estimatedMemoryMB = estimateGLBMemory(fileSizeMB)
  const { availableMB, usagePercent } = memory

  if (estimatedMemoryMB > availableMB) {
    return {
      canLoad: false,
      reason: `Not enough memory. File needs ~${estimatedMemoryMB.toFixed(1)}MB but only ${availableMB.toFixed(1)}MB available. Current usage: ${usagePercent.toFixed(1)}%`,
      estimatedMemoryMB
    }
  }

  if (usagePercent > 80 && estimatedMemoryMB > availableMB * 0.5) {
    return {
      canLoad: true,
      reason: `Warning: Memory usage is high (${usagePercent.toFixed(1)}%). Loading this file may cause issues.`,
      estimatedMemoryMB
    }
  }

  return {
    canLoad: true,
    estimatedMemoryMB
  }
}

/**
 * Monitor memory usage over time
 */
export class MemoryMonitor {
  private intervalId: number | null = null
  private callbacks: Array<(info: MemoryInfo | null, warning: MemoryWarning | null) => void> = []
  private lastWarning: MemoryWarning | null = null
  private warningCooldown = 5000 // 5 seconds between warnings

  /**
   * Start monitoring memory usage
   */
  start(intervalMs: number = 2000): void {
    if (this.intervalId !== null) {
      this.stop()
    }

    this.intervalId = window.setInterval(() => {
      const memory = getMemoryInfo()
      const warning = checkMemoryWarning()

      // Only trigger callbacks if warning level changed or new warning
      if (warning && (!this.lastWarning || warning.level !== this.lastWarning.level)) {
        this.callbacks.forEach(cb => cb(memory, warning))
        this.lastWarning = warning
      } else if (!warning && this.lastWarning) {
        // Warning cleared
        this.callbacks.forEach(cb => cb(memory, null))
        this.lastWarning = null
      }
    }, intervalMs)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Subscribe to memory warnings
   */
  onWarning(callback: (info: MemoryInfo | null, warning: MemoryWarning | null) => void): () => void {
    this.callbacks.push(callback)
    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) {
        this.callbacks.splice(index, 1)
      }
    }
  }

  /**
   * Get current memory info
   */
  getCurrentMemory(): MemoryInfo | null {
    return getMemoryInfo()
  }
}

// Singleton instance
let memoryMonitorInstance: MemoryMonitor | null = null

/**
 * Get or create memory monitor singleton
 */
export function getMemoryMonitor(): MemoryMonitor {
  if (!memoryMonitorInstance) {
    memoryMonitorInstance = new MemoryMonitor()
  }
  return memoryMonitorInstance
}








































