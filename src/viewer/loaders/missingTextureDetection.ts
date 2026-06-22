import * as THREE from 'three'

export interface MissingTextureInfo {
  path: string // Original texture path/URI
  name: string // Display name
  property: string // Material property (map, normalMap, etc.)
  material: THREE.Material // Reference to the material
  mesh: THREE.Mesh // Reference to the mesh
}

/**
 * Detect missing textures in a scene and return detailed information
 * This can be used by all loaders to detect missing textures
 */
export function detectMissingTextures(
  scene: THREE.Object3D,
  textureFiles?: Map<string, File>
): MissingTextureInfo[] {
  const missingTextures: MissingTextureInfo[] = []
  
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((mat: THREE.Material) => {
        // Check common texture maps
        const textureMaps = [
          { prop: 'map', name: 'Base Color/Diffuse' },
          { prop: 'normalMap', name: 'Normal' },
          { prop: 'roughnessMap', name: 'Roughness' },
          { prop: 'metalnessMap', name: 'Metalness' },
          { prop: 'aoMap', name: 'Ambient Occlusion' },
          { prop: 'emissiveMap', name: 'Emissive' },
          { prop: 'bumpMap', name: 'Bump' },
          { prop: 'displacementMap', name: 'Displacement' },
          { prop: 'alphaMap', name: 'Alpha' },
          { prop: 'lightMap', name: 'Light' },
          { prop: 'specularMap', name: 'Specular' },
          { prop: 'envMap', name: 'Environment' }
        ]
        
        textureMaps.forEach(({ prop, name }) => {
          const texture = (mat as any)[prop] as THREE.Texture | undefined
          if (texture) {
            // Check if texture failed to load (image is null or has error)
            if (!texture.image || (texture.image instanceof HTMLImageElement && texture.image.naturalWidth === 0)) {
              // Get texture path from source or name
              let texturePath = texture.name || prop
              
              // Try to get original path from missing texture URLs map (set by URL modifier)
              if ((window as any).__missingTextureUrls) {
                const missingUrls = (window as any).__missingTextureUrls as Map<string, string>
                // Try to find matching URL
                for (const [key, value] of missingUrls.entries()) {
                  const keyLower = key.toLowerCase()
                  const textureNameLower = (texture.name || prop).toLowerCase()
                  if (keyLower.includes(textureNameLower) || textureNameLower.includes(keyLower.split('/').pop() || '')) {
                    texturePath = value || key
                    break
                  }
                }
              }
              
              // Try to get original path from texture source
              if (texture.source && (texture.source as any).data) {
                const sourceData = (texture.source as any).data
                if (sourceData instanceof HTMLImageElement && sourceData.src) {
                  // Extract filename from blob URL or data URL
                  if (sourceData.src.startsWith('blob:')) {
                    // Can't extract original path from blob URL, keep current texturePath
                  } else if (sourceData.src.startsWith('data:')) {
                    // Keep current texturePath
                  } else {
                    // Extract path from URL
                    try {
                      const url = new URL(sourceData.src)
                      texturePath = url.pathname || texturePath
                    } catch {
                      texturePath = sourceData.src.split('/').pop() || texturePath
                    }
                  }
                }
              }
              
              // Also check userData for original path
              if (texture.userData && texture.userData.originalPath) {
                texturePath = texture.userData.originalPath
              }
              
              // Fallback: use texture name or property
              if (!texturePath || texturePath === prop) {
                texturePath = texture.name || `${name}_${prop}`
              }
              
              // Avoid duplicates
              const existing = missingTextures.find(t => 
                t.path === texturePath && 
                t.property === prop && 
                t.material === mat
              )
              
              if (!existing) {
                missingTextures.push({
                  path: texturePath,
                  name: texture.name || `${name} (${prop})`,
                  property: prop,
                  material: mat,
                  mesh: child
                })
              }
            }
          }
        })
      })
    }
  })
  
  return missingTextures
}

/**
 * Store missing textures in scene userData for UI access
 */
export function storeMissingTextures(scene: THREE.Object3D, missingTextures: MissingTextureInfo[]): void {
  if (missingTextures.length > 0) {
    if (!(scene as any).userData.missingTextures) {
      (scene as any).userData.missingTextures = []
    }
    (scene as any).userData.missingTextures.push(...missingTextures)
    
    console.warn(`⚠️ Model loaded but ${missingTextures.length} texture(s) may be missing:`, missingTextures.slice(0, 5).map(t => t.name))
    console.warn(`💡 Tip: If your model references external textures, try selecting the folder containing both the model file and texture files, not just the model file itself.`)
  }
}


























