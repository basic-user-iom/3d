// @ts-nocheck

import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'
import { enhanceFBXMaterials } from './fbxTextureConversion'

export async function loadFBX(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void,
  textureFiles?: Map<string, File>
): Promise<LoadedModel> {
  console.log('Loading FBX file...', data instanceof File ? data.name : data instanceof ArrayBuffer ? `${(data.byteLength / 1024 / 1024).toFixed(2)} MB` : 'URL')
  const loader = new FBXLoader()

  // Set up URL modifier for texture matching (similar to GLTF loader)
  let urlModifierSet = false
  const blobUrls = new Map<File, string>()
  
  if (textureFiles && textureFiles.size > 0) {
    urlModifierSet = true
    
    THREE.DefaultLoadingManager.setURLModifier((url) => {
      const originalUrl = url
      let cleanUrl = url
      
      // Handle file:// URLs
      if (url.startsWith('file://')) {
        try {
          const urlObj = new URL(url)
          cleanUrl = urlObj.pathname || url.replace(/^file:\/\/+/, '')
          if (cleanUrl.startsWith('/') && /^[A-Za-z]:/.test(cleanUrl.substring(1))) {
            cleanUrl = cleanUrl.substring(1)
          }
        } catch {
          cleanUrl = url.replace(/^file:\/\/+/, '').replace(/^\/+/, '')
        }
      }
      
      cleanUrl = cleanUrl.replace(/^blob:[^/]+/, '').replace(/^[/\\]+/, '').replace(/^\.\//, '')
      cleanUrl = cleanUrl.replace(/\\/g, '/')
      
      const urlLower = cleanUrl.toLowerCase()
      const fileName = cleanUrl.split('/').pop() || cleanUrl
      const fileNameLower = fileName.toLowerCase()
      
      // Try to match texture file
      for (const [path, file] of textureFiles.entries()) {
        const pathLower = path.toLowerCase()
        const pathFileName = path.split(/[/\\]/).pop()?.toLowerCase()
        
        // Exact match
        if (pathLower === urlLower || pathLower === cleanUrl.toLowerCase()) {
          if (!blobUrls.has(file)) {
            blobUrls.set(file, URL.createObjectURL(file))
          }
          return blobUrls.get(file)!
        }
        
        // Filename match
        if (pathFileName && pathFileName === fileNameLower) {
          if (!blobUrls.has(file)) {
            blobUrls.set(file, URL.createObjectURL(file))
          }
          return blobUrls.get(file)!
        }
        
        // Partial match
        if (pathLower.includes(fileNameLower) || fileNameLower.includes(pathFileName || '')) {
          if (!blobUrls.has(file)) {
            blobUrls.set(file, URL.createObjectURL(file))
          }
          return blobUrls.get(file)!
        }
      }
      
      return originalUrl
    })
  }

  return new Promise((resolve, reject) => {
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null
    
    const cleanup = () => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
        safetyTimeout = null
      }
    }
    
    const onLoad = (fbx: any) => {
      cleanup()
      console.log('FBX loaded successfully', fbx)
      const scene = fbx
      // Industry-standard: Mark imported models with exclusion flags to prevent sky/environmental effects from modifying them
      scene.userData.isModel = true
      scene.userData.excludeFromSkyModifications = true
      scene.userData.excludeFromWeatherModifications = true
      // Recursively tag all children with exclusion flags
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
      
      // Enhance FBX materials (convert non-PBR to PBR, set better defaults)
      // This helps compensate for ReflectionFactor/ShininessExponent maps that were skipped
      const enhancementResult = enhanceFBXMaterials(scene)
      if (enhancementResult.converted > 0 || enhancementResult.enhanced > 0) {
        console.log(`[FBXLoader] ✅ Enhanced ${enhancementResult.enhanced} material(s), converted ${enhancementResult.converted} to PBR`)
      }
      
      // Note about skipped texture maps
      console.info(`[FBXLoader] ℹ️ Note: ReflectionFactor and ShininessExponent maps are not supported in Three.js.`)
      console.info(`[FBXLoader] ℹ️ If you have these texture files, you can manually convert them to roughness maps using the Material Panel.`)
      console.info(`[FBXLoader] ℹ️ Tip: ReflectionFactor maps can be inverted to create roughness maps (high reflection = low roughness).`)
      
      // Attach animations to scene for easy access
      ;(scene as any).animations = fbx.animations || []
      
      // Clear URL modifier after loading
      if (urlModifierSet) {
        THREE.DefaultLoadingManager.setURLModifier(null)
        // Clean up blob URLs after a delay to allow textures to load
        setTimeout(() => {
          blobUrls.forEach((url) => URL.revokeObjectURL(url))
          blobUrls.clear()
        }, 5000)
      }
      
      // Check for missing textures
      const missingTextures = detectMissingTextures(scene, textureFiles)
      storeMissingTextures(scene, missingTextures)
      
      resolve({
        scene,
        animations: fbx.animations || [],
        userData: {
          format: 'fbx'
        }
      })
    }

    const onError = (error: ErrorEvent) => {
      cleanup()
      // Clear URL modifier on error
      if (urlModifierSet) {
        THREE.DefaultLoadingManager.setURLModifier(null)
        blobUrls.forEach((url) => URL.revokeObjectURL(url))
        blobUrls.clear()
      }
      reject(new Error(`Failed to load FBX: ${error.message}`))
    }
    
    // Add a safety timeout in case parse never calls callbacks
    safetyTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('FBX parsing timed out - the file may be corrupted, too large, or incompatible'))
    }, 45000) // 45 second safety timeout (before the 60s main timeout)

    const onProgressCallback = (event: ProgressEvent) => {
      if (onProgress && event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100)
      }
    }

    if (data instanceof File) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          console.log('File read, starting FBX parse...', `${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
          // FBXLoader.parse returns synchronously
          try {
            const result = loader.parse(arrayBuffer, '')
            onLoad(result)
          } catch (parseErr) {
            onError(parseErr as ErrorEvent)
          }
        } catch (err) {
          console.error('FBX parse error:', err)
          reject(new Error(`Failed to parse FBX: ${err instanceof Error ? err.message : String(err)}`))
        }
      }
      reader.onerror = () => {
        console.error('Failed to read FBX file')
        reject(new Error('Failed to read file'))
      }
      reader.readAsArrayBuffer(data)
    } else if (data instanceof ArrayBuffer) {
      try {
        const result = loader.parse(data, '')
        onLoad(result)
      } catch (err) {
        reject(new Error(`Failed to parse FBX: ${err instanceof Error ? err.message : String(err)}`))
      }
    } else {
      // String URL
      loader.load(data, onLoad, onProgressCallback, onError)
    }
  })
}

