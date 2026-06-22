// @ts-nocheck

import * as THREE from 'three'
import { ColladaLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'

export async function loadCollada(
  data: File | ArrayBuffer | string,
  baseUrl?: string,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const loader = new ColladaLoader()

  return new Promise((resolve, reject) => {
    const onLoad = (collada: any) => {
      const scene = collada.scene
      // Industry-standard: Mark imported models with exclusion flags
      scene.userData.isModel = true
      scene.userData.excludeFromSkyModifications = true
      scene.userData.excludeFromWeatherModifications = true
      // Industry-standard: Disable fog and other sky textures on imported models
      scene.traverse((child) => {
        child.userData.isImportedModel = true
        child.userData.excludeFromSkyModifications = true
        child.userData.excludeFromWeatherModifications = true
        
        // Disable fog on imported models - fog should only affect lighting, not visual appearance
        // Industry-standard: Apply depth masking to prevent background from showing through
        if (child instanceof THREE.Mesh && child.material) {
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
      })
      // Attach animations to scene for easy access
      ;(scene as any).animations = collada.animations || []
      
      // Check for missing textures
      const missingTextures = detectMissingTextures(scene)
      storeMissingTextures(scene, missingTextures)
      
      resolve({
        scene,
        animations: collada.animations || [],
        userData: {
          format: 'dae'
        }
      })
    }

    const onError = (error: ErrorEvent) => {
      reject(new Error(`Failed to load Collada: ${error.message}`))
    }

    const onProgressCallback = (event: ProgressEvent) => {
      if (onProgress && event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100)
      }
    }

    if (data instanceof File) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const collada = loader.parse(text, baseUrl || '')
        onLoad(collada)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(data)
    } else if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data)
      const collada = loader.parse(text, baseUrl || '')
      onLoad(collada)
    } else {
      // String URL
      loader.load(data, onLoad, onProgressCallback, onError)
    }
  })
}

