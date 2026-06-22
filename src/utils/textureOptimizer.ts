/**
 * Texture optimization utilities
 * Converts PNG/JPG textures to WebP or KTX2 for better performance and smaller file sizes
 */

export type TextureFormat = 'webp' | 'ktx2'

export interface TextureOptimizationOptions {
  format: TextureFormat
  quality?: number // 0-1 for WebP, 0-4 for KTX2
  maxResolution?: number // Maximum width/height (0 = no limit)
  generateMipmaps?: boolean // For KTX2 only
  onProgress?: (progress: number) => void
}

export interface TextureOptimizationResult {
  optimizedBlob: Blob
  originalSize: number
  optimizedSize: number
  compressionRatio: number
  originalResolution: { width: number; height: number }
  optimizedResolution: { width: number; height: number }
  format: TextureFormat
}

/**
 * Convert image file (PNG, JPG, etc.) to WebP format
 */
export async function convertToWebP(
  file: File,
  options: { quality?: number; maxResolution?: number; onProgress?: (progress: number) => void } = {}
): Promise<TextureOptimizationResult> {
  const { quality = 0.85, maxResolution = 0, onProgress } = options
  
  if (onProgress) onProgress(10)
  
  // Check file size - warn if very large
  const fileSizeMB = file.size / (1024 * 1024)
  if (fileSizeMB > 50) {
    console.warn(`[TextureOptimizer] Large file detected: ${file.name} (${fileSizeMB.toFixed(2)} MB). Processing may take a while.`)
  }
  
  // Load image with timeout
  const imageLoadTimeout = 30000 // 30 seconds max for image loading
  const image = await Promise.race([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error(`Failed to load image: ${file.name}`))
      }
      img.src = objectUrl
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Image loading timed out after ${imageLoadTimeout / 1000} seconds. File may be corrupted or too large: ${file.name}`))
      }, imageLoadTimeout)
    })
  ])
  
  if (onProgress) onProgress(30)
  
  const originalWidth = image.width
  const originalHeight = image.height
  
  // Check for invalid dimensions
  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error(`Invalid image dimensions: ${originalWidth}x${originalHeight} for ${file.name}`)
  }
  
  // Check for extremely large images that might cause memory issues
  const pixelCount = originalWidth * originalHeight
  const estimatedMemoryMB = (pixelCount * 4) / (1024 * 1024) // RGBA = 4 bytes per pixel
  if (estimatedMemoryMB > 500) {
    console.warn(`[TextureOptimizer] Very large image: ${file.name} (${originalWidth}x${originalHeight}, ~${estimatedMemoryMB.toFixed(1)}MB in memory). This may cause performance issues.`)
  }
  
  let finalWidth = originalWidth
  let finalHeight = originalHeight
  
  // Downscale if needed
  if (maxResolution > 0 && (originalWidth > maxResolution || originalHeight > maxResolution)) {
    const scale = Math.min(maxResolution / originalWidth, maxResolution / originalHeight)
    finalWidth = Math.floor(originalWidth * scale)
    finalHeight = Math.floor(originalHeight * scale)
    console.log(`[TextureOptimizer] Downscaling ${file.name} from ${originalWidth}x${originalHeight} to ${finalWidth}x${finalHeight}`)
  }
  
  if (onProgress) onProgress(50)
  
  // Draw to canvas
  const canvas = document.createElement('canvas')
  canvas.width = finalWidth
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  
  try {
    ctx.drawImage(image, 0, 0, finalWidth, finalHeight)
  } catch (error) {
    throw new Error(`Failed to draw image to canvas: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  if (onProgress) onProgress(70)
  
  // Convert to WebP
  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert to WebP'))
        }
      },
      'image/webp',
      quality
    )
  })
  
  if (onProgress) onProgress(100)
  
  const originalSize = file.size
  const optimizedSize = webpBlob.size
  const compressionRatio = originalSize / optimizedSize
  
  return {
    optimizedBlob: webpBlob,
    originalSize,
    optimizedSize,
    compressionRatio,
    originalResolution: { width: originalWidth, height: originalHeight },
    optimizedResolution: { width: finalWidth, height: finalHeight },
    format: 'webp'
  }
}

