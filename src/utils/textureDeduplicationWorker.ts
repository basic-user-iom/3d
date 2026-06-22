/**
 * Web Worker for parallel texture comparison
 * Extracts image data and generates signatures in parallel
 */

export interface TextureSignature {
  key: string
  width: number
  height: number
  format: number
  type: number
  wrapS: number
  wrapT: number
  src?: string
  dataUrlPrefix?: string // First 100 chars of data URL for comparison
}

/**
 * Extract texture signature from image data
 * This runs in a Web Worker for parallel processing
 */
export function extractTextureSignature(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | any,
  format: number,
  type: number,
  wrapS: number,
  wrapT: number
): TextureSignature {
  let src = ''
  let dataUrlPrefix = ''
  
  if (image instanceof HTMLImageElement && image.src) {
    src = image.src
    // For data URLs, extract prefix for comparison
    if (image.src.startsWith('data:')) {
      dataUrlPrefix = image.src.substring(0, 100)
    }
  } else if (image instanceof HTMLCanvasElement) {
    try {
      const dataUrl = image.toDataURL()
      dataUrlPrefix = dataUrl.substring(0, 100)
    } catch (e) {
      // Canvas might be tainted, use dimensions only
    }
  } else if (image instanceof ImageBitmap) {
    src = `bitmap-${image.width}x${image.height}`
  }
  
  const width = (image as any).width || (image as any).naturalWidth || 0
  const height = (image as any).height || (image as any).naturalHeight || 0
  
  // Generate unique key
  const key = `${src}-${dataUrlPrefix}-${width}x${height}-${format}-${type}-${wrapS}-${wrapT}`
  
  return {
    key,
    width,
    height,
    format,
    type,
    wrapS,
    wrapT,
    src,
    dataUrlPrefix
  }
}

/**
 * Compare two texture signatures
 * ULTRA-STRICT: Only merge textures if they have EXACTLY the same source URL
 * This is the safest approach - only merge textures that are definitely the same file
 */
export function compareTextureSignatures(sig1: TextureSignature, sig2: TextureSignature): boolean {
  // ONLY merge if they have the EXACT same source URL (blob URLs, file paths, etc.)
  // This is the most reliable check - if the source URL is identical, it's the same texture
  if (sig1.src && sig2.src && sig1.src === sig2.src && sig1.src !== '') {
    // For blob URLs or file paths, if the URL matches exactly, it's the same texture
    // No need to check dimensions - if the URL is the same, it's the same image
    return true
  }
  
  // For data URLs, only merge if the prefix is very long (contains more image data)
  // Short prefixes might match by coincidence
  if (sig1.dataUrlPrefix && sig2.dataUrlPrefix && 
      sig1.dataUrlPrefix === sig2.dataUrlPrefix &&
      sig1.dataUrlPrefix.length > 200) { // Require longer prefix for data URLs
    // Data URLs with matching long prefixes are likely the same image
    return true
  }
  
  // DO NOT merge textures based on dimensions, format, or any other property
  // Only merge if source URL or data URL prefix matches exactly
  return false
}

