/**
 * Utility to test KTX2 file loading
 * Can be used in browser console or as a helper function
 */

import { KTX2Loader } from 'three-stdlib'
import * as THREE from 'three'

export interface KTX2TestResult {
  success: boolean
  error?: string
  texture?: THREE.Texture
  width?: number
  height?: number
  format?: string
  type?: string
  isCubemap?: boolean
}

/**
 * Test if a KTX2 file can be loaded
 * @param filePath - Path to KTX2 file (file:// URL or File object)
 * @returns Test result with texture information
 */
export async function testKTX2File(filePath: string | File): Promise<KTX2TestResult> {
  try {
    const loader = new KTX2Loader()
    
    // Set up transcoder path if needed
    // KTX2Loader requires the Basis transcoder files
    // These should be available from three-stdlib
    
    const urlString = filePath instanceof File ? URL.createObjectURL(filePath) : filePath
    
    console.log('[KTX2Test] Loading file:', filePath instanceof File ? filePath.name : filePath)
    
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        urlString,
        (loadedTexture) => {
          if (filePath instanceof File) {
            URL.revokeObjectURL(urlString)
          }
          resolve(loadedTexture)
        },
        undefined,
        (error) => {
          if (filePath instanceof File) {
            URL.revokeObjectURL(urlString)
          }
          reject(error)
        }
      )
    })
    
    if (!texture) {
      return {
        success: false,
        error: 'Loader returned undefined texture'
      }
    }
    
    // Extract texture information
    const isCubemap = texture instanceof THREE.CubeTexture
    const image = texture.image as { width?: number; height?: number } | null
    const cubeImages = isCubemap ? (texture as THREE.CubeTexture).images as Array<{ width?: number; height?: number } | null> : null
    const width = image?.width || (isCubemap && cubeImages?.[0] ? cubeImages[0]?.width : undefined)
    const height = image?.height || (isCubemap && cubeImages?.[0] ? cubeImages[0]?.height : undefined)
    
    console.log('[KTX2Test] File loaded successfully:', {
      isCubemap,
      width,
      height,
      format: texture.format,
      type: texture.type,
      mapping: texture.mapping
    })
    
    // Get format and type as strings
    const formatMap: Record<number, string> = {
      [THREE.RGBAFormat]: 'RGBA',
      [THREE.RGBFormat]: 'RGB',
      [THREE.RGFormat]: 'RG',
      [THREE.RedFormat]: 'Red',
      [THREE.DepthFormat]: 'Depth',
      [THREE.DepthStencilFormat]: 'DepthStencil'
    }
    
    const typeMap: Record<number, string> = {
      [THREE.UnsignedByteType]: 'UnsignedByte',
      [THREE.ByteType]: 'Byte',
      [THREE.ShortType]: 'Short',
      [THREE.UnsignedShortType]: 'UnsignedShort',
      [THREE.IntType]: 'Int',
      [THREE.UnsignedIntType]: 'UnsignedInt',
      [THREE.FloatType]: 'Float',
      [THREE.HalfFloatType]: 'HalfFloat'
    }
    
    return {
      success: true,
      texture,
      width,
      height,
      format: formatMap[texture.format] || `Unknown (${texture.format})`,
      type: typeMap[texture.type] || `Unknown (${texture.type})`,
      isCubemap
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[KTX2Test] Failed to load KTX2 file:', errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Test KTX2 file from local file path (for Node.js/testing)
 * Note: This requires the file to be accessible via file:// URL or copied to public folder
 */
export async function testKTX2FromPath(filePath: string): Promise<KTX2TestResult> {
  // Convert Windows path to file:// URL if needed
  let url = filePath
  if (filePath.startsWith('C:\\') || filePath.startsWith('D:\\')) {
    url = 'file:///' + filePath.replace(/\\/g, '/')
  }
  
  return testKTX2File(url)
}

