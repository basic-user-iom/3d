// @ts-nocheck

import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'
import { LoadedModel } from '../useViewer'
import { detectMissingTextures, storeMissingTextures } from './missingTextureDetection'
import { enhanceFBXMaterials } from './fbxTextureConversion'
import { createScopedLoadingSession, type ScopedLoadingSession } from './scopedLoadingSession'

export async function loadFBX(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void,
  textureFiles?: Map<string, File>,
  loadingSession?: ScopedLoadingSession
): Promise<LoadedModel> {
  console.log('Loading FBX file...', data instanceof File ? data.name : data instanceof ArrayBuffer ? `${(data.byteLength / 1024 / 1024).toFixed(2)} MB` : 'URL')

  // DATA-3: dedicated LoadingManager per load
  const ownsSession = !loadingSession
  const session = loadingSession ?? createScopedLoadingSession()
  let succeeded = false

  try {
    const loader = new FBXLoader(session.manager)

    if (textureFiles && textureFiles.size > 0) {
      session.setURLModifier((url) => {
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

        for (const [path, file] of textureFiles.entries()) {
          const pathLower = path.toLowerCase()
          const pathFileName = path.split(/[/\\]/).pop()?.toLowerCase()

          if (pathLower === urlLower || pathLower === cleanUrl.toLowerCase()) {
            return session.getOrCreateBlobUrl(file)
          }

          if (pathFileName && pathFileName === fileNameLower) {
            return session.getOrCreateBlobUrl(file)
          }

          if (pathLower.includes(fileNameLower) || fileNameLower.includes(pathFileName || '')) {
            return session.getOrCreateBlobUrl(file)
          }
        }

        return originalUrl
      })
    }

    const result = await new Promise<LoadedModel>((resolve, reject) => {
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
        scene.userData.isModel = true
        scene.userData.excludeFromSkyModifications = true
        scene.userData.excludeFromWeatherModifications = true
        scene.traverse((child) => {
          child.userData.isImportedModel = true
          child.userData.excludeFromSkyModifications = true
          child.userData.excludeFromWeatherModifications = true

          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((mat: THREE.Material) => {
              mat.fog = false
              mat.depthTest = true
              mat.depthWrite = true

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

        const enhancementResult = enhanceFBXMaterials(scene)
        if (enhancementResult.converted > 0 || enhancementResult.enhanced > 0) {
          console.log(`[FBXLoader] ✅ Enhanced ${enhancementResult.enhanced} material(s), converted ${enhancementResult.converted} to PBR`)
        }

        console.info(`[FBXLoader] ℹ️ Note: ReflectionFactor and ShininessExponent maps are not supported in Three.js.`)
        console.info(`[FBXLoader] ℹ️ If you have these texture files, you can manually convert them to roughness maps using the Material Panel.`)
        console.info(`[FBXLoader] ℹ️ Tip: ReflectionFactor maps can be inverted to create roughness maps (high reflection = low roughness).`)

        ;(scene as any).animations = fbx.animations || []

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
        reject(new Error(`Failed to load FBX: ${error.message}`))
      }

      safetyTimeout = setTimeout(() => {
        cleanup()
        reject(new Error('FBX parsing timed out - the file may be corrupted, too large, or incompatible'))
      }, 45000)

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
            try {
              const parsed = loader.parse(arrayBuffer, '')
              onLoad(parsed)
            } catch (parseErr) {
              onError(parseErr as ErrorEvent)
            }
          } catch (err) {
            console.error('FBX parse error:', err)
            cleanup()
            reject(new Error(`Failed to parse FBX: ${err instanceof Error ? err.message : String(err)}`))
          }
        }
        reader.onerror = () => {
          console.error('Failed to read FBX file')
          cleanup()
          reject(new Error('Failed to read file'))
        }
        reader.readAsArrayBuffer(data)
      } else if (data instanceof ArrayBuffer) {
        try {
          const parsed = loader.parse(data, '')
          onLoad(parsed)
        } catch (err) {
          cleanup()
          reject(new Error(`Failed to parse FBX: ${err instanceof Error ? err.message : String(err)}`))
        }
      } else {
        loader.load(data, onLoad, onProgressCallback, onError)
      }
    })

    succeeded = true
    return result
  } finally {
    if (ownsSession) {
      session.dispose({ revokeBlobs: !succeeded })
    }
  }
}
