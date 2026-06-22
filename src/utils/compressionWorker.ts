/**
 * Web Worker for parallel compression operations
 * Uses multi-threading to compress large files without blocking UI
 */

import pako from 'pako'

export interface CompressionWorkerMessage {
  type: 'compress' | 'decompress'
  data: Uint8Array
  level?: number
  id: string
}

export interface CompressionWorkerResponse {
  type: 'compress' | 'decompress'
  data: Uint8Array
  id: string
  error?: string
}

/**
 * Create a Web Worker for compression
 */
export function createCompressionWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    console.warn('[CompressionWorker] Web Workers not supported')
    return null
  }

  // Inline worker code - use pako from node_modules via importScripts
  // Note: In production, you may need to configure Vite to bundle pako for workers
  const workerCode = `
    // Try to load pako from CDN (fallback if importScripts with local path doesn't work)
    try {
      importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
    } catch (e) {
      console.error('Failed to load pako in worker:', e);
    }
    
    self.onmessage = function(e) {
      const { type, data, level = 6, id } = e.data;
      
      try {
        if (typeof pako === 'undefined') {
          throw new Error('pako library not loaded in worker');
        }
        
        if (type === 'compress') {
          // Compress using pako
          const compressed = pako.gzip(data, { level: level });
          self.postMessage({
            type: 'compress',
            data: compressed,
            id: id
          }, [compressed.buffer]); // Transfer ownership for performance
        } else if (type === 'decompress') {
          // Decompress using pako
          const decompressed = pako.ungzip(data);
          self.postMessage({
            type: 'decompress',
            data: decompressed,
            id: id
          }, [decompressed.buffer]); // Transfer ownership for performance
        }
      } catch (error) {
        self.postMessage({
          type: type,
          id: id,
          error: error.message || String(error)
        });
      }
    };
  `

  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)

    // Clean up URL after worker is ready
    worker.addEventListener('message', () => {
      // Worker is ready
    }, { once: true })

    return worker
  } catch (error) {
    console.error('[CompressionWorker] Failed to create worker:', error)
    return null
  }
}

/**
 * Compress data in a Web Worker (multi-threaded)
 */
export async function compressInWorker(
  data: Uint8Array | string,
  level: number = 6,
  worker?: Worker | null
): Promise<Uint8Array> {
  // Convert string to Uint8Array if needed
  const inputData = typeof data === 'string' 
    ? new TextEncoder().encode(data)
    : data

  // If no worker provided, try to create one
  if (!worker) {
    worker = createCompressionWorker()
  }

  // If worker creation failed, fall back to main thread
  if (!worker) {
    return compressMainThread(inputData, level)
  }

  return new Promise((resolve, reject) => {
    const id = `compress-${Date.now()}-${Math.random()}`
    let resolved = false

    const handler = (e: MessageEvent<CompressionWorkerResponse>) => {
      if (e.data.id === id && !resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)

        if (e.data.error) {
          reject(new Error(e.data.error))
        } else {
          resolve(e.data.data)
        }
      }
    }

    worker!.addEventListener('message', handler)

    // Set timeout for worker operations
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)
        // Fallback to main thread if worker times out
        console.warn('[CompressionWorker] Worker timeout, falling back to main thread')
        resolve(compressMainThread(inputData, level))
      }
    }, 60000) // 60 second timeout

    try {
      worker!.postMessage({
        type: 'compress',
        data: inputData,
        level: level,
        id: id
      } as CompressionWorkerMessage)
    } catch (error) {
      if (!resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)
        // Fallback to main thread
        console.warn('[CompressionWorker] Worker error, falling back to main thread:', error)
        resolve(compressMainThread(inputData, level))
      }
    }
  })
}

/**
 * Decompress data in a Web Worker (multi-threaded)
 */
export async function decompressInWorker(
  data: Uint8Array,
  worker?: Worker | null
): Promise<Uint8Array> {
  // If no worker provided, try to create one
  if (!worker) {
    worker = createCompressionWorker()
  }

  // If worker creation failed, fall back to main thread
  if (!worker) {
    return decompressMainThread(data)
  }

  return new Promise((resolve, reject) => {
    const id = `decompress-${Date.now()}-${Math.random()}`
    let resolved = false

    const handler = (e: MessageEvent<CompressionWorkerResponse>) => {
      if (e.data.id === id && !resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)

        if (e.data.error) {
          reject(new Error(e.data.error))
        } else {
          resolve(e.data.data)
        }
      }
    }

    worker!.addEventListener('message', handler)

    // Set timeout for worker operations
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)
        // Fallback to main thread if worker times out
        console.warn('[CompressionWorker] Worker timeout, falling back to main thread')
        resolve(decompressMainThread(data))
      }
    }, 60000) // 60 second timeout

    try {
      worker!.postMessage({
        type: 'decompress',
        data: data,
        id: id
      } as CompressionWorkerMessage)
    } catch (error) {
      if (!resolved) {
        resolved = true
        worker!.removeEventListener('message', handler)
        // Fallback to main thread
        console.warn('[CompressionWorker] Worker error, falling back to main thread:', error)
        resolve(decompressMainThread(data))
      }
    }
  })
}

/**
 * Fallback: Compress on main thread (synchronous)
 */
function compressMainThread(data: Uint8Array, level: number = 6): Uint8Array {
  // Use pako directly (already imported)
  return pako.gzip(data, { level: level })
}

/**
 * Fallback: Decompress on main thread (synchronous)
 */
function decompressMainThread(data: Uint8Array): Uint8Array {
  // Use pako directly (already imported)
  return pako.ungzip(data)
}

/**
 * Compression Worker Pool for parallel processing
 */
export class CompressionWorkerPool {
  private workers: Worker[] = []
  private availableWorkers: Worker[] = []
  private queue: Array<{
    task: () => Promise<Uint8Array>
    resolve: (value: Uint8Array) => void
    reject: (error: Error) => void
  }> = []
  private maxWorkers: number

  constructor(maxWorkers?: number) {
    // Get optimal worker count (use 1 less than CPU cores, max 4)
    const cores = navigator.hardwareConcurrency || 4
    this.maxWorkers = maxWorkers || Math.max(1, Math.min(cores - 1, 4))

    console.log(`[CompressionWorkerPool] Creating ${this.maxWorkers} compression workers`)

    // Create workers
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = createCompressionWorker()
      if (worker) {
        this.workers.push(worker)
        this.availableWorkers.push(worker)
      }
    }
  }

  /**
   * Compress data using worker pool
   */
  async compress(data: Uint8Array | string, level: number = 6): Promise<Uint8Array> {
    return this.process((worker) => compressInWorker(data, level, worker))
  }

  /**
   * Decompress data using worker pool
   */
  async decompress(data: Uint8Array): Promise<Uint8Array> {
    return this.process((worker) => decompressInWorker(data, worker))
  }

  /**
   * Process task using worker pool
   */
  private async process<T>(task: (worker: Worker) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.availableWorkers.length > 0) {
        const worker = this.availableWorkers.pop()!
        task(worker)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.availableWorkers.push(worker)
            this.processQueue()
          })
      } else {
        this.queue.push({
          task: async () => {
            const result = await task(this.workers[0])
            return result as any
          },
          resolve: resolve as any,
          reject: reject
        })
      }
    })
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.availableWorkers.length > 0) {
      const { task, resolve, reject } = this.queue.shift()!
      const worker = this.availableWorkers.pop()!

      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.availableWorkers.push(worker)
          this.processQueue()
        })
    }
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.availableWorkers = []
    this.queue = []
  }
}

