// @ts-nocheck

import * as THREE from 'three'
import { AssimpLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'

export async function load3DS(
  data: File | ArrayBuffer | string,
  _onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const loader = new AssimpLoader()

  return new Promise((resolve, reject) => {
    const onLoad = (result: any) => {
      // AssimpLoader returns an object with:
      // - object: THREE.Group containing the parsed model
      // - animations: array of animations
      
      const scene = result.object || result
      
      // Industry-standard: Mark all meshes as models with exclusion flags and fix texture issues
      scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.userData.isModel = true
          child.userData.isImportedModel = true
          child.userData.excludeFromSkyModifications = true
          child.userData.excludeFromWeatherModifications = true
          
          // Industry-standard: Disable fog on imported models - fog should only affect lighting, not visual appearance
          // Also apply depth masking to prevent background from showing through
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((mat: THREE.Material) => {
              mat.fog = false // Fog only affects lighting, not imported object textures
              
              // Industry-standard depth masking: Ensure imported models occlude background/sky
              mat.depthTest = true
              mat.depthWrite = true
              
              // Ensure materials are fully opaque (unless intentionally transparent via alpha map)
              if (mat instanceof THREE.MeshStandardMaterial || 
                  mat instanceof THREE.MeshPhysicalMaterial ||
                  mat instanceof THREE.MeshPhongMaterial ||
                  mat instanceof THREE.MeshLambertMaterial ||
                  mat instanceof THREE.MeshBasicMaterial) {
                
                const hasAlphaMap = mat.alphaMap !== undefined && mat.alphaMap !== null
                
                if (!hasAlphaMap && mat.opacity !== undefined && mat.opacity > 0.99) {
                  mat.opacity = 1.0
                  mat.transparent = false
                } else if (!hasAlphaMap && mat.opacity === undefined) {
                  mat.opacity = 1.0
                  mat.transparent = false
                } else if (hasAlphaMap) {
                  if (mat.alphaTest === undefined || mat.alphaTest === 0) {
                    mat.alphaTest = 0.1
                  }
                  mat.depthWrite = true
                }
              }
              
              mat.needsUpdate = true
            })
          }
          
          // Check and fix textures that might have issues
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((material: any) => {
              // List of texture properties that might be empty
              const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'lightMap', 'bumpMap', 'displacementMap']
              
              textureProps.forEach(prop => {
                const texture = material[prop]
                if (texture && texture.image === undefined) {
                  // Texture exists but has no image data - dispose it
                  material[prop] = null
                  try {
                    texture.dispose()
                  } catch (e) {
                    // Ignore disposal errors
                  }
                }
              })
              
              // Clear texture needsUpdate flag to prevent warnings
              textureProps.forEach(prop => {
                const texture = material[prop]
                if (texture instanceof THREE.Texture) {
                  // Only set needsUpdate if the texture has valid dimensions
                  // DataTexture uses width/height directly, regular textures use image.width/height
                  const width = (texture as any).width ?? (texture as any).image?.width ?? 0
                  const height = (texture as any).height ?? (texture as any).image?.height ?? 0
                  if (width > 0 && height > 0) {
                    texture.needsUpdate = false
                  }
                }
              })
            })
          }
        }
      })
      
      // Industry-standard: Mark scene with exclusion flags
      scene.userData.isModel = true
      scene.userData.excludeFromSkyModifications = true
      scene.userData.excludeFromWeatherModifications = true
      
      // Check for missing textures
      const missingTextures = detectMissingTextures(scene)
      storeMissingTextures(scene, missingTextures)
      
      resolve({
        scene,
        animations: result.animations || [],
        userData: {
          format: '3ds'
        }
      })
    }

    const onError = (error: ErrorEvent) => {
      reject(new Error(`Failed to load 3DS: ${error.message}`))
    }

    const onProgressCallback = (event: ProgressEvent) => {
      if (_onProgress && event.lengthComputable) {
        _onProgress((event.loaded / event.total) * 100)
      }
    }

    if (data instanceof File) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const result = loader.parse(arrayBuffer)
          onLoad(result)
        } catch (err) {
          reject(new Error(`Failed to parse 3DS: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(data)
    } else if (data instanceof ArrayBuffer) {
      try {
        const result = loader.parse(data)
        onLoad(result)
      } catch (err) {
        reject(new Error(`Failed to parse 3DS: ${err instanceof Error ? err.message : String(err)}`))
      }
    } else {
      // String URL
      loader.load(data, onLoad, onProgressCallback, onError)
    }
  })
}

