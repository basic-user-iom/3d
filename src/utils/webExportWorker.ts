/**
 * Web Worker for parallel web export operations
 * Handles image processing, thumbnail generation, and other CPU-intensive tasks
 * Cross-platform support for Mac and Windows
 */

export interface WorkerMessage {
  type: 'processImage' | 'generateThumbnail' | 'compressImage' | 'processBatch'
  data: any
  id?: string
}

export interface WorkerResponse {
  type: string
  data: any
  id?: string
  error?: string
}

/**
 * Create a Web Worker for export operations
 */
export function createExportWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    console.warn('[WebExportWorker] Web Workers not supported')
    return null
  }

  // Create inline worker code
  const workerCode = `
    // Image processing functions
    function processImage(imageData, options) {
      const { width, height, quality = 0.8, format = 'image/jpeg' } = options
      
      // Create canvas for processing
      const canvas = new OffscreenCanvas(width || imageData.width, height || imageData.height)
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        throw new Error('Failed to get 2D context')
      }
      
      // Draw image
      ctx.drawImage(imageData, 0, 0, canvas.width, canvas.height)
      
      // Apply any processing here (resize, filters, etc.)
      
      // Convert to blob
      return canvas.convertToBlob({ type: format, quality })
    }
    
    function generateThumbnail(imageData, maxWidth = 256, maxHeight = 144) {
      const canvas = new OffscreenCanvas(maxWidth, maxHeight)
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        throw new Error('Failed to get 2D context')
      }
      
      // Calculate aspect ratio
      const aspect = imageData.width / imageData.height
      let width = maxWidth
      let height = maxHeight
      
      if (aspect > 1) {
        height = maxWidth / aspect
      } else {
        width = maxHeight * aspect
      }
      
      canvas.width = width
      canvas.height = height
      
      // Draw scaled image
      ctx.drawImage(imageData, 0, 0, width, height)
      
      // Convert to blob
      return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    }
    
    function compressImage(imageData, quality = 0.7) {
      const canvas = new OffscreenCanvas(imageData.width, imageData.height)
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        throw new Error('Failed to get 2D context')
      }
      
      ctx.drawImage(imageData, 0, 0)
      
      return canvas.convertToBlob({ type: 'image/jpeg', quality })
    }
    
    // Message handler
    self.onmessage = async function(e) {
      const { type, data, id } = e.data
      
      try {
        let result
        
        switch (type) {
          case 'processImage':
            // Convert ImageData or ImageBitmap to processable format
            const imageBitmap = data.imageData instanceof ImageBitmap 
              ? data.imageData 
              : await createImageBitmap(data.imageData)
            result = await processImage(imageBitmap, data.options)
            self.postMessage({ type: 'processImage', data: result, id })
            break
            
          case 'generateThumbnail':
            const thumbImage = data.imageData instanceof ImageBitmap
              ? data.imageData
              : await createImageBitmap(data.imageData)
            result = await generateThumbnail(thumbImage, data.maxWidth, data.maxHeight)
            self.postMessage({ type: 'generateThumbnail', data: result, id })
            break
            
          case 'compressImage':
            const compImage = data.imageData instanceof ImageBitmap
              ? data.imageData
              : await createImageBitmap(data.imageData)
            result = await compressImage(compImage, data.quality)
            self.postMessage({ type: 'compressImage', data: result, id })
            break
            
          case 'processBatch':
            // Process multiple images in parallel
            const batchResults = await Promise.all(
              data.items.map(async (item) => {
                try {
                  const img = item.imageData instanceof ImageBitmap
                    ? item.imageData
                    : await createImageBitmap(item.imageData)
                  
                  if (item.type === 'thumbnail') {
                    return await generateThumbnail(img, item.maxWidth, item.maxHeight)
                  } else if (item.type === 'compress') {
                    return await compressImage(img, item.quality)
                  } else {
                    return await processImage(img, item.options || {})
                  }
                } catch (error) {
                  return { error: error.message }
                }
              })
            )
            self.postMessage({ type: 'processBatch', data: batchResults, id })
            break
            
          default:
            throw new Error(\`Unknown message type: \${type}\`)
        }
      } catch (error) {
        self.postMessage({ 
          type: type, 
          data: null, 
          id, 
          error: error.message 
        })
      }
    }
  `

  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)
    
    // Clean up URL after worker is created
    worker.addEventListener('message', () => {
      // URL will be cleaned up when worker terminates
    }, { once: true })
    
    return worker
  } catch (error) {
    console.error('[WebExportWorker] Failed to create worker:', error)
    return null
  }
}

/**
 * Process image in worker (with fallback to main thread)
 */
export async function processImageInWorker(
  worker: Worker | null,
  imageData: ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  options: { width?: number; height?: number; quality?: number; format?: string }
): Promise<Blob> {
  if (!worker) {
    // Fallback to main thread processing
    return processImageMainThread(imageData, options)
  }

  return new Promise((resolve, reject) => {
    const id = `img-${Date.now()}-${Math.random()}`
    
    const handler = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id === id) {
        worker.removeEventListener('message', handler)
        if (e.data.error) {
          reject(new Error(e.data.error))
        } else {
          resolve(e.data.data)
        }
      }
    }
    
    worker.addEventListener('message', handler)
    
    // Convert image to transferable format
    if (imageData instanceof HTMLImageElement || imageData instanceof HTMLCanvasElement) {
      // Need to convert to ImageBitmap for transfer
      createImageBitmap(imageData).then(bitmap => {
        worker.postMessage({
          type: 'processImage',
          data: { imageData: bitmap, options },
          id
        }, [bitmap])
      }).catch(reject)
    } else {
      worker.postMessage({
        type: 'processImage',
        data: { imageData, options },
        id
      }, imageData instanceof ImageBitmap ? [imageData] : [])
    }
  })
}

/**
 * Fallback: Process image on main thread
 */
function processImageMainThread(
  imageData: ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  options: { width?: number; height?: number; quality?: number; format?: string }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        reject(new Error('Failed to get 2D context'))
        return
      }
      
      const width = options.width || (imageData as any).width
      const height = options.height || (imageData as any).height
      
      canvas.width = width
      canvas.height = height
      
      ctx.drawImage(imageData as any, 0, 0, width, height)
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        options.format || 'image/jpeg',
        options.quality || 0.8
      )
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Create a worker pool for parallel processing
 */
export class ExportWorkerPool {
  private workers: Worker[] = []
  private availableWorkers: Worker[] = []
  private queue: Array<{
    task: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: Error) => void
  }> = []
  private maxWorkers: number

  constructor(maxWorkers?: number) {
    // Get optimal worker count
    const cores = navigator.hardwareConcurrency || 4
    this.maxWorkers = maxWorkers || Math.max(1, Math.min(cores - 1, 4))
    
    // Create workers
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = createExportWorker()
      if (worker) {
        this.workers.push(worker)
        this.availableWorkers.push(worker)
      }
    }
  }

  async process<T>(task: (worker: Worker) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.availableWorkers.length > 0) {
        const worker = this.availableWorkers.pop()!
        task(worker)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.availableWorkers.push(worker)
            this.processNext()
          })
      } else {
        this.queue.push({ task: () => task(this.workers[0]), resolve, reject })
      }
    })
  }

  private processNext() {
    if (this.queue.length > 0 && this.availableWorkers.length > 0) {
      const { task, resolve, reject } = this.queue.shift()!
      const worker = this.availableWorkers.pop()!
      
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.availableWorkers.push(worker)
          this.processNext()
        })
    }
  }

  terminate() {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.availableWorkers = []
    this.queue = []
  }
}









































