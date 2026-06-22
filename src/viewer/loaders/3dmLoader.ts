// @ts-nocheck

import * as THREE from 'three'
import { Rhino3dmLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'

/**
 * Loader for Rhino 3DM files
 * Based on Three.js example: https://threejs.org/examples/#webgl_loader_3dm
 */
export async function load3DM(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const loader = new Rhino3dmLoader()
  
  // Set library path for rhino3dm WASM
  loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/')

  return new Promise((resolve, reject) => {
    try {
      const onLoad = (object: THREE.Object3D) => {
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
        
        // Check for missing textures
        const missingTextures = detectMissingTextures(object)
        storeMissingTextures(object, missingTextures)

        resolve({
          scene: object,
          animations: [],
          userData: {
            format: '3dm'
          }
        })
      }

      const onError = (error: Error) => {
        reject(new Error(`Failed to load 3DM file: ${error.message}`))
      }

      // Handle different input types
      if (data instanceof File) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer
          if (arrayBuffer) {
            loader.parse(arrayBuffer, onLoad, onError)
          } else {
            reject(new Error('Failed to read 3DM file'))
          }
        }
        reader.onerror = () => reject(new Error('Failed to read 3DM file'))
        reader.readAsArrayBuffer(data)
      } else if (data instanceof ArrayBuffer) {
        loader.parse(data, onLoad, onError)
      } else if (typeof data === 'string') {
        // URL - fetch first
        fetch(data)
          .then(response => response.arrayBuffer())
          .then(arrayBuffer => {
            loader.parse(arrayBuffer, onLoad, onError)
          })
          .catch(error => {
            reject(new Error(`Failed to fetch 3DM file: ${error.message}`))
          })
      } else {
        reject(new Error('Invalid data type for 3DM loader'))
      }
    } catch (error) {
      reject(new Error(`3DM loader error: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  })
}

