import * as THREE from 'three'

/**
 * Convert FBX-specific texture maps to Three.js supported maps
 * 
 * FBX files may contain texture maps that Three.js doesn't support:
 * - ReflectionFactor map: Can be converted to roughness/metalness maps
 * - ShininessExponent map: Can be converted to roughness map (inverse relationship)
 * 
 * Note: The FBXLoader skips these maps during loading, so we need to intercept
 * the loading process or provide a way for users to manually link these textures.
 * 
 * This function provides utilities to convert texture images if they're available.
 */

/**
 * Convert a reflection/glossiness texture to a roughness texture by inverting it
 */
export async function convertReflectionToRoughness(
  textureImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<THREE.Texture> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  
  const width = textureImage.width || 512
  const height = textureImage.height || 512
  canvas.width = width
  canvas.height = height
  
  ctx.drawImage(textureImage, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  
  // Invert: reflection/glossiness (high = shiny) -> roughness (high = rough)
  for (let i = 0; i < data.length; i += 4) {
    // Use average of RGB channels for intensity
    const intensity = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255
    
    // Convert to roughness (inverse)
    const roughness = 1 - intensity
    
    // Update RGB channels with roughness value
    const roughnessValue = Math.round(roughness * 255)
    data[i] = roughnessValue     // R
    data[i + 1] = roughnessValue // G
    data[i + 2] = roughnessValue // B
    // Alpha stays the same
  }
  
  ctx.putImageData(imageData, 0, 0)
  
  // Create texture from canvas
  const roughnessTexture = new THREE.CanvasTexture(canvas)
  roughnessTexture.flipY = false
  roughnessTexture.needsUpdate = true
  
  return roughnessTexture
}

/**
 * Convert a shininess texture to a roughness texture by inverting it
 */
export async function convertShininessToRoughness(
  textureImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<THREE.Texture> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }
  
  const width = textureImage.width || 512
  const height = textureImage.height || 512
  canvas.width = width
  canvas.height = height
  
  ctx.drawImage(textureImage, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  
  // Convert shininess to roughness (inverse)
  // Shininess is typically 0-128 or 0-1 normalized
  for (let i = 0; i < data.length; i += 4) {
    // Use average of RGB channels
    const shininess = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255
    
    // Normalize shininess (FBX might use 0-128 range)
    const normalizedShininess = shininess > 1 ? shininess / 128 : shininess
    
    // Convert to roughness (inverse)
    const roughness = 1 - normalizedShininess
    
    // Update RGB channels
    const roughnessValue = Math.round(roughness * 255)
    data[i] = roughnessValue     // R
    data[i + 1] = roughnessValue // G
    data[i + 2] = roughnessValue // B
    // Alpha stays the same
  }
  
  ctx.putImageData(imageData, 0, 0)
  
  // Create texture from canvas
  const roughnessTexture = new THREE.CanvasTexture(canvas)
  roughnessTexture.flipY = false
  roughnessTexture.needsUpdate = true
  
  return roughnessTexture
}

/**
 * Process FBX materials to enhance them with better defaults
 * Since we can't access the skipped ReflectionFactor/ShininessExponent maps directly,
 * we can at least ensure materials are using PBR properties optimally
 */
export function enhanceFBXMaterials(scene: THREE.Object3D): {
  enhanced: number
  converted: number
} {
  let enhancedCount = 0
  let convertedCount = 0

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      
      materials.forEach((mat: THREE.Material) => {
        // Convert non-PBR materials to PBR for better rendering
        if (mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshLambertMaterial) {
          const pbrMat = new THREE.MeshStandardMaterial({
            color: mat.color,
            map: mat.map,
            normalMap: mat.normalMap,
            emissive: mat.emissive,
            emissiveMap: mat.emissiveMap,
            transparent: mat.transparent,
            opacity: mat.opacity,
            side: mat.side,
            // Set reasonable defaults for PBR
            roughness: 0.7, // Default roughness
            metalness: 0.0, // Default non-metallic
            envMapIntensity: 1.0
          })
          
          // Replace material
          if (Array.isArray(child.material)) {
            const index = child.material.indexOf(mat)
            if (index >= 0) {
              child.material[index] = pbrMat
            }
          } else {
            child.material = pbrMat
          }
          
          convertedCount++
          enhancedCount++
        } else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          // Enhance existing PBR materials with better defaults if missing
          if (mat.roughness === undefined || mat.roughness === 0) {
            mat.roughness = 0.7
          }
          if (mat.metalness === undefined) {
            mat.metalness = 0.0
          }
          if (mat.envMapIntensity === undefined || mat.envMapIntensity === 0) {
            mat.envMapIntensity = 1.0
          }
          enhancedCount++
        }
        
        mat.needsUpdate = true
      })
    }
  })
  
  return { enhanced: enhancedCount, converted: convertedCount }
}