/**
 * Convert image file (PNG, JPG, etc.) to KTX2 format
 */
export async function convertToKTX2(
  file: File,
  options: { quality?: number; maxResolution?: number; generateMipmaps?: boolean; onProgress?: (progress: number) => void } = {}
): Promise<TextureOptimizationResult> {
  const { quality = 4, maxResolution = 0, generateMipmaps = true, onProgress } = options
  
  if (onProgress) onProgress(5)
  
  // Check file size - warn if very large
  const fileSizeMB = file.size / (1024 * 1024)
  if (fileSizeMB > 50) {
    console.warn(`[TextureOptimizer] Large file detected: ${file.name} (${fileSizeMB.toFixed(2)} MB). Processing may take a while.`)
  }
  
  // Load image with timeout
  const imageLoadTimeout = 30000 // 30 seconds max for image loading
  const image = await Promise.race([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error(`Failed to load image: ${file.name}`))
      }
      img.src = objectUrl
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Image loading timed out after ${imageLoadTimeout / 1000} seconds. File may be corrupted or too large: ${file.name}`))
      }, imageLoadTimeout)
    })
  ])
  
  if (onProgress) onProgress(20)
  
  const originalWidth = image.width
  const originalHeight = image.height
  
  // Check for invalid dimensions
  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error(`Invalid image dimensions: ${originalWidth}x${originalHeight} for ${file.name}`)
  }
  
  // Check for extremely large images that might cause memory issues
  const pixelCount = originalWidth * originalHeight
  const estimatedMemoryMB = (pixelCount * 4) / (1024 * 1024) // RGBA = 4 bytes per pixel
  if (estimatedMemoryMB > 500) {
    console.warn(`[TextureOptimizer] Very large image: ${file.name} (${originalWidth}x${originalHeight}, ~${estimatedMemoryMB.toFixed(1)}MB in memory). This may cause performance issues.`)
  }
  
  let finalWidth = originalWidth
  let finalHeight = originalHeight
  
  // Downscale if needed
  if (maxResolution > 0 && (originalWidth > maxResolution || originalHeight > maxResolution)) {
    const scale = Math.min(maxResolution / originalWidth, maxResolution / originalHeight)
    finalWidth = Math.floor(originalWidth * scale)
    finalHeight = Math.floor(originalHeight * scale)
    console.log(`[TextureOptimizer] Downscaling ${file.name} from ${originalWidth}x${originalHeight} to ${finalWidth}x${finalHeight}`)
  }
  
  // KTX2 requires dimensions to be divisible by 4
  finalWidth = Math.floor(finalWidth / 4) * 4
  finalHeight = Math.floor(finalHeight / 4) * 4
  
  if (finalWidth < 4 || finalHeight < 4) {
    throw new Error(`Dimensions too small after rounding: ${finalWidth}x${finalHeight}`)
  }
  
  if (onProgress) onProgress(40)
  
  // Draw to canvas and get image data
  const canvas = document.createElement('canvas')
  canvas.width = finalWidth
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  
  try {
    ctx.drawImage(image, 0, 0, finalWidth, finalHeight)
  } catch (error) {
    throw new Error(`Failed to draw image to canvas: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  let imageData: ImageData
  try {
    imageData = ctx.getImageData(0, 0, finalWidth, finalHeight)
  } catch (error) {
    throw new Error(`Failed to get image data from canvas (image may be too large): ${error instanceof Error ? error.message : String(error)}`)
  }
  
  const imageBuffer = new Uint8Array(imageData.data)
  
  if (onProgress) onProgress(60)
  
  // Encode to KTX2 using ktx2-encoder
  // First convert to PNG buffer (ktx2-encoder expects PNG input)
  const pngBufferTimeout = 30000 // 30 seconds for PNG conversion
  const pngBuffer = await Promise.race([
    new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob'))
          return
        }
        blob.arrayBuffer().then(buffer => {
          resolve(new Uint8Array(buffer))
        }).catch(reject)
      }, 'image/png')
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`PNG buffer creation timed out after ${pngBufferTimeout / 1000} seconds. Image may be too large: ${file.name}`))
      }, pngBufferTimeout)
    })
  ])
  
  if (onProgress) onProgress(70)
  
  // Verify WASM file is accessible before attempting encoding
  const wasmUrl = '/basis/basis_encoder.wasm'
  try {
    const wasmResponse = await fetch(wasmUrl, { method: 'HEAD' })
    if (!wasmResponse.ok) {
      throw new Error(`WASM file not accessible: ${wasmUrl} (HTTP ${wasmResponse.status})`)
    }
    console.log('[TextureOptimizer] WASM file verified:', wasmUrl)
  } catch (fetchError) {
    console.error('[TextureOptimizer] Failed to verify WASM file:', fetchError)
    throw new Error(
      `Cannot access basis_encoder.wasm at ${wasmUrl}. ` +
      `Make sure the file exists in the public/basis/ directory. ` +
      `Falling back to WebP format is recommended.`
    )
  }
  
  const { encodeToKTX2: ktx2Encode } = await import('ktx2-encoder')
  
  const uastcQuality = Math.min(4, Math.max(0, quality))
  
  const encodeOptions: any = {
    isUASTC: true,
    uastcLDRQualityLevel: uastcQuality,
    compressionLevel: 1,
    generateMipmap: generateMipmaps !== false,
    isKTX2File: true,
    isPerceptual: true, // sRGB for regular images
    isSetKTX2SRGBTransferFunc: true,
    needSupercompression: false, // Must be false for Three.js compatibility
    wasmUrl: wasmUrl,
    enableDebug: false
  }
  
  // Set JS URL if available
  if (typeof window !== 'undefined') {
    encodeOptions.jsUrl = `${window.location.origin}/basis/basis_encoder.js`
  }
  
  if (onProgress) onProgress(80)
  
  // Add timeout to prevent hanging (60 seconds max for encoding)
  const TIMEOUT_MS = 60000
  const encodingPromise = ktx2Encode(pngBuffer, encodeOptions)
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`KTX2 encoding timed out after ${TIMEOUT_MS / 1000} seconds. The texture may be too large or the encoder may be stuck.`))
    }, TIMEOUT_MS)
  })
  
  console.log(`[TextureOptimizer] Starting KTX2 encoding for ${file.name} (${finalWidth}x${finalHeight}, ${(pngBuffer.length / 1024).toFixed(1)}KB PNG buffer)...`)
  
  // ktx2-encoder expects PNG buffer and options
  const ktx2Result = await Promise.race([encodingPromise, timeoutPromise])
  
  console.log(`[TextureOptimizer] KTX2 encoding completed for ${file.name}`)
  
  // Convert Uint8Array to Blob
  const arrayBuffer = new ArrayBuffer(ktx2Result.byteLength)
  const view = new Uint8Array(arrayBuffer)
  view.set(ktx2Result)
  const ktx2Blob = new Blob([arrayBuffer], { type: 'image/ktx2' })
  
  if (onProgress) onProgress(100)
  
  const originalSize = file.size
  const optimizedSize = ktx2Blob.size
  const compressionRatio = originalSize / optimizedSize
  
  return {
    optimizedBlob: ktx2Blob,
    originalSize,
    optimizedSize,
    compressionRatio,
    originalResolution: { width: originalWidth, height: originalHeight },
    optimizedResolution: { width: finalWidth, height: finalHeight },
    format: 'ktx2'
  }
}

/**
 * Optimize texture file to specified format
 */
export async function optimizeTexture(
  file: File,
  options: TextureOptimizationOptions
): Promise<TextureOptimizationResult> {
  if (options.format === 'webp') {
    return convertToWebP(file, {
      quality: options.quality,
      maxResolution: options.maxResolution,
      onProgress: options.onProgress
    })
  } else if (options.format === 'ktx2') {
    return convertToKTX2(file, {
      quality: options.quality,
      maxResolution: options.maxResolution,
      generateMipmaps: options.generateMipmaps,
      onProgress: options.onProgress
    })
  } else {
    throw new Error(`Unsupported format: ${options.format}`)
  }
}

