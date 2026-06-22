/**
 * Utility to create a modified HDR texture with lower hemisphere masked out
 * This prevents the reflective ground from appearing in path tracer renders
 */

import * as THREE from 'three'

/**
 * Create a modified HDR texture with the lower hemisphere masked out
 * @param originalTexture - The original equirectangular HDR texture
 * @param horizonRatio - Ratio from 0-1 for where to mask (0.5 = equator, 0.6 = mask bottom 40%)
 * @returns A new DataTexture with lower hemisphere masked to black or sky color
 */
export function createMaskedHDRTexture(
  originalTexture: THREE.DataTexture,
  horizonRatio: number = 0.5
): THREE.DataTexture {
  const image = originalTexture.image
  
  if (!image || !image.data) {
    throw new Error('Original texture must have image.data')
  }
  
  const width = image.width
  const height = image.height
  const channels = image.data.length / (width * height) // Typically 4 for RGBA or 3 for RGB
  
  // Create new data array
  const newData = new Float32Array(image.data.length)
  const horizonY = Math.floor(height * horizonRatio)
  
  // Copy and mask data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * channels
      
      if (y >= horizonY) {
        // Lower hemisphere - mask to black (or blend with horizon)
        // For smooth transition, blend with horizon color
        const blendFactor = (y - horizonY) / (height - horizonY)
        const smoothMask = Math.pow(blendFactor, 2) // Smooth falloff
        
        // Get horizon color for smooth blending (optional)
        const horizonIndex = (horizonY * width + x) * channels
        
        if (channels === 4) {
          // RGBA format
          newData[index] = image.data[horizonIndex] * (1 - smoothMask)      // R
          newData[index + 1] = image.data[horizonIndex + 1] * (1 - smoothMask) // G
          newData[index + 2] = image.data[horizonIndex + 2] * (1 - smoothMask) // B
          newData[index + 3] = image.data[index + 3] // Keep original alpha
        } else if (channels === 3) {
          // RGB format
          newData[index] = image.data[horizonIndex] * (1 - smoothMask)      // R
          newData[index + 1] = image.data[horizonIndex + 1] * (1 - smoothMask) // G
          newData[index + 2] = image.data[horizonIndex + 2] * (1 - smoothMask) // B
        }
      } else {
        // Upper hemisphere - keep original
        for (let c = 0; c < channels; c++) {
          newData[index + c] = image.data[index + c]
        }
      }
    }
  }
  
  // Create new texture
  const maskedTexture = new THREE.DataTexture(
    newData,
    width,
    height,
    channels === 4 ? THREE.RGBAFormat : THREE.RGBFormat,
    THREE.FloatType
  )
  
  maskedTexture.mapping = THREE.EquirectangularReflectionMapping
  maskedTexture.needsUpdate = true
  maskedTexture.flipY = originalTexture.flipY
  
  console.log('[MaskedHDRTexture] Created masked HDR texture:', {
    width,
    height,
    channels,
    horizonRatio,
    horizonY,
    maskedHeight: height - horizonY
  })
  
  return maskedTexture
}

/**
 * Create a simplified version that just sets lower hemisphere to black (faster)
 */
export function createBlackMaskedHDRTexture(
  originalTexture: THREE.DataTexture,
  horizonRatio: number = 0.5
): THREE.DataTexture {
  const image = originalTexture.image
  
  if (!image || !image.data) {
    throw new Error('Original texture must have image.data')
  }
  
  const width = image.width
  const height = image.height
  const dataLength = image.data.length
  const pixelCount = width * height
  const channels = dataLength / pixelCount
  
  console.log('[MaskedHDRTexture] Analyzing HDR texture:', {
    width,
    height,
    pixelCount,
    dataLength,
    channels,
    calculatedChannels: channels.toFixed(2),
    dataType: image.data.constructor.name,
    horizonRatio,
    horizonY: Math.floor(height * horizonRatio)
  })
  
  // Validate channels (HDR/RGBE typically uses 4 channels, RGB uses 3)
  if (channels !== 3 && channels !== 4) {
    console.warn('[MaskedHDRTexture] ⚠️ Unexpected channel count:', channels, '- assuming 4 (RGBE)')
  }
  
  // Clone the original data
  const newData = new Float32Array(image.data)
  const horizonY = Math.floor(height * horizonRatio)
  
  // Set lower hemisphere to black
  for (let y = horizonY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * channels
      
      // Set RGB to 0 (black), keep alpha if present
      if (channels === 4) {
        newData[index] = 0     // R
        newData[index + 1] = 0 // G
        newData[index + 2] = 0 // B
        // Alpha stays the same
      } else if (channels === 3) {
        newData[index] = 0     // R
        newData[index + 1] = 0 // G
        newData[index + 2] = 0 // B
      }
    }
  }
  
  // Create new texture
  const maskedTexture = new THREE.DataTexture(
    newData,
    width,
    height,
    channels === 4 ? THREE.RGBAFormat : THREE.RGBFormat,
    THREE.FloatType
  )
  
  maskedTexture.mapping = THREE.EquirectangularReflectionMapping
  maskedTexture.needsUpdate = true
  maskedTexture.flipY = originalTexture.flipY
  
  console.log('[MaskedHDRTexture] Created black-masked HDR texture:', {
    width,
    height,
    channels,
    horizonRatio,
    horizonY,
    maskedHeight: height - horizonY
  })
  
  return maskedTexture
}

