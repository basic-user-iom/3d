import * as THREE from 'three'
import { OBJLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'

export async function loadOBJ(
  data: File | ArrayBuffer | string,
  _baseUrl?: string,
  _onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const objLoader = new OBJLoader()

  return new Promise((resolve, reject) => {
    const onLoad = (object: THREE.Group) => {
      // Industry-standard: Mark imported models with exclusion flags
      object.userData.isModel = true
      object.userData.excludeFromSkyModifications = true
      object.userData.excludeFromWeatherModifications = true
      // Industry-standard: Disable fog and other sky textures on imported models
      object.traverse((child) => {
        child.userData.isImportedModel = true
        child.userData.excludeFromSkyModifications = true
        child.userData.excludeFromWeatherModifications = true
        
        // Disable fog on imported models - fog should only affect lighting, not visual appearance
        // Industry-standard: Apply depth masking to prevent background from showing through
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((mat: THREE.Material) => {
            if ('fog' in mat) {
              ;(mat as THREE.MeshStandardMaterial).fog = false
            }
            
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
      
      // Check for missing textures
      const missingTextures = detectMissingTextures(object)
      storeMissingTextures(object, missingTextures)
      
      resolve({
        scene: object,
        animations: [],
        userData: {
          format: 'obj'
        }
      })
    }

    const onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      reject(new Error(`Failed to load OBJ: ${message}`))
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
          const text = e.target?.result as string
          const object = objLoader.parse(text)
          onLoad(object)
        } catch (err) {
          reject(new Error(`Failed to parse OBJ: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(data)
    } else if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data)
      const object = objLoader.parse(text)
      onLoad(object)
    } else {
      // String URL
      objLoader.load(data, onLoad, onProgressCallback, onError)
    }
  })
}

