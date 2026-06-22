import * as THREE from 'three'
import { RGBELoader, EXRLoader, KTX2Loader } from 'three-stdlib'
import { EnvironmentManager } from './EnvironmentManager'
import { setupGroundProjectedEnv, GroundProjectionResult } from './ground-projection-setup'
import { useAppStore } from '../../store/useAppStore'
import { materialUpdateQueue } from '../utils/MaterialUpdateQueue'
import { calculateMaterialIntensity, shouldApplyHDR } from '../utils/materialIntensityHelper'

export interface GroundProjectionConfig {
  enabled: boolean
  height?: number
  radius?: number
  resolution?: number
  positionY?: number
}

export interface HDRSystemConfig {
  enabled: boolean
  url: string | File | null
  intensity: number
  groundProjection?: GroundProjectionConfig
  debug?: boolean
  rotationAzimuth?: number
  rotationElevation?: number
  backgroundVisible?: boolean
}

/**
 * Normalize HDR URL - converts Windows file paths to proper relative URLs
 * Handles cases like:
 * - D:\files-upload\hdr\file.hdr -> /files-upload/hdr/file.hdr
 * - /D:/files-upload/hdr/file.hdr -> /files-upload/hdr/file.hdr
 * - D:/files-upload/hdr/file.hdr -> /files-upload/hdr/file.hdr
 */
function normalizeHDRUrl(url: string): string {
  // If it's already a valid URL (http/https/blob/data), return as-is
  if (url.startsWith('http://') || url.startsWith('https://') || 
      url.startsWith('blob:') || url.startsWith('data:')) {
    return url
  }
  
  // Handle Windows absolute paths
  // Pattern: /D:/path or D:/path or D:\path
  const windowsPathMatch = url.match(/^\/?([A-Za-z]):[\/\\](.+)$/i)
  if (windowsPathMatch) {
    const [, drive, path] = windowsPathMatch
    // Convert backslashes to forward slashes
    const normalizedPath = path.replace(/\\/g, '/')
    // Remove leading slash if present, then add it back to make it a relative URL
    const relativePath = normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath
    
    console.warn(`[HDRSystem] ⚠️ Windows file path detected: ${url}`)
    console.log(`[HDRSystem] Normalized to relative URL: ${relativePath}`)
    
    return relativePath
  }
  
  // Handle file:// URLs
  if (url.startsWith('file://')) {
    // Extract path from file:// URL
    try {
      const urlObj = new URL(url)
      let path = urlObj.pathname
      // On Windows, file:// URLs have an extra leading slash (file:///D:/path)
      // Remove it if it's a Windows drive path
      const windowsDriveMatch = path.match(/^\/([A-Za-z]):\/(.+)$/i)
      if (windowsDriveMatch) {
        const [, drive, rest] = windowsDriveMatch
        path = '/' + rest.replace(/\\/g, '/')
      }
      console.warn(`[HDRSystem] ⚠️ file:// URL detected: ${url}`)
      console.log(`[HDRSystem] Normalized to relative URL: ${path}`)
      return path
    } catch (e) {
      console.error(`[HDRSystem] Failed to parse file:// URL: ${url}`, e)
      return url
    }
  }
  
  // Already a relative URL, return as-is
  return url
}

/**
 * HDR System - Loads and applies HDR/EXR environment maps
 * Based on Three.js examples: https://threejs.org/examples/#webgl_materials_envmaps_groundprojected
 */
export class HDRSystem {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private config: HDRSystemConfig
  private previousShadowPlaneVisible: boolean | null = null
  
  // Loaders
  private rgbeLoader: RGBELoader | null = null
  private exrLoader: EXRLoader | null = null
  private ktx2Loader: KTX2Loader | null = null
  
  // Textures
  private originalHdrTexture: THREE.DataTexture | null = null
  private pmremEnvMap: THREE.Texture | null = null
  private defaultEnvTexture: THREE.Texture | null = null
  
  // Store original clear color to restore when HDR is disabled
  private originalClearColor: THREE.Color | null = null
  private originalClearAlpha: number = 1
  
  // PMREM Generator (reused) - now managed by EnvironmentManager
  private pmremGenerator: THREE.PMREMGenerator | null = null
  private envManager: EnvironmentManager
  
  // Ground projection utility (Three.js official approach)
  private groundProjection: GroundProjectionResult | null = null
  
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, config: HDRSystemConfig) {
    this.scene = scene
    this.renderer = renderer
    this.config = config
    if (this.config.rotationAzimuth === undefined) {
      this.config.rotationAzimuth = 0
    }
    if (this.config.rotationElevation === undefined) {
      this.config.rotationElevation = 0
    }
    if (this.config.backgroundVisible === undefined) {
      this.config.backgroundVisible = true
    }
    
    // Initialize loaders
    this.rgbeLoader = new RGBELoader()
    this.exrLoader = new EXRLoader()
    
    // Initialize KTX2 loader for FastHDR support
    // According to https://cloud.needle.tools/hdris, use Needle's CDN for best compatibility
    // with FastHDR files (UASTC HDR 4x4 format)
    try {
      this.ktx2Loader = new KTX2Loader()
      
      // According to https://cloud.needle.tools/hdris, use Needle's CDN with basis2/ path
      // Needle's documented version is 0.179.1 - use that first for FastHDR compatibility
      // The transcoder is compatible across Three.js versions, so version matching isn't critical
      const needleVersion = '0.179.1' // Needle's documented version (from their example)
      const threeVersion = '0.181.1' // Our Three.js version from package.json
      
      // Use Needle's documented version first (most likely to work with their FastHDR files)
      // If it fails (404/CORS), fallback will try Three.js CDN and local files
      const transcoderPath = `https://cdn.needle.tools/static/three/${needleVersion}/basis2/`
      this.ktx2Loader.setTranscoderPath(transcoderPath)
      console.log('[HDRSystem] Using Needle CDN transcoder path (basis2/):', transcoderPath)
      console.log('[HDRSystem] This is Needle\'s documented version (0.179.1) for FastHDR compatibility')
      console.log('[HDRSystem] Note: If this fails due to CORS/404, fallback paths will be tried automatically')
      
      this.ktx2Loader.detectSupport(renderer)
      
      // Pre-load the transcoder to ensure it's ready before first use
      // This helps avoid "Unsupported vkFormat" errors
      this.preloadTranscoder().catch(err => {
        console.warn('[HDRSystem] Transcoder preload failed (will retry on first load):', err)
      })
      
      // Log transcoder configuration for debugging
      console.log('[HDRSystem] KTX2Loader initialized:', {
        transcoderPath: transcoderPath,
        renderer: renderer ? 'available' : 'not available',
        note: 'FastHDR files from Needle Cloud use UASTC HDR 4x4 format'
      })
      
      // Verify transcoder files are accessible (async check)
      if (transcoderPath.startsWith('http')) {
        // For CDN paths, verify files are accessible
        const transcoderJS = transcoderPath + 'basis_transcoder.js'
        fetch(transcoderJS, { method: 'HEAD' })
          .then(response => {
            if (response.ok) {
              console.log('[HDRSystem] ✅ Transcoder JS file is accessible:', transcoderJS)
            } else {
              console.warn('[HDRSystem] ⚠️ Transcoder JS file not accessible:', transcoderJS, 'Status:', response.status)
            }
          })
          .catch(error => {
            console.warn('[HDRSystem] ⚠️ Could not verify transcoder accessibility:', error)
            console.warn('[HDRSystem] This may cause "Unsupported vkFormat" errors')
          })
      }
    } catch (error) {
      console.warn('[HDRSystem] KTX2Loader initialization failed:', error)
      this.ktx2Loader = null
    }
    
    // Use centralized EnvironmentManager for PMREM and default environment
    this.envManager = EnvironmentManager.getInstance()
    this.envManager.initialize(renderer)
    this.pmremGenerator = this.envManager.getPMREMGenerator()
    
    // Get default environment from manager (reuses existing or creates new)
    try {
      this.defaultEnvTexture = this.envManager.getDefaultEnvironment()
    } catch (error) {
      console.error('[HDRSystem] Failed to get default environment:', error)
    }

    // Ground projection will be initialized when HDR is loaded
    // (it needs the envMap to be created first)
  }
  
  /**
   * Load HDR/EXR file
   */
  async loadHDR(url: string | File, onProgress?: (progress: number) => void): Promise<THREE.DataTexture> {
    return new Promise((resolve, reject) => {
      const isFile = url instanceof File
      const fileName = isFile ? url.name.toLowerCase() : url.toLowerCase()
      
      // Check file size for files
      if (isFile) {
        const fileSizeMB = url.size / 1024 / 1024
        if (fileSizeMB > 1000) {
          reject(new Error(`HDR file is too large (${fileSizeMB.toFixed(2)} MB). Files over 1GB may cause out-of-memory errors.`))
          return
        }
        if (fileSizeMB > 200) {
          console.warn(`[HDRSystem] Large HDR file detected: ${fileSizeMB.toFixed(2)} MB`)
        }
      }
      
      // Load based on file extension
      // Remove query parameters and hash from URL for extension detection
      const cleanFileName = fileName.split('?')[0].split('#')[0]
      
      console.log('[HDRSystem] File detection:', {
        original: fileName.substring(0, 100),
        cleaned: cleanFileName.substring(0, 100),
        endsWithHdr: cleanFileName.endsWith('.hdr'),
        endsWithExr: cleanFileName.endsWith('.exr'),
        endsWithKtx2: cleanFileName.endsWith('.ktx2'),
        lastChars: cleanFileName.slice(-10)
      })
      
      // FastHDR (KTX2) format - load directly without PMREM conversion needed
      if (cleanFileName.endsWith('.ktx2')) {
        console.log('[HDRSystem] Detected .ktx2 file (FastHDR), using KTX2Loader')
        this.loadFastHDRFile(url, onProgress).then(resolve).catch(reject)
      } else if (cleanFileName.endsWith('.hdr')) {
        console.log('[HDRSystem] Detected .hdr file, using RGBELoader')
        this.loadHDRFile(url, onProgress).then(resolve).catch(reject)
      } else if (cleanFileName.endsWith('.exr')) {
        console.log('[HDRSystem] Detected .exr file, using EXRLoader')
        this.loadEXRFile(url, onProgress).then(resolve).catch(reject)
      } else {
        // Try KTX2 first (FastHDR), then HDR, then EXR
        console.log('[HDRSystem] No extension detected, trying KTX2 (FastHDR) first, then HDR, then EXR')
        if (this.ktx2Loader) {
          this.loadFastHDRFile(url, onProgress)
            .then(resolve)
            .catch((ktx2Error) => {
              console.log('[HDRSystem] KTX2 loader failed, trying HDR:', ktx2Error instanceof Error ? ktx2Error.message : String(ktx2Error))
              this.loadHDRFile(url, onProgress)
                .then(resolve)
                .catch((hdrError) => {
                  console.log('[HDRSystem] HDR loader failed, trying EXR:', hdrError instanceof Error ? hdrError.message : String(hdrError))
                  this.loadEXRFile(url, onProgress).then(resolve).catch(reject)
                })
            })
        } else {
          // No KTX2 loader, try HDR first, then EXR
          this.loadHDRFile(url, onProgress)
            .then(resolve)
            .catch((hdrError) => {
              console.log('[HDRSystem] HDR loader failed, trying EXR:', hdrError instanceof Error ? hdrError.message : String(hdrError))
              this.loadEXRFile(url, onProgress).then(resolve).catch(reject)
            })
        }
      }
    })
  }
  
  /**
   * Load HDR file (RGBE format)
   */
  private loadHDRFile(url: string | File, onProgress?: (progress: number) => void): Promise<THREE.DataTexture> {
    return new Promise((resolve, reject) => {
      if (!this.rgbeLoader) {
        this.rgbeLoader = new RGBELoader()
      }
      
      // Normalize URL if it's a string (handle Windows file paths)
      let urlString: string
      if (url instanceof File) {
        urlString = URL.createObjectURL(url)
      } else {
        urlString = normalizeHDRUrl(url)
      }
      
      this.rgbeLoader.load(
        urlString,
        (texture) => {
          if (url instanceof File) {
            URL.revokeObjectURL(urlString)
          }
          
          if (!texture) {
            reject(new Error('HDR loader returned undefined texture'))
            return
          }
          
          // Ensure proper mapping
          texture.mapping = THREE.EquirectangularReflectionMapping
          // CRITICAL: Don't use flipY - we'll fix orientation using scene.environmentRotation
          // PMREMGenerator may not respect flipY, so we use rotation instead
          texture.flipY = false
          texture.needsUpdate = true
          
          resolve(texture)
        },
        (progress) => {
          if (progress.lengthComputable && onProgress) {
            onProgress((progress.loaded / progress.total) * 100)
          }
        },
        (error) => {
          if (url instanceof File) {
            URL.revokeObjectURL(urlString)
          }
          reject(error)
        }
      )
    })
  }
  
  /**
   * Load EXR file
   */
  private loadEXRFile(url: string | File, onProgress?: (progress: number) => void): Promise<THREE.DataTexture> {
    return new Promise((resolve, reject) => {
      if (!this.exrLoader) {
        this.exrLoader = new EXRLoader()
      }
      
      // Normalize URL if it's a string (handle Windows file paths)
      const fetchUrl = url instanceof File ? URL.createObjectURL(url) : normalizeHDRUrl(url)
      
      fetch(fetchUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          return response.arrayBuffer()
        })
        .then(arrayBuffer => {
          if (url instanceof File) {
            URL.revokeObjectURL(fetchUrl)
          }
          
      const result: any = this.exrLoader!.parse(arrayBuffer)
          
          if (!result || !result.data || !result.width || !result.height) {
            reject(new Error('Failed to parse EXR file - invalid data'))
            return
          }
          
          const format = result.format || THREE.RGBAFormat
          const type = result.type || THREE.FloatType
          
          const texture = new THREE.DataTexture(result.data as any, result.width, result.height, format, type)
          texture.mapping = THREE.EquirectangularReflectionMapping
          // CRITICAL: Don't use flipY - we'll fix orientation using scene.environmentRotation
          texture.flipY = false
          texture.needsUpdate = true
          
          if (result.colorSpace !== undefined) {
            ;(texture as any).colorSpace = result.colorSpace
          }
          
          resolve(texture)
        })
        .catch(error => {
          if (url instanceof File) {
            URL.revokeObjectURL(fetchUrl)
          }
          reject(error)
        })
    })
  }
  
  /**
   * Load FastHDR file (KTX2 format)
   * FastHDR files are pre-compressed KTX2 textures that load much faster
   * and use less GPU memory than traditional HDR/EXR files
   */
  private loadFastHDRFile(url: string | File, onProgress?: (progress: number) => void): Promise<THREE.DataTexture> {
    return new Promise(async (resolve, reject) => {
      if (!this.ktx2Loader) {
        reject(new Error('KTX2Loader not available. FastHDR requires KTX2 support.'))
        return
      }
      
      // Normalize URL if it's a string (handle Windows file paths)
      const urlString = url instanceof File ? URL.createObjectURL(url) : normalizeHDRUrl(url)
      
      console.log('[HDRSystem] Starting KTX2 load from:', urlString.substring(0, 100))
      
      // Inspect KTX2 file format before loading (for diagnostics)
      let formatInfo: { format?: string; isUASTC?: boolean; isETC1S?: boolean; isASTC?: boolean; isETC2?: boolean; isZstandard?: boolean; faceCount?: number; isCubemap?: boolean; error?: string } | null = null
      try {
        formatInfo = await this.inspectKTX2Format(url)
        console.log('[HDRSystem] KTX2 file format info:', formatInfo)
        
        // Early rejection for unsupported formats
        if (formatInfo.isZstandard) {
          const fileName = url instanceof File ? url.name : 'KTX2 file'
          const errorMsg = `KTX2 file uses Zstandard compression (supercompression: 2), which is NOT supported by Three.js Basis transcoder.\n\n` +
            `File: ${fileName}\n\n` +
            `The Basis transcoder only supports:\n` +
            `- UASTC (supercompression: 4) - Recommended for FastHDR\n` +
            `- ETC1S (supercompression: 1)\n\n` +
            `Note: The Basis transcoder can be compiled with Zstandard support, but the standard\n` +
            `Three.js transcoder (used by KTX2Loader) does not include it.\n\n` +
            `Solutions:\n` +
            `1. ✅ Use the original HDR/EXR file instead of the KTX2 version (recommended)\n` +
            `2. Re-encode with UASTC: toktx --uastc --uastc_rdo_q 0.5 output.ktx2 input.hdr\n` +
            `3. Check if Needle Cloud provides UASTC-encoded versions of this file\n` +
            `4. Use Needle's FastHDR files that are UASTC-encoded (not Zstandard)`
          
          console.error('[HDRSystem] ❌', errorMsg)
          reject(new Error(errorMsg))
          return
        }
        
        if (formatInfo.format && !formatInfo.isUASTC && !formatInfo.isETC1S) {
          console.warn('[HDRSystem] ⚠️ File uses unsupported format:', formatInfo.format)
          console.warn('[HDRSystem] Basis transcoder only supports UASTC (supercompression: 4) and ETC1S (supercompression: 1) formats')
          if (formatInfo.isASTC || formatInfo.isETC2) {
            console.error('[HDRSystem] ❌ File uses hardware-specific format that Basis transcoder cannot decode')
            console.error('[HDRSystem] This file needs to be re-encoded with UASTC format to work with Basis transcoder')
            const fileName = url instanceof File ? url.name : 'KTX2 file'
            reject(new Error(`KTX2 file uses unsupported format (${formatInfo.format}). Basis transcoder only supports UASTC and ETC1S formats.`))
            return
          }
        }
      } catch (err) {
        console.warn('[HDRSystem] Could not inspect KTX2 format:', err)
        // Don't reject on inspection failure - let the loader try and fail with its own error
      }
      
      // Ensure transcoder is ready before loading
      // Pre-load the transcoder if it's not already loaded
      this.ensureTranscoderReady().then(() => {
        console.log('[HDRSystem] KTX2 transcoder ready, starting texture load...')
        
        // Add timeout to catch if loader hangs
        const timeout = setTimeout(() => {
          console.error('[HDRSystem] KTX2 load timeout after 30 seconds')
          if (url instanceof File) {
            URL.revokeObjectURL(urlString)
          }
          reject(new Error('KTX2 load timeout - file may be corrupted or incompatible'))
        }, 30000)
        
        let callbackFired = false
        
        try {
          this.ktx2Loader!.load(
          urlString,
          (texture) => {
            callbackFired = true
            clearTimeout(timeout)
            console.log('[HDRSystem] KTX2Loader callback fired')
            
            if (url instanceof File) {
              URL.revokeObjectURL(urlString)
            }
            
            if (!texture) {
              console.error('[HDRSystem] KTX2 loader returned undefined texture')
              reject(new Error('KTX2 loader returned undefined texture'))
              return
            }
            
            // Check if this is a FastHDR (PMREM) file - detect from filename
            // According to Needle's example: files from their site have .pmrem.ktx2 extension
            const fileName = url instanceof File ? url.name.toLowerCase() : urlString.toLowerCase()
            const isPMREMFile = fileName.includes('.pmrem.')
            
            // Check KTX2 header to determine if it's actually a cubemap (faceCount = 6) or equirectangular (faceCount = 1)
            // The converter creates equirectangular KTX2 files (faceCount = 1), but KTX2Loader might return them as CubeTexture
            const actualIsCubemap = formatInfo?.isCubemap === true && formatInfo?.faceCount === 6
            const isEquirectangular = formatInfo?.faceCount === 1 || (!formatInfo?.isCubemap && formatInfo?.faceCount === 1)
            
            // KTX2Loader might return equirectangular textures as CubeTexture, so check the actual format
            const isCubeTexture = (texture instanceof THREE.CubeTexture || (texture as any).isCubeTexture === true) && actualIsCubemap
            
            const isPMREM = texture.mapping === THREE.CubeUVReflectionMapping || 
                           (texture as any).isPMREMTexture === true ||
                           isPMREMFile
            
            console.log('[HDRSystem] KTX2 texture loaded:', {
              textureType: texture.constructor.name,
              fileName: url instanceof File ? url.name : 'from URL',
              isPMREMFile,
              isCubeTexture,
              actualIsCubemap,
              isEquirectangular,
              faceCount: formatInfo?.faceCount,
              isPMREM,
              mapping: texture.mapping,
              format: texture.format,
              dataType: texture.type,
              colorSpace: (texture as any).colorSpace,
              image: texture.image ? (Array.isArray(texture.image) ? `CubeTexture[${texture.image.length}]` : `${texture.image.width}x${texture.image.height}`) : 'no image',
              minFilter: texture.minFilter,
              magFilter: texture.magFilter
            })
            
            // FastHDR files are pre-computed PMREM textures in CubeUV format
            // According to Needle's example code (https://cloud.needle.tools/hdris):
            // "Make sure to assign the correct mapping"
            // texture.mapping = THREE.CubeUVReflectionMapping
            // This is CRITICAL for FastHDR files from Needle Cloud
            if (isPMREM || isPMREMFile) {
              // FastHDR (PMREM) texture - MUST set CubeUV mapping (as per Needle's example)
              texture.mapping = THREE.CubeUVReflectionMapping
              console.log('[HDRSystem] ✅ FastHDR (PMREM) detected - setting CubeUVReflectionMapping')
              console.log('[HDRSystem] Following Needle example: texture.mapping = THREE.CubeUVReflectionMapping')
              console.log('[HDRSystem] FastHDR can be used for both environment and background (with backgroundBlurriness)')
              
              // Ensure proper color space for HDR (linear, not sRGB)
              if ((texture as any).colorSpace === undefined || (texture as any).colorSpace === THREE.SRGBColorSpace) {
                (texture as any).colorSpace = THREE.LinearSRGBColorSpace
              }
              
              // PMREM textures already have proper filters set by KTX2Loader
              texture.needsUpdate = true
            } else if (isEquirectangular || (texture instanceof THREE.Texture && !isCubeTexture)) {
              // Regular equirectangular KTX2 texture - set proper mapping
              // Even if KTX2Loader returns it as CubeTexture, if faceCount = 1, it's equirectangular
              console.log('[HDRSystem] ✅ Equirectangular KTX2 detected (faceCount = 1) - can be used as background')
              if (texture.mapping === THREE.UVMapping || texture.mapping === THREE.CubeReflectionMapping) {
                texture.mapping = THREE.EquirectangularReflectionMapping
              }
              texture.flipY = false
              
              // Ensure proper color space for HDR (linear, not sRGB)
              if ((texture as any).colorSpace === undefined || (texture as any).colorSpace === THREE.SRGBColorSpace) {
                (texture as any).colorSpace = THREE.LinearSRGBColorSpace
                console.log('[HDRSystem] Set KTX2 texture color space to LinearSRGBColorSpace')
              }
              
              // For compressed formats (ASTC, ETC2, etc.), don't override the filter settings
              // KTX2Loader sets appropriate filters for compressed formats
              // Only set filters if it's an uncompressed format
              const isCompressed = texture.format > 0x8C00 // Compressed formats start at 0x8C00
              if (!isCompressed) {
                // Uncompressed format - set linear filtering
                texture.minFilter = THREE.LinearFilter
                texture.magFilter = THREE.LinearFilter
              } else {
                // Compressed format - keep existing filters (usually LinearMipmapLinearFilter)
                console.log('[HDRSystem] KTX2 uses compressed format, keeping existing filter settings')
              }
              
              texture.needsUpdate = true
            } else if (isCubeTexture) {
              // Cubemap - ensure proper settings
              console.log('[HDRSystem] KTX2 loaded as cubemap - configuring for environment use')
              // Don't override filters for cubemaps - they're usually already correct
              if ((texture as any).colorSpace === undefined || (texture as any).colorSpace === THREE.SRGBColorSpace) {
                (texture as any).colorSpace = THREE.LinearSRGBColorSpace
              }
            }
            
            // Store format info in userData so we can check it later when setting background
            if (formatInfo) {
              texture.userData.ktx2FormatInfo = formatInfo
              texture.userData.isKTX2 = true
              console.log('[HDRSystem] Stored KTX2 format info in texture.userData:', formatInfo)
            }
            
            // Force texture update
            texture.needsUpdate = true
            console.log('[HDRSystem] KTX2 texture configured, resolving...')
            
            // For FastHDR, we need to return a DataTexture-like object
            // But KTX2Loader returns a Texture, which should work fine
            // However, for consistency with the rest of the system, we'll wrap it if needed
            // Note: KTX2 textures can be CompressedTexture, so we cast to Texture first, then to DataTexture
            resolve(texture as unknown as THREE.DataTexture)
          },
          (progress) => {
            if (progress.lengthComputable && onProgress) {
              onProgress((progress.loaded / progress.total) * 100)
            }
          },
          (error) => {
            callbackFired = true
            clearTimeout(timeout)
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[HDRSystem] KTX2Loader error:', error)
            console.error('[HDRSystem] Error details:', {
              message: errorMessage,
              stack: error instanceof Error ? error.stack : undefined
            })
            
            // Provide helpful error messages for common issues
            let helpfulMessage = errorMessage
            if (errorMessage.includes('Unsupported vkFormat')) {
              // Check if transcoder loaded
              const transcoder = (this.ktx2Loader as any)?.transcoder
              const transcoderPath = (this.ktx2Loader as any)?.transcoderPath || 'unknown'
              
              // Use format info from earlier inspection
              let formatInfoText = ''
              if (formatInfo && formatInfo.format) {
                formatInfoText = `\nFile format: ${formatInfo.format}`
                if (formatInfo.isZstandard) {
                  formatInfoText += '\n❌ This file uses Zstandard compression (supercompression: 2).'
                  formatInfoText += '\n   Zstandard is NOT supported by Basis transcoder - it requires a different decoder.'
                  formatInfoText += '\n   Solution: Re-encode with UASTC format: toktx --uastc --uastc_rdo_q 0.5 output.ktx2 input.hdr'
                } else if (formatInfo.isASTC || formatInfo.isETC2) {
                  formatInfoText += '\n⚠️ This format requires hardware support and is NOT supported by Basis transcoder.'
                  formatInfoText += '\n   Basis transcoder only supports UASTC (supercompression: 4) and ETC1S (supercompression: 1) formats.'
                  formatInfoText += '\n   Solution: Re-encode the file with UASTC format using: toktx --uastc --uastc_rdo_q 0.5 output.ktx2 input.hdr'
                } else if (formatInfo.isUASTC || formatInfo.isETC1S) {
                  formatInfoText += '\n✅ This format SHOULD be supported by Basis transcoder.'
                  formatInfoText += '\n   The transcoder may not be loaded properly - check console for transcoder loading errors.'
                } else {
                  formatInfoText += '\n⚠️ Unknown format - may not be supported by Basis transcoder.'
                  formatInfoText += '\n   Basis transcoder only supports UASTC (supercompression: 4) and ETC1S (supercompression: 1) formats.'
                }
              }
              
              helpfulMessage = `KTX2 file uses an unsupported format.${formatInfoText}\n\n` +
                `File: ${url instanceof File ? url.name : 'from URL'}\n` +
                `Transcoder path: ${transcoderPath}\n` +
                `Transcoder loaded: ${transcoder ? 'Yes' : 'No (this may be the issue!)'}\n\n` +
                `Possible causes:\n` +
                `1. Transcoder didn't load from CDN (CORS or network issue)\n` +
                `2. File uses hardware-specific format (ASTC/ETC2) not supported by Basis transcoder\n` +
                `3. File uses newer KTX2 format than transcoder supports\n\n` +
                `Solutions:\n` +
                `1. Check browser console for transcoder loading errors\n` +
                `2. Try refreshing the page to reload transcoder\n` +
                `3. If file is from Needle Cloud, it should work - check network tab for transcoder file requests\n` +
                `4. Use the original HDR/EXR file as fallback\n` +
                `5. Re-encode with: toktx --uastc --uastc_rdo_q 0.5 output.ktx2 input.hdr`
            } else if (errorMessage.includes('transcoder') || errorMessage.includes('basis') || errorMessage.includes('Failed to fetch')) {
              helpfulMessage = `KTX2 transcoder error. The Basis transcoder may not be loading properly.\n\n` +
                `This could be:\n` +
                `1. CORS issue preventing transcoder from loading\n` +
                `2. Network error loading transcoder files\n` +
                `3. Incorrect transcoder path\n\n` +
                `Solutions:\n` +
                `1. Check browser console for transcoder loading errors\n` +
                `2. Check Network tab to see if basis_transcoder.js/wasm are loading\n` +
                `3. Try using the original HDR/EXR file instead\n` +
                `4. If using CDN, check if it's accessible in your network`
            }
            
            if (url instanceof File) {
              URL.revokeObjectURL(urlString)
            }
            
            const enhancedError = new Error(helpfulMessage)
            if (error instanceof Error && error.stack) {
              enhancedError.stack = error.stack
            }
            reject(enhancedError)
          }
        )
      } catch (loadError) {
        callbackFired = true
        clearTimeout(timeout)
        console.error('[HDRSystem] Exception during KTX2Loader.load():', loadError)
        if (url instanceof File) {
          URL.revokeObjectURL(urlString)
        }
        reject(loadError)
      }
      }).catch((transcoderError) => {
        console.error('[HDRSystem] Failed to initialize KTX2 transcoder:', transcoderError)
        if (url instanceof File) {
          URL.revokeObjectURL(urlString)
        }
        reject(new Error(`KTX2 transcoder initialization failed: ${transcoderError instanceof Error ? transcoderError.message : String(transcoderError)}. Make sure basis_transcoder.js and basis_transcoder.wasm are available in /basis/`))
      })
    })
  }
  
  /**
   * Rotate equirectangular texture data 180 degrees (complete rotation)
   * CRITICAL: PMREMGenerator.fromEquirectangular() ignores texture.rotation property
   * We must manually rotate the texture data before passing to PMREM generator
   * 
   * Complete 180° rotation formula:
   * - For pixel at (x, y), rotated position is (width - 1 - x, height - 1 - y)
   * - This performs a true 180° rotation around the center point
   * - Fixes both horizontal and vertical inversion (sky/ground swap)
   */
  private rotateEquirectangularTexture(texture: THREE.DataTexture): THREE.DataTexture {
    const width = texture.image.width
    const height = texture.image.height
    const data = texture.image.data
    if (!data) {
      throw new Error('Texture image data is null')
    }
    const format = texture.format
    const type = texture.type
    
    // Create new data array for rotated texture
    const rotatedData = new (data.constructor as any)(data.length)
    
    // Complete 180° rotation: pixel at (x, y) goes to (width-1-x, height-1-y)
    // This rotates around the center point (width/2, height/2)
    const componentsPerPixel = format === THREE.RGBAFormat ? 4 : 3
    const bytesPerComponent = type === THREE.FloatType ? 4 : type === THREE.HalfFloatType ? 2 : 1
    const bytesPerPixel = componentsPerPixel * bytesPerComponent
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Complete 180° rotation: pixel at (x, y) goes to (width-1-x, height-1-y)
        // This performs a true 180° rotation around the center point
        const srcX = width - 1 - x // Rotate 180° horizontally (mirror around center)
        const srcY = height - 1 - y // Rotate 180° vertically (mirror around center)
        const srcIndex = (srcY * width + srcX) * bytesPerPixel
        const dstIndex = (y * width + x) * bytesPerPixel
        
        // Copy entire pixel (all components)
        for (let b = 0; b < bytesPerPixel; b++) {
          rotatedData[dstIndex + b] = data[srcIndex + b]
        }
      }
    }
    
    // Create new texture with rotated data
    const rotatedTexture = new THREE.DataTexture(
      rotatedData,
      width,
      height,
      format as THREE.PixelFormat,
      type
    )
    rotatedTexture.mapping = THREE.EquirectangularReflectionMapping
    rotatedTexture.flipY = false
    rotatedTexture.needsUpdate = true
    
    console.log('[HDRSystem] ✅ Texture rotated 180° (complete rotation: horizontal + vertical)')
    
    return rotatedTexture
  }

  /**
   * Generate PMREM cube map from equirectangular HDR
   * CRITICAL: PMREMGenerator.fromEquirectangular() respects texture.flipY property
   * Using flipY = true fixes the vertical inversion (sky/ground swap)
   */
  private generatePMREM(hdrTexture: THREE.DataTexture): THREE.Texture {
    console.log('[HDRSystem] Generating PMREM cube map from HDR texture', {
      width: hdrTexture.image.width,
      height: hdrTexture.image.height,
      format: hdrTexture.format,
      type: hdrTexture.type,
      flipY: hdrTexture.flipY
    })
    
    // CRITICAL: flipY is already set to true during texture loading
    // PMREMGenerator.fromEquirectangular() respects the flipY property
    // This fixes the vertical inversion (sky/ground swap) issue
    console.log('[HDRSystem] Using HDR texture with flipY=true to fix orientation')
    
    // Use PMREM generator directly - it will respect flipY
    const envMap = this.pmremGenerator!.fromEquirectangular(hdrTexture).texture
    
    console.log('[HDRSystem] ✅ PMREM generated - flipY=true applied, sky should be on top, ground on bottom')
    
    return envMap
  }
  
  /**
   * Apply HDR to scene
   */
  async applyHDR(url: string | File | null, intensity: number): Promise<void> {
    if (!url) {
      this.disableHDR()
      return
    }
    
    try {
      // Normalize URL if it's a string (handle Windows file paths)
      let normalizedUrl: string | File = url
      if (typeof url === 'string') {
        normalizedUrl = normalizeHDRUrl(url)
        if (normalizedUrl !== url) {
          console.log('[HDRSystem] URL normalized:', { original: url, normalized: normalizedUrl })
        }
      }
      
      // Check if this is a FastHDR (KTX2) file
      const isFile = normalizedUrl instanceof File
      const fileName = isFile ? (normalizedUrl as File).name.toLowerCase() : (normalizedUrl as string).toLowerCase()
      const cleanFileName = fileName.split('?')[0].split('#')[0]
      const isFastHDR = cleanFileName.endsWith('.ktx2')
      
      // Load HDR texture
      console.log('[HDRSystem] Loading HDR file...', { isFastHDR })
      let lastLoggedProgress = -1
      const hdrTexture = await this.loadHDR(normalizedUrl, (progress) => {
        // Log progress every 10% to show loading status
        const roundedProgress = Math.floor(progress / 10) * 10
        if (roundedProgress !== lastLoggedProgress) {
          console.log(`[HDRSystem] Loading progress: ${roundedProgress.toFixed(0)}%`)
          lastLoggedProgress = roundedProgress
        }
      })
      
      // For FastHDR files, check if it's a pre-computed PMREM or needs PMREM conversion
      // According to https://cloud.needle.tools/articles/fasthdr-environment-maps
      // FastHDR files are pre-computed PMREM textures in CubeUV format
      let envMap: THREE.Texture
      let isPMREMKTX2 = false
      
      if (isFastHDR && hdrTexture instanceof THREE.Texture) {
        // Check if this is a FastHDR (PMREM) file
        const isPMREM = hdrTexture.mapping === THREE.CubeUVReflectionMapping ||
                       (url instanceof File && url.name.toLowerCase().includes('.pmrem.')) ||
                       (typeof url === 'string' && url.toLowerCase().includes('.pmrem.'))
        
        if (isPMREM) {
          // FastHDR (pre-computed PMREM) - use directly for both environment and background
          // No PMREM generation needed - it's already done!
          console.log('[HDRSystem] ✅ FastHDR (PMREM) detected - using directly for environment and background')
          console.log('[HDRSystem] FastHDR files are pre-computed PMREM textures - no conversion needed')
          envMap = hdrTexture
          isPMREMKTX2 = true
          // Store the PMREM texture for background use
          this.originalHdrTexture = hdrTexture as any // PMREM can be used as background
        } else {
          // Regular KTX2 - check if it's actually a cubemap (faceCount = 6) or equirectangular (faceCount = 1)
          // Re-inspect the file to get faceCount if we don't have it
          let actualIsCubemap = false
          let faceCount = 1
          try {
            const fileFormatInfo = await this.inspectKTX2Format(url)
            actualIsCubemap = fileFormatInfo?.isCubemap === true && fileFormatInfo?.faceCount === 6
            faceCount = fileFormatInfo?.faceCount || 1
          } catch (e) {
            console.warn('[HDRSystem] Could not re-inspect KTX2 format, using texture type detection')
            // Fallback to texture type detection
            actualIsCubemap = (hdrTexture as any).isCubeTexture === true || hdrTexture instanceof THREE.CubeTexture
          }
          
          if (actualIsCubemap && faceCount === 6) {
            // Actual cubemap KTX2 (faceCount = 6) - use for environment, but can't use as background
            console.log('[HDRSystem] KTX2 file is a cubemap (faceCount = 6), using directly for environment (no PMREM conversion needed)')
            console.log('[HDRSystem] Note: Cubemap KTX2 files cannot be used as background - background will use default or be hidden')
            envMap = hdrTexture
            isPMREMKTX2 = false // Not PMREM, but also not equirectangular
          } else {
            // Equirectangular KTX2 (faceCount = 1) - can be used for background and needs PMREM for environment
            console.log('[HDRSystem] ✅ KTX2 file is equirectangular (faceCount = 1), generating PMREM cube map for environment...')
            console.log('[HDRSystem] Equirectangular KTX2 can be used as background')
            // Ensure it's treated as a DataTexture for PMREM generation
            if (hdrTexture instanceof THREE.Texture && !(hdrTexture instanceof THREE.DataTexture)) {
              // Convert to DataTexture if needed (for PMREM generation)
              const textureImage = (hdrTexture as any).image
              const imageWidth = textureImage?.width || (hdrTexture as any).image?.width || 1
              const imageHeight = textureImage?.height || (hdrTexture as any).image?.height || 1
              const dataTexture = new THREE.DataTexture(
                textureImage?.data || new Uint8Array(0),
                imageWidth,
                imageHeight,
                THREE.RGBAFormat
              )
              dataTexture.mapping = THREE.EquirectangularReflectionMapping
              dataTexture.flipY = false
              dataTexture.colorSpace = (hdrTexture as any).colorSpace || THREE.LinearSRGBColorSpace
              envMap = this.generatePMREM(dataTexture)
              this.originalHdrTexture = dataTexture
            } else {
              envMap = this.generatePMREM(hdrTexture as THREE.DataTexture)
              // Store original for background
              this.originalHdrTexture = hdrTexture as THREE.DataTexture
            }
          }
        }
      } else {
        // Regular HDR/EXR file, always needs PMREM conversion
        console.log('[HDRSystem] ✅ HDR texture loaded, generating PMREM cube map (this may take a moment)...')
        
        // Temporarily hide objects with ShaderMaterial during PMREM generation
        // ShaderMaterial instances have custom shaders that might not be compatible with PMREMGenerator
        const hiddenObjects: THREE.Object3D[] = []
        this.scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            const hasShaderMaterial = materials.some(m => m instanceof THREE.ShaderMaterial)
            if (hasShaderMaterial && object.visible) {
              object.visible = false
              hiddenObjects.push(object)
            }
          }
        })
        
        try {
          // Generate PMREM cube map
          console.log('[HDRSystem] Generating PMREM cube map from HDR texture...')
          envMap = this.generatePMREM(hdrTexture)
          console.log('[HDRSystem] ✅ PMREM cube map generated successfully')
          
          // Restore visibility after PMREM generation
          hiddenObjects.forEach(obj => {
            obj.visible = true
          })
        } catch (pmremError) {
          // Restore visibility even if PMREM generation fails
          hiddenObjects.forEach(obj => {
            obj.visible = true
          })
          throw pmremError
        }
      }
      
      // Store textures
      // For FastHDR (PMREM) files, the texture itself is the PMREM and can be used for both
      // For regular KTX2 cubemaps, we can't use them as background
      // For equirectangular KTX2, we store the original for background and PMREM for environment
      if (!isPMREMKTX2 && !isFastHDR) {
        // Regular HDR/EXR - store original for background
        this.originalHdrTexture = hdrTexture
      }
      // For FastHDR PMREM, originalHdrTexture was already set above
      this.pmremEnvMap = envMap
      console.log('[HDRSystem] HDR textures stored, setting up scene environment...', {
        isPMREMKTX2,
        isFastHDR,
        hasOriginalTexture: !!this.originalHdrTexture,
        envMapMapping: envMap.mapping
      })
        
        // MATCH WEBEXPORT: Use original equirectangular texture for scene.environment
        // Webexport uses the original texture directly, not PMREM, and materials automatically use it
        // This matches webexport's behavior where materials automatically use scene.environment
        const textureForEnvironment = this.originalHdrTexture || hdrTexture
        
        // Configure texture for scene.environment
        // Note: flipY = false for correct orientation in 3D viewer (different from webexport)
        if (textureForEnvironment instanceof THREE.DataTexture) {
          textureForEnvironment.mapping = THREE.EquirectangularReflectionMapping
          textureForEnvironment.flipY = false // Correct orientation for 3D viewer
          textureForEnvironment.center.set(0.5, 0.5)
          textureForEnvironment.needsUpdate = true
        }
        
        this.scene.environment = textureForEnvironment
        
        console.log('[HDRSystem] ✅ HDR loaded successfully, matching webexport behavior...')
        
        // MATCH WEBEXPORT: Clear explicit envMap on materials so they use scene.environment automatically
        // Webexport doesn't explicitly set mat.envMap - materials automatically use scene.environment
        // with default envMapIntensity of 1.0. This matches webexport's approach exactly.
        let clearedCount = 0
        this.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Skip GroundedSkybox and shadow plane - they don't need HDR lighting
            if (object.userData?.isGroundedSkybox || object.userData?.isShadowPlane) {
              return
            }
            
            const material = object.material
            if (Array.isArray(material)) {
              material.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  // Clear explicit envMap so material uses scene.environment automatically
                  if (mat.envMap !== null) {
                    mat.envMap = null
                    // Don't set envMapIntensity - let it use default 1.0 (matching webexport)
                    clearedCount++
                  }
                }
              })
            } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
              // Clear explicit envMap so material uses scene.environment automatically
              if (material.envMap !== null) {
                material.envMap = null
                // Don't set envMapIntensity - let it use default 1.0 (matching webexport)
                clearedCount++
              }
            }
          }
        })
        
        if (clearedCount > 0) {
          console.log(`[HDRSystem] Cleared explicit envMap on ${clearedCount} materials - they will use scene.environment automatically (matching webexport)`)
        }
        
        console.log('[HDRSystem] ✅ HDR environment map applied to scene and all materials')
        
        // CRITICAL: Ensure shadow system is still enabled after HDR application
        // HDR material updates shouldn't affect shadow rendering, but we verify to be safe
        if (this.renderer.shadowMap) {
          if (!this.renderer.shadowMap.enabled) {
            console.warn('[HDRSystem] Shadow map was disabled - re-enabling after HDR application')
            this.renderer.shadowMap.enabled = true
          }
        }
        
        // CRITICAL: Ensure all meshes still have castShadow and receiveShadow enabled after HDR application
        // Material updates shouldn't affect these, but verify to prevent shadow issues
        let shadowCheckCount = 0
        let shadowPlaneFixed = false
        
        this.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Special handling for shadow plane
            if (object.userData.isShadowPlane) {
              // CRITICAL: Shadow plane MUST receive shadows and have depthWrite = true
              if (!object.receiveShadow) {
                object.receiveShadow = true
                shadowPlaneFixed = true
              }
              if (object.castShadow) {
                object.castShadow = false // Shadow plane should not cast shadows
                shadowPlaneFixed = true
              }
              // Ensure shadow plane material has depthWrite = true
              const material = Array.isArray(object.material) ? object.material[0] : object.material
              if (material && material.depthWrite !== true) {
                material.depthWrite = true
                material.needsUpdate = true
                shadowPlaneFixed = true
              }
              return
            }
            
            // Skip helpers and system objects
            if (object.userData.isGridHelper || object.userData.isGroundedSkybox) {
              return
            }
            
            const material = Array.isArray(object.material) ? object.material[0] : object.material
            // Only check opaque materials (transparent materials shouldn't cast shadows)
            if (material && !material.transparent) {
              if (!object.castShadow) {
                object.castShadow = true
                shadowCheckCount++
              }
              if (!object.receiveShadow) {
                object.receiveShadow = true
                shadowCheckCount++
              }
              // CRITICAL: Ensure opaque materials have depthWrite = true for proper shadow occlusion
              if (material.depthWrite !== true) {
                material.depthWrite = true
                material.needsUpdate = true
                shadowCheckCount++
              }
            }
          }
        })
        if (shadowCheckCount > 0) {
          console.log(`[HDRSystem] ✅ Re-enabled shadow casting/receiving on ${shadowCheckCount} mesh(es) after HDR application`)
        }
        if (shadowPlaneFixed) {
          console.log(`[HDRSystem] ✅ Fixed shadow plane configuration after HDR application`)
        }
        
        // CRITICAL: Force shadow map update for all shadow-casting lights after HDR application
        // This ensures shadows are recalculated with correct bounds after material updates
        let shadowUpdateCount = 0
        this.scene.traverse((object) => {
          if (object instanceof THREE.DirectionalLight || 
              object instanceof THREE.SpotLight || 
              object instanceof THREE.PointLight) {
            if (object.castShadow && object.shadow) {
              object.shadow.needsUpdate = true
              shadowUpdateCount++
            }
          }
        })
        if (shadowUpdateCount > 0) {
          console.log(`[HDRSystem] ✅ Triggered shadow map update for ${shadowUpdateCount} light(s) after HDR application`)
        }
        
        // Apply ground projection if enabled
        if (this.config.groundProjection?.enabled) {
          console.log('[HDRSystem] Setting up ground projection during HDR load', {
            enabled: this.config.groundProjection.enabled,
            height: this.config.groundProjection.height,
            radius: this.config.groundProjection.radius
          })
          
          this.updateShadowPlaneVisibilityForGroundProjection(true)
          
          // Dispose existing ground projection if any
          if (this.groundProjection) {
            this.groundProjection.dispose()
            this.groundProjection = null
          }
          
          // Setup new ground projection (this will set scene.background = null)
          // CRITICAL: Use original equirectangular texture, not PMREM cube map
          // GroundedSkybox needs equirectangular to properly unwrap the projection
          // IMPORTANT: Ensure texture is in correct state for GroundedSkybox
          // GroundedSkybox expects equirectangular mapping with no rotation/flipY modifications
          hdrTexture.mapping = THREE.EquirectangularReflectionMapping
          // Reset texture rotation and center to defaults for GroundedSkybox
          // GroundedSkybox handles its own texture unwrapping, so we shouldn't modify the texture
          hdrTexture.rotation = 0
          hdrTexture.center.set(0.5, 0.5)
          hdrTexture.flipY = false // GroundedSkybox expects standard orientation
          hdrTexture.needsUpdate = true
          
          this.groundProjection = setupGroundProjectedEnv(this.scene, {
            envMap: hdrTexture,
            height: this.config.groundProjection.height,
            resolution: this.config.groundProjection.resolution,
            positionY: this.config.groundProjection.positionY,
            radius: this.config.groundProjection.radius,
            enabled: true
          })
          
          // CRITICAL: According to Three.js official GroundedSkybox example, scene.background MUST be null
          // GroundedSkybox is a FULL SPHERE that replaces scene.background entirely
          // It renders both the sky (upper hemisphere) and ground projection (lower hemisphere)
          this.scene.background = null
          
          // DEBUG: Verify ground projection is visible
          if (this.groundProjection?.skybox) {
            const skybox = this.groundProjection.skybox
            console.log('[HDRSystem] Ground projection setup complete', {
              skyboxVisible: skybox.visible,
              skyboxInScene: this.scene.children.includes(skybox),
              materialVisible: skybox.material?.visible,
              renderOrder: skybox.renderOrder,
              frustumCulled: skybox.frustumCulled,
              position: { x: skybox.position.x, y: skybox.position.y, z: skybox.position.z }
            })
          }
        } else {
          // Remove existing ground projection if disabled
          if (this.groundProjection) {
            this.groundProjection.dispose()
            this.groundProjection = null
          }
          
          this.updateShadowPlaneVisibilityForGroundProjection(false)
          
          // Set scene background (original equirectangular for display)
          // Only set background when ground projection is NOT enabled
          hdrTexture.mapping = THREE.EquirectangularReflectionMapping
          hdrTexture.needsUpdate = true
          this.scene.background = hdrTexture
          
          console.log('[HDRSystem] Ground projection not enabled')
        }

        this.applyRotationToScene(this.config.rotationAzimuth ?? 0, this.config.rotationElevation ?? 0)
        this.applyBackgroundVisibilityState(this.config.backgroundVisible ?? true)
      
      // Store original clear color before changing it (only if not already stored)
      if (!this.originalClearColor) {
        const currentClearColor = new THREE.Color()
        this.renderer.getClearColor(currentClearColor)
        this.originalClearColor = currentClearColor.clone()
        this.originalClearAlpha = this.renderer.getClearAlpha()
      }
      
      // Set clear color to transparent for HDR background
      this.renderer.setClearColor(new THREE.Color(0x000000), 0)
      
      console.log('[HDRSystem] HDR applied successfully')
    } catch (error) {
        const errorDetails = error instanceof Error ? error.message : String(error)
        const attemptedUrl = typeof url === 'string' ? url : (url instanceof File ? url.name : 'File object')
        const normalizedUrl = typeof url === 'string' ? normalizeHDRUrl(url) : 'N/A (File object)'
        console.error('[HDRSystem] ❌ Failed to apply HDR:', {
          error: errorDetails,
          attemptedUrl: attemptedUrl,
          normalizedUrl: normalizedUrl,
          urlType: url instanceof File ? 'File' : typeof url
        })
        this.disableHDR()
        throw error
      }
  }
  
  /**
   * Apply environment map to all materials
   * CRITICAL: This must work even if materials have CSM setup
   * CSM setupMaterial() modifies shaders but doesn't interfere with envMap
   * Only forces shader recompilation if envMap actually changed
   */
  private applyToMaterials(envMap: THREE.Texture, intensity: number, forceUpdate: boolean = false): void {
    let appliedCount = 0
    let updatedCount = 0
    let csmMaterialCount = 0
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // Skip GroundedSkybox and shadow plane - they don't need HDR lighting
        if (object.userData?.isGroundedSkybox || object.userData?.isShadowPlane) {
          return
        }
        
        const material = object.material
        
        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              // Check if material has CSM setup
              const hasCSM = !!(mat.userData?.csmSetup || mat.userData?.csmShadowMapUniforms)
              if (hasCSM) {
                csmMaterialCount++
              }
              
              // CRITICAL: When forceUpdate is true, always update envMap and intensity
              // This ensures all materials get HDR lighting, even if they already have an envMap
              const envMapChanged = mat.envMap !== envMap
              const currentIntensity = mat.envMapIntensity ?? 1.0
              const intensityChanged = Math.abs(currentIntensity - intensity) > 0.01
              
              if (envMapChanged || intensityChanged || forceUpdate) {
                // CRITICAL: Check for user-controlled intensity BEFORE any updates
                // This ensures user values are preserved even when forceUpdate is true
                // Use explicit check with fallback to ensure we catch the flag even if userData is partially set
                const isUserControlled = !!(mat.userData && mat.userData.userControlledEnvMapIntensity === true)
                const userIntensity = mat.userData?.userEnvMapIntensity
                
                // CRITICAL: Always set envMap to HDR environment, even if material has CSM setup
                // CSM shader modifications don't interfere with environment lighting
                // If forceUpdate is true, always update envMap to ensure it matches the HDR environment
                // BUT: Only update envMap if it's not already set to the HDR environment (avoid unnecessary updates)
                // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
                if (forceUpdate || envMapChanged) {
                  // Only update envMap if it's different (avoid breaking user-controlled materials)
                  if (mat.envMap !== envMap) {
                    materialUpdateQueue.enqueue(mat, () => {
                      mat.envMap = envMap
                      // CRITICAL: Only force shader recompilation if envMap actually changed
                      // Avoid shader recompilation on forceUpdate to prevent breaking shadow support
                      mat.needsUpdate = true
                    })
                    updatedCount++
                  }
                }
                
                // CRITICAL: Only update intensity if material doesn't have user-controlled intensity
                // If user has manually set envMapIntensity in Material Panel, preserve their value
                // This check happens AFTER envMap is set, so user-controlled materials keep their intensity
                // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
                if (!isUserControlled) {
                  // Calculate intensity based on material properties (metallic materials get 1.5x boost)
                  // Always update intensity to match HDR intensity (essential for IBL lighting)
                  // envMapIntensity controls how much ambient light materials receive from the environment
                  const finalIntensity = calculateMaterialIntensity(mat, intensity)
                  materialUpdateQueue.enqueue(mat, () => {
                    mat.envMapIntensity = finalIntensity
                  })
                } else {
                  // Material has user-controlled intensity - ALWAYS restore it
                  // This ensures user values are preserved even when HDR system updates materials
                  if (userIntensity !== undefined) {
                    materialUpdateQueue.enqueue(mat, () => {
                      mat.envMapIntensity = userIntensity
                    })
                    // Debug: Log when we restore user-controlled intensity
                    if (forceUpdate) {
                      console.log('[HDRSystem] 🔒 Preserved user-controlled envMapIntensity (array):', {
                        materialName: mat.name || 'Unnamed',
                        userIntensity,
                        currentIntensity: mat.envMapIntensity,
                        objectName: object.name || 'Unnamed'
                      })
                    }
                  } else {
                    console.warn('[HDRSystem] ⚠️ Material marked as user-controlled but userIntensity is undefined (array):', {
                      materialName: mat.name || 'Unnamed',
                      hasUserData: !!mat.userData,
                      userDataKeys: mat.userData ? Object.keys(mat.userData) : []
                    })
                  }
                }
                
                appliedCount++
              }
            }
          })
        } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          // Check if material has CSM setup
          const hasCSM = !!(material.userData?.csmSetup || material.userData?.csmShadowMapUniforms)
          if (hasCSM) {
            csmMaterialCount++
          }
          
          // CRITICAL: When forceUpdate is true, always update envMap and intensity
          // This ensures all materials get HDR lighting, even if they already have an envMap
          const envMapChanged = material.envMap !== envMap
          const currentIntensity = material.envMapIntensity ?? 1.0
          const intensityChanged = Math.abs(currentIntensity - intensity) > 0.01
          
          if (envMapChanged || intensityChanged || forceUpdate) {
            // CRITICAL: Check for user-controlled intensity BEFORE any updates
            // This ensures user values are preserved even when forceUpdate is true
            // Use explicit check with fallback to ensure we catch the flag even if userData is partially set
            const isUserControlled = !!(material.userData && material.userData.userControlledEnvMapIntensity === true)
            const userIntensity = material.userData?.userEnvMapIntensity
            
            // CRITICAL: Always set envMap to HDR environment, even if material has CSM setup
            // CSM shader modifications don't interfere with environment lighting
            // If forceUpdate is true, always update envMap to ensure it matches the HDR environment
            // BUT: Only update envMap if it's not already set to the HDR environment (avoid unnecessary updates)
            // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
            if (forceUpdate || envMapChanged) {
              // Only update envMap if it's different (avoid breaking user-controlled materials)
              if (material.envMap !== envMap) {
                materialUpdateQueue.enqueue(material, () => {
                  material.envMap = envMap
                  // CRITICAL: Only force shader recompilation if envMap actually changed
                  // Avoid shader recompilation on forceUpdate to prevent breaking shadow support
                  material.needsUpdate = true
                })
                updatedCount++
              }
            }
            
            // CRITICAL: Only update intensity if material doesn't have user-controlled intensity
            // If user has manually set envMapIntensity in Material Panel, preserve their value
            // This check happens AFTER envMap is set, so user-controlled materials keep their intensity
            // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
            if (!isUserControlled) {
              // Calculate intensity based on material properties (metallic materials get 1.5x boost)
              // Always update intensity to match HDR intensity (essential for IBL lighting)
              // envMapIntensity controls how much ambient light materials receive from the environment
              const finalIntensity = calculateMaterialIntensity(material, intensity)
              materialUpdateQueue.enqueue(material, () => {
                material.envMapIntensity = finalIntensity
              })
            } else {
              // Material has user-controlled intensity - ALWAYS restore it
              // This ensures user values are preserved even when HDR system updates materials
              if (userIntensity !== undefined) {
                materialUpdateQueue.enqueue(material, () => {
                  material.envMapIntensity = userIntensity
                })
                // Debug: Log when we restore user-controlled intensity
                if (forceUpdate) {
                  console.log('[HDRSystem] 🔒 Preserved user-controlled envMapIntensity:', {
                    materialName: material.name || 'Unnamed',
                    userIntensity,
                    currentIntensity: material.envMapIntensity,
                    objectName: object.name || 'Unnamed'
                  })
                }
              } else {
                console.warn('[HDRSystem] ⚠️ Material marked as user-controlled but userIntensity is undefined:', {
                  materialName: material.name || 'Unnamed',
                  hasUserData: !!material.userData,
                  userDataKeys: material.userData ? Object.keys(material.userData) : []
                })
              }
            }
            
            appliedCount++
          }
        }
      }
    })
    
    if (appliedCount > 0 || updatedCount > 0) {
      console.log(`[HDRSystem] ✅ Applied envMap to ${appliedCount} materials (intensity: ${intensity})${updatedCount > 0 ? ` (${updatedCount} shaders recompiled)` : ''}${csmMaterialCount > 0 ? ` (${csmMaterialCount} with CSM setup)` : ''}`)
    } else if (forceUpdate) {
      // Log even if no materials were updated (shouldn't happen with forceUpdate, but useful for debugging)
      console.warn(`[HDRSystem] ⚠️ Force update requested but no PBR materials found to update`)
      console.warn(`[HDRSystem] 💡 This usually means car materials are MeshBasicMaterial (unlit) - convert to MeshStandardMaterial for HDR lighting`)
      
      // Debug: Count material types
      let basicCount = 0
      let standardCount = 0
      let otherCount = 0
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material && !obj.userData?.isGroundedSkybox && !obj.userData?.isShadowPlane) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((mat) => {
            if (mat instanceof THREE.MeshBasicMaterial) basicCount++
            else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) standardCount++
            else otherCount++
          })
        }
      })
      console.warn(`[HDRSystem] 📊 Material breakdown: ${basicCount} MeshBasicMaterial, ${standardCount} PBR, ${otherCount} other`)
    }
  }
  
  /**
   * Reapply HDR environment map to all materials
   * Useful after loading new models or when materials are modified
   * @param forceUpdate - If true, forces update of all materials even if they already have an envMap
   *                      Use this when HDR is first loaded to ensure all materials get the HDR envMap
   */
  public reapplyToMaterials(forceUpdate: boolean = false): void {
    if (this.pmremEnvMap && this.config.intensity !== undefined) {
      // When forceUpdate is true (e.g., after HDR first loads), update all materials
      // When false (e.g., after model load), only update materials that need it
      // This prevents unnecessary shader recompilation that could break CSM
      console.log(`[HDRSystem] Reapplying HDR to all materials (forceUpdate: ${forceUpdate})`)
      this.applyToMaterials(this.pmremEnvMap, this.config.intensity, forceUpdate)
      console.log(`[HDRSystem] ✅ Reapplication complete`)
    } else {
      console.warn('[HDRSystem] ⚠️ Cannot reapply HDR: PMREM map or intensity not available')
    }
  }
  
  /**
   * Diagnostic function to check HDR lighting setup
   * Logs information about scene.environment, materials, and their envMap configuration
   */
  public diagnoseHDRLighting(): void {
    console.group('[HDRSystem] 🔍 HDR Lighting Diagnostic')
    
    // Check scene.environment
    console.log('Scene Environment:', {
      hasEnvironment: !!this.scene.environment,
      environmentType: this.scene.environment?.constructor?.name,
      isPMREM: this.scene.environment === this.pmremEnvMap
    })
    
    // Check HDR intensity
    const currentIntensity = this.config.intensity ?? 1.0
    if (currentIntensity < 1.0) {
      console.warn(`⚠️ HDR intensity is ${currentIntensity.toFixed(2)} - consider increasing to 1.0 or higher for better lighting`)
    }
    
    // Check materials
    let totalMaterials = 0
    let pbrMaterials = 0
    let materialsWithEnvMap = 0
    let materialsWithoutEnvMap = 0
    let basicMaterials = 0
    let materialsWithLowIntensity = 0
    const materialDetails: Array<{
      name: string
      type: string
      hasEnvMap: boolean
      envMapIntensity: number
      metalness: number
      roughness: number
    }> = []
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material && 
          !object.userData?.isGroundedSkybox && !object.userData?.isShadowPlane) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        
        materials.forEach((mat) => {
          totalMaterials++
          
          if (mat instanceof THREE.MeshBasicMaterial) {
            basicMaterials++
          } else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            pbrMaterials++
            
            const hasEnvMap = !!mat.envMap
            const envMapIntensity = mat.envMapIntensity ?? 0
            if (hasEnvMap) {
              materialsWithEnvMap++
              // Check if intensity is too low
              if (envMapIntensity < 0.5) {
                materialsWithLowIntensity++
              }
            } else {
              materialsWithoutEnvMap++
            }
            
            materialDetails.push({
              name: object.name || 'Unnamed',
              type: mat.constructor.name,
              hasEnvMap,
              envMapIntensity,
              metalness: mat.metalness ?? 0,
              roughness: mat.roughness ?? 1
            })
          }
        })
      }
    })
    
    console.log('Material Statistics:', {
      totalMaterials,
      pbrMaterials,
      basicMaterials,
      materialsWithEnvMap,
      materialsWithoutEnvMap,
      materialsWithLowIntensity,
      hdrIntensity: currentIntensity
    })
    
    if (materialsWithoutEnvMap > 0) {
      console.warn(`⚠️ ${materialsWithoutEnvMap} PBR materials are missing envMap - they won't receive HDR lighting!`)
      console.log('Materials without envMap:', materialDetails.filter(m => !m.hasEnvMap))
      console.log('💡 Try running: window.fixHDRLighting() to force reapply HDR to all materials')
    }
    
    if (materialsWithLowIntensity > 0) {
      console.warn(`⚠️ ${materialsWithLowIntensity} materials have low envMapIntensity (< 0.5) - they may appear dark`)
      console.log('💡 Consider increasing HDR intensity in the Lighting panel')
    }
    
    if (basicMaterials > 0) {
      console.warn(`⚠️ ${basicMaterials} MeshBasicMaterial instances found - these don't support HDR lighting!`)
      console.warn('💡 Convert them to MeshStandardMaterial for HDR lighting support')
    }
    
    if (pbrMaterials === 0) {
      console.error('❌ No PBR materials found in scene - HDR lighting cannot work!')
    }
    
    // Check if ground projection is enabled
    if (this.config.groundProjection?.enabled) {
      console.log('Ground Projection:', {
        enabled: true,
        height: this.config.groundProjection.height,
        radius: this.config.groundProjection.radius
      })
    }
    
    console.groupEnd()
  }
  
  /**
   * Force reapply HDR to all materials with shader recompilation
   * Use this if materials appear black despite HDR being loaded
   */
  public forceReapplyToAllMaterials(): void {
    if (this.pmremEnvMap && this.config.intensity !== undefined) {
      console.log('[HDRSystem] 🔄 Force reapplying HDR to ALL materials with shader recompilation...')
      this.applyToMaterials(this.pmremEnvMap, this.config.intensity, true)
      console.log('[HDRSystem] ✅ Force reapplication complete - all materials should now have HDR lighting')
    } else {
      console.warn('[HDRSystem] ⚠️ Cannot force reapply HDR: PMREM map or intensity not available')
    }
  }
  
  /**
   * Update HDR intensity (optimized - only updates intensity, no material traversal)
   */
  updateIntensity(intensity: number): void {
    this.config.intensity = intensity
    
    if (this.pmremEnvMap) {
      // Optimized: Only update envMapIntensity without setting needsUpdate
      // envMapIntensity is a uniform that doesn't require shader recompilation
      let updatedCount = 0
      const currentEnvMap = this.scene.environment // Get current scene environment
      
      this.scene.traverse((object) => {
        // Skip GroundedSkybox and shadow plane - they don't need HDR lighting
        if (object.userData?.isGroundedSkybox || object.userData?.isShadowPlane) {
          return
        }
        
        if (object instanceof THREE.Mesh) {
          const material = object.material
          
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                // Update if envMap matches PMREM map OR scene.environment (materials might reference either)
                // CRITICAL: Also check if material has user-controlled intensity - those should always be updated
                // Use explicit check with fallback to ensure we catch the flag even if userData is partially set
                const isUserControlled = !!(mat.userData && mat.userData.userControlledEnvMapIntensity === true)
                const userIntensity = mat.userData?.userEnvMapIntensity
                
                if (mat.envMap === this.pmremEnvMap || mat.envMap === currentEnvMap || isUserControlled) {
                  // CRITICAL: Only update intensity if material doesn't have user-controlled intensity
                  // If user has manually set envMapIntensity in Material Panel, preserve their value
                  // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
                  // IMPROVED: Only update if value actually changed (optimize needsUpdate)
                  // CRITICAL: Use calculateMaterialIntensity to maintain consistency with applyToMaterials
                  // This ensures metallic materials get 1.5x boost, matching the initial application
                  // Perplexity finding: needsUpdate should only be set when values change
                  if (!isUserControlled) {
                    // Calculate intensity based on material properties (metallic materials get 1.5x boost)
                    const finalIntensity = calculateMaterialIntensity(mat, intensity)
                    const currentIntensity = mat.envMapIntensity ?? 1.0
                    if (Math.abs(currentIntensity - finalIntensity) > 0.001) {
                      materialUpdateQueue.enqueue(mat, () => {
                        mat.envMapIntensity = finalIntensity
                        mat.needsUpdate = true // Only set when value changed
                      })
                      updatedCount++
                    }
                  } else {
                    // Material has user-controlled intensity - ALWAYS restore it
                    // This ensures user values are preserved even when HDR system updates materials
                    if (userIntensity !== undefined) {
                      const currentIntensity = mat.envMapIntensity ?? 1.0
                      if (Math.abs(currentIntensity - userIntensity) > 0.001) {
                        materialUpdateQueue.enqueue(mat, () => {
                          mat.envMapIntensity = userIntensity
                          mat.needsUpdate = true // Only set when value changed
                        })
                      }
                    }
                  }
                }
              }
            })
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            // Update if envMap matches PMREM map OR scene.environment (materials might reference either)
            // CRITICAL: Also check if material has user-controlled intensity - those should always be updated
            // Use explicit check with fallback to ensure we catch the flag even if userData is partially set
            const isUserControlled = !!(material.userData && material.userData.userControlledEnvMapIntensity === true)
            const userIntensity = material.userData?.userEnvMapIntensity
            
            if (material.envMap === this.pmremEnvMap || material.envMap === currentEnvMap || isUserControlled) {
              // CRITICAL: Only update intensity if material doesn't have user-controlled intensity
              // If user has manually set envMapIntensity in Material Panel, preserve their value
              // IMPROVED: Use MaterialUpdateQueue to prevent race conditions
              // CRITICAL: Use calculateMaterialIntensity to maintain consistency with applyToMaterials
              // This ensures metallic materials get 1.5x boost, matching the initial application
              if (!isUserControlled) {
                // Calculate intensity based on material properties (metallic materials get 1.5x boost)
                const finalIntensity = calculateMaterialIntensity(material, intensity)
                const currentIntensity = material.envMapIntensity ?? 1.0
                if (Math.abs(currentIntensity - finalIntensity) > 0.001) {
                  materialUpdateQueue.enqueue(material, () => {
                    material.envMapIntensity = finalIntensity
                    material.needsUpdate = true // Only set when value changed
                  })
                  updatedCount++
                }
              } else {
                // Material has user-controlled intensity - ALWAYS restore it
                // This ensures user values are preserved even when HDR system updates materials
                if (userIntensity !== undefined) {
                  materialUpdateQueue.enqueue(material, () => {
                    material.envMapIntensity = userIntensity
                  })
                }
              }
            }
          }
        }
      })
      
      // Always log to help debug intensity updates
      if (updatedCount > 0) {
        console.log(`[HDRSystem] ✅ Updated intensity to ${intensity} for ${updatedCount} materials`)
      } else {
        console.warn(`[HDRSystem] ⚠️ No materials found with envMap matching HDR environment - materials may not be receiving HDR lighting`)
      }
    }
  }

  private ensureSceneRotationTargets(): void {
    const sceneAny = this.scene as any
    if (!sceneAny.environmentRotation || !(sceneAny.environmentRotation instanceof THREE.Euler)) {
      sceneAny.environmentRotation = new THREE.Euler()
    }
    if (!sceneAny.backgroundRotation || !(sceneAny.backgroundRotation instanceof THREE.Euler)) {
      sceneAny.backgroundRotation = new THREE.Euler()
    }
  }

  private applyRotationToScene(azimuthDeg: number, elevationDeg: number): void {
    if (!Number.isFinite(azimuthDeg)) azimuthDeg = 0
    if (!Number.isFinite(elevationDeg)) elevationDeg = 0

    this.ensureSceneRotationTargets()

    const sceneAny = this.scene as any
    const normalizedAzimuth = ((azimuthDeg % 360) + 360) % 360
    const clampedElevation = THREE.MathUtils.clamp(elevationDeg, -90, 90)

    const azimuthRad = THREE.MathUtils.degToRad(normalizedAzimuth)
    const elevationRad = THREE.MathUtils.degToRad(clampedElevation)

    // Apply rotation to environment map
    // CRITICAL: Add 180° base rotation to fix inverted HDR (sky/ground swap, light from below)
    // Rotate 180° around X axis to fix vertical inversion (sky/ground swap)
    // Then add 180° around Y axis to fix horizontal inversion
    // Use 'YXZ' order: first rotate around Y (azimuth + 180°), then X (elevation + 180°)
    const baseRotationX = Math.PI // 180° around X to fix vertical flip (sky/ground)
    const baseRotationY = Math.PI // 180° around Y to fix horizontal flip
    sceneAny.environmentRotation.set(elevationRad + baseRotationX, azimuthRad + baseRotationY, 0, 'YXZ')
    sceneAny.backgroundRotation.set(elevationRad + baseRotationX, azimuthRad + baseRotationY, 0, 'YXZ')

    // CRITICAL: Only modify original texture rotation when ground projection is NOT enabled
    // When ground projection IS enabled, the texture must remain unmodified (rotation = 0)
    // GroundedSkybox handles rotation through its own material.map and skybox rotation
    if (this.originalHdrTexture && !this.config.groundProjection?.enabled) {
      // For background display, rotate the texture for user controls
      // Add 180° base rotation to fix inversion, then add user azimuth
      this.originalHdrTexture.center.set(0.5, 0.5)
      this.originalHdrTexture.rotation = Math.PI + azimuthRad // Base 180° + user azimuth
      this.originalHdrTexture.needsUpdate = true
    } else if (this.originalHdrTexture && this.config.groundProjection?.enabled) {
      // CRITICAL: When ground projection is enabled, keep texture rotation at 0
      // GroundedSkybox will handle rotation through its material.map
      if (this.originalHdrTexture.rotation !== 0) {
        this.originalHdrTexture.rotation = 0
        this.originalHdrTexture.needsUpdate = true
      }
    }

    // Safely access ground projection skybox for rotation
    // CRITICAL: GroundedSkybox uses its own texture unwrapping, so we rotate the skybox object itself
    // Do NOT modify the original texture rotation as it's shared with other systems
    if (this.groundProjection) {
      try {
        const skybox = this.groundProjection.skybox
        if (skybox && skybox.rotation) {
          // CRITICAL: Rotate the skybox object to match HDR environment rotation
          // Add 180° base rotation to fix horizontal inversion, then add user azimuth
          const baseRotationY = Math.PI // 180° base rotation to fix inversion
          skybox.rotation.set(0, azimuthRad + baseRotationY, 0)
          skybox.updateMatrixWorld(true)

          // CRITICAL: Also rotate the texture map inside GroundedSkybox's material
          // This is a separate texture reference, so it's safe to modify
          const material: any = skybox.material
          if (material?.map) {
            // Ensure texture center is correct for rotation
            material.map.center.set(0.5, 0.5)
            // Apply rotation to the material's texture map (this is GroundedSkybox's internal copy)
            material.map.rotation = Math.PI + azimuthRad // Base 180° + user azimuth
            material.map.needsUpdate = true
            // Ensure mapping is correct
            if (material.map.mapping !== THREE.EquirectangularReflectionMapping) {
              material.map.mapping = THREE.EquirectangularReflectionMapping
            }
          }
        }
      } catch (error) {
        console.warn('[HDRSystem] Error rotating ground projection skybox:', error)
        // Continue without rotating skybox
      }
    }
  }

  private applyBackgroundVisibilityState(visible: boolean): void {
    this.config.backgroundVisible = visible

    // Check if ground projection is enabled and skybox exists
    if (this.config.groundProjection?.enabled && this.groundProjection) {
      try {
        // Safely access skybox - it might be disposed or not exist
        const skybox = this.groundProjection.skybox
        if (skybox && skybox.visible !== undefined) {
          // CRITICAL: According to Three.js official GroundedSkybox example:
          // When GroundedSkybox is enabled, scene.background MUST be null
          // GroundedSkybox is a FULL SPHERE that renders both sky (upper hemisphere) and ground (lower hemisphere)
          // Setting scene.background would create a double 360 HDR rendering
          if (visible) {
            // Show GroundedSkybox (it handles both sky and ground projection)
            skybox.visible = true
            // CRITICAL: Must set scene.background = null (GroundedSkybox replaces it entirely)
            this.scene.background = null
            console.log('[HDRSystem] Ground projection enabled: GroundedSkybox visible, scene.background = null (GroundedSkybox replaces it)')
          } else {
            // Hide GroundedSkybox
            skybox.visible = false
            // When hidden, we can optionally show normal background, but keep it null for now
            this.scene.background = null
            console.log('[HDRSystem] Ground projection: GroundedSkybox hidden, scene.background = null')
          }
          return
        } else {
          console.warn('[HDRSystem] Ground projection skybox not available, falling back to background')
        }
      } catch (error) {
        console.error('[HDRSystem] Error accessing ground projection skybox:', error)
        // Fall through to background handling
      }
    }

    // Handle background visibility when ground projection is not enabled or failed
    if (!visible) {
      this.scene.background = null
      console.log('[HDRSystem] HDR background hidden')
      return
    }

    // Set background texture
    // According to https://cloud.needle.tools/articles/fasthdr-environment-maps
    // FastHDR (PMREM) textures with CubeUVReflectionMapping CAN be used as backgrounds
    // They work with backgroundBlurriness for efficient blurring
    if (this.originalHdrTexture) {
      try {
        // Check if it's a FastHDR (PMREM) texture - these CAN be used as backgrounds
        const isPMREM = this.originalHdrTexture.mapping === THREE.CubeUVReflectionMapping
        
        // Check if it's a regular cubemap (cannot be used as background)
        const isCubeTexture = this.originalHdrTexture instanceof THREE.CubeTexture || 
                             ((this.originalHdrTexture as any).isCubeTexture === true && !isPMREM)
        
        if (isCubeTexture && !isPMREM) {
          console.warn('[HDRSystem] Cannot use regular cubemap KTX2 as background, falling back to default environment')
          console.warn('[HDRSystem] Note: FastHDR (PMREM) textures CAN be used as backgrounds - this appears to be a regular cubemap')
          if (this.defaultEnvTexture) {
            this.scene.background = this.defaultEnvTexture
            console.log('[HDRSystem] Using default environment texture as background (KTX2 is regular cubemap)')
          } else {
            this.scene.background = null
          }
          return
        }
        
        if (isPMREM) {
          // FastHDR (PMREM) - can be used directly as background
          // Keep CubeUVReflectionMapping - don't change it!
          console.log('[HDRSystem] ✅ FastHDR (PMREM) texture - can be used as background')
          console.log('[HDRSystem] Tip: Use scene.backgroundBlurriness for efficient blurring')
          // PMREM textures should keep their CubeUVReflectionMapping
          // Don't change the mapping for PMREM textures
        } else {
          // Equirectangular texture - ensure proper mapping for background
          if (this.originalHdrTexture.mapping !== THREE.EquirectangularReflectionMapping) {
            this.originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
          }
        }
        
        // Log texture details for debugging
        console.log('[HDRSystem] Setting background texture:', {
          textureType: this.originalHdrTexture.constructor.name,
          format: this.originalHdrTexture.format,
          dataType: this.originalHdrTexture.type,
          mapping: this.originalHdrTexture.mapping,
          colorSpace: (this.originalHdrTexture as any).colorSpace,
          image: this.originalHdrTexture.image ? (this.originalHdrTexture.image.width ? `${this.originalHdrTexture.image.width}x${this.originalHdrTexture.image.height}` : 'has image') : 'no image',
          minFilter: this.originalHdrTexture.minFilter,
          magFilter: this.originalHdrTexture.magFilter
        })
        
        // Force texture update and ensure it's uploaded to GPU
        this.originalHdrTexture.needsUpdate = true
        
        // For compressed formats, ensure the texture is properly initialized
        // Compressed formats need to be transcoded by the GPU before use
        // Check if format is compressed (compressed formats start at 0x8C00)
        // Also check if texture doesn't have accessible pixel data (compressed textures don't have image.data)
        const formatValue = this.originalHdrTexture.format as number
        const isCompressed = formatValue >= 0x8C00 || 
                           (formatValue >= 0x9274 && formatValue <= 0x927F) || // ETC2
                           (formatValue >= 0x93B0 && formatValue <= 0x93FF) || // ASTC
                           formatValue === 0x8C4C || // UASTC
                           formatValue === 0x8C4D // ETC1S
        const isPMREMBackground = this.originalHdrTexture.mapping === THREE.CubeUVReflectionMapping
        
        // IMPORTANT: FastHDR (PMREM) textures with CubeUVReflectionMapping CAN be used directly as backgrounds
        // Even if compressed, they work because they're designed for this use case
        // Only equirectangular compressed textures need extraction
        // Check if this is a KTX2 texture (from KTX2Loader) - check userData first, regardless of texture type
        // KTX2Loader may return different texture types, but we can identify them by userData
        const isKTX2Texture = !!(this.originalHdrTexture.userData.ktx2FormatInfo || 
                                 this.originalHdrTexture.userData.isKTX2)
        
        // Determine if it's equirectangular or cubemap from header (if available)
        const isEquirectangularFromHeader = this.originalHdrTexture.userData.ktx2FormatInfo?.faceCount === 1
        const isCubeTextureFromHeader = this.originalHdrTexture.userData.ktx2FormatInfo?.faceCount === 6
        
        // Check if the texture has accessible pixel data
        // Even if it's a DataTexture, KTX2 textures may still be compressed internally
        const isDataTexture = this.originalHdrTexture instanceof THREE.DataTexture
        const hasImageData = isDataTexture && 
                           this.originalHdrTexture.image &&
                           (this.originalHdrTexture.image.data instanceof Uint8Array || 
                            this.originalHdrTexture.image.data instanceof Float32Array)
        
        // For equirectangular KTX2 textures that are not PMREM, we need extraction
        // Even if it appears to have image.data, KTX2 textures from KTX2Loader are compressed
        // and may cause WebGL errors when used directly as background
        // The WebGL error "texSubImage2D: ArrayBufferView not big enough" indicates compression issues
        const needsExtraction = !isPMREMBackground && 
                               this.renderer && 
                               isKTX2Texture &&
                               isEquirectangularFromHeader && // Must be equirectangular (faceCount = 1)
                               !isCubeTextureFromHeader // Must not be a cubemap
        
        console.log('[HDRSystem] Background texture analysis:', {
          isDataTexture,
          hasImageData,
          isKTX2Texture,
          isPMREMBackground,
          isEquirectangularFromHeader,
          isCubeTextureFromHeader,
          needsExtraction,
          hasUserData: !!this.originalHdrTexture.userData.ktx2FormatInfo,
          imageType: this.originalHdrTexture.image ? (this.originalHdrTexture.image.constructor.name) : 'no image',
          hasImageDataProp: !!(this.originalHdrTexture.image && this.originalHdrTexture.image.data)
        })
        
        if (needsExtraction) {
          console.warn('[HDRSystem] ⚠️ Compressed format detected for background - will extract to uncompressed texture')
          console.log('[HDRSystem] Compressed texture details:', {
            format: this.originalHdrTexture.format,
            type: this.originalHdrTexture.type,
            width: this.originalHdrTexture.image?.width,
            height: this.originalHdrTexture.image?.height,
            mapping: this.originalHdrTexture.mapping
          })
          
          // Store reference to compressed texture for extraction
          const compressedTexture = this.originalHdrTexture
          
          // Wait for multiple frames to ensure texture is fully transcoded and uploaded to GPU
          let frameCount = 0
          const maxFrames = 5 // Increased wait time
          
          const extractTexture = () => {
            frameCount++
            
            // Wait a few frames to ensure the compressed texture is fully transcoded
            if (frameCount < maxFrames) {
              requestAnimationFrame(extractTexture)
              return
            }
            
            try {
              const width = compressedTexture.image?.width || 4096
              const height = compressedTexture.image?.height || 2048
              
              console.log('[HDRSystem] Extracting texture data...', { 
                width, 
                height, 
                format: compressedTexture.format,
                frameCount 
              })
              
              // Ensure the compressed texture is uploaded to GPU
              compressedTexture.needsUpdate = true
              
              // Force the renderer to upload the texture
              const gl = this.renderer!.getContext() as WebGL2RenderingContext
              if (gl) {
                const textureProperties = this.renderer!.properties.get(compressedTexture) as any
                if (textureProperties && textureProperties.__webglTexture) {
                  console.log('[HDRSystem] Compressed texture is uploaded to GPU')
                }
              }
              
              // Create a render target to extract the texture data
              const renderTarget = new THREE.WebGLRenderTarget(width, height, {
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                colorSpace: THREE.LinearSRGBColorSpace
              })
              
              // Create a scene with a fullscreen quad to render the texture
              const tempScene = new THREE.Scene()
              const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
              const geometry = new THREE.PlaneGeometry(2, 2)
              const material = new THREE.MeshBasicMaterial({
                map: compressedTexture,
                side: THREE.DoubleSide
              })
              const quad = new THREE.Mesh(geometry, material)
              tempScene.add(quad)
              
              // Render the texture to the render target multiple times to ensure transcoding
              this.renderer!.setRenderTarget(renderTarget)
              for (let i = 0; i < 3; i++) {
                this.renderer!.render(tempScene, tempCamera)
              }
              this.renderer!.setRenderTarget(null)
              
              // Wait one more frame before reading pixels
              requestAnimationFrame(() => {
                try {
                  // Read the pixels from the render target
                  const pixels = new Uint8Array(width * height * 4)
                  this.renderer!.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)
                  
                  // Validate that we got actual data (not all white/black)
                  let nonWhitePixels = 0
                  let nonBlackPixels = 0
                  let sampleCount = 0
                  const sampleStep = Math.max(1, Math.floor(pixels.length / 10000)) // Sample ~10k pixels
                  
                  for (let i = 0; i < pixels.length; i += sampleStep * 4) {
                    const r = pixels[i]
                    const g = pixels[i + 1]
                    const b = pixels[i + 2]
                    sampleCount++
                    if (r < 250 || g < 250 || b < 250) nonWhitePixels++
                    if (r > 5 || g > 5 || b > 5) nonBlackPixels++
                  }
                  
                  const avgR = pixels.slice(0, Math.min(1000, pixels.length)).reduce((sum, val, idx) => idx % 4 === 0 ? sum + val : sum, 0) / (sampleCount / 4)
                  
                  console.log('[HDRSystem] Extracted pixel validation:', {
                    totalPixels: pixels.length / 4,
                    sampledPixels: sampleCount,
                    nonWhitePixels,
                    nonBlackPixels,
                    avgR: avgR.toFixed(2),
                    isValid: nonWhitePixels > 100 && nonBlackPixels > 100 && avgR < 250
                  })
                  
                  if (nonWhitePixels < 100 || nonBlackPixels < 100 || avgR > 250) {
                    console.error('[HDRSystem] ❌ Extracted pixels appear to be invalid (mostly white) - compressed texture extraction failed')
                    console.error('[HDRSystem] ⚠️ LIMITATION: Compressed KTX2 textures cannot be used as scene backgrounds in Three.js')
                    console.warn('[HDRSystem] 💡 SOLUTION: Use the original HDR/EXR file for the background, or convert to uncompressed KTX2 format')
                    console.warn('[HDRSystem] The KTX2 file will still work for environment maps (reflections), but not for backgrounds')
                    // Fall back to default environment
                    if (this.defaultEnvTexture) {
                      this.scene.background = this.defaultEnvTexture
                      console.log('[HDRSystem] Using default environment as background (compressed KTX2 cannot be used)')
                    } else {
                      this.scene.background = null
                    }
                    renderTarget.dispose()
                    geometry.dispose()
                    material.dispose()
                    return
                  }
                  
                  // Create an uncompressed DataTexture from the pixels
                  const uncompressedTexture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
                  uncompressedTexture.mapping = THREE.EquirectangularReflectionMapping
                  uncompressedTexture.colorSpace = THREE.LinearSRGBColorSpace
                  uncompressedTexture.flipY = false
                  uncompressedTexture.minFilter = THREE.LinearFilter
                  uncompressedTexture.magFilter = THREE.LinearFilter
                  uncompressedTexture.needsUpdate = true
                  
                  // Clean up
                  renderTarget.dispose()
                  geometry.dispose()
                  material.dispose()
                  
                  // Use the uncompressed texture for background and store it
                  this.originalHdrTexture = uncompressedTexture
                  this.scene.background = uncompressedTexture
                  console.log('[HDRSystem] ✅ Created uncompressed texture from compressed KTX2 for background', {
                    width,
                    height,
                    pixelDataSize: pixels.length,
                    format: uncompressedTexture.format
                  })
                } catch (readError) {
                  console.error('[HDRSystem] Failed to read pixels from render target:', readError)
                  renderTarget.dispose()
                  geometry.dispose()
                  material.dispose()
                  if (this.defaultEnvTexture) {
                    this.scene.background = this.defaultEnvTexture
                  }
                }
              })
            } catch (extractError) {
              console.error('[HDRSystem] Failed to extract uncompressed texture from compressed KTX2:', extractError)
              console.warn('[HDRSystem] Background may appear white - compressed format not supported')
              // Fall back to default environment
              if (this.defaultEnvTexture) {
                this.scene.background = this.defaultEnvTexture
              }
            }
          }
          
          // Start extraction after a few frames
          requestAnimationFrame(extractTexture)
          
          // Don't set background yet - wait for extraction
          // Set a temporary background or leave it as default
          if (this.defaultEnvTexture) {
            this.scene.background = this.defaultEnvTexture
          }
          return
        }
        
        // FastHDR (PMREM) textures can be used directly as background, even if compressed
        // According to https://cloud.needle.tools/articles/fasthdr-environment-maps
        if (isPMREMBackground) {
          this.scene.background = this.originalHdrTexture
          console.log('[HDRSystem] ✅ FastHDR (PMREM) background set successfully')
          console.log('[HDRSystem] Tip: Use scene.backgroundBlurriness for efficient blurring')
        } else if (isCompressed && !hasImageData) {
          // Compressed texture - extraction will set background asynchronously
          // Don't set background here - wait for extraction to complete
          console.log('[HDRSystem] ⏳ Compressed texture detected - extraction will set background asynchronously')
          // The extraction code below will set this.scene.background when done
          return // Exit early - extraction will handle background setting
        } else {
          // Set background - uncompressed equirectangular texture can be used directly
          this.scene.background = this.originalHdrTexture
          console.log('[HDRSystem] ✅ HDR background set successfully (equirectangular texture)')
        }
        
        // Force the renderer to recognize the texture change
        // This is important for compressed formats that need GPU transcoding
        if (this.renderer) {
          // Mark texture for upload on next render
          this.originalHdrTexture.needsUpdate = true
          // The renderer will upload it on the next frame automatically
        }
        
        // Verify it was set
        if (this.scene.background === this.originalHdrTexture) {
          console.log('[HDRSystem] ✅ HDR background set successfully (equirectangular texture)')
          if (isCompressed) {
            console.warn('[HDRSystem] ⚠️ WARNING: Compressed format may not render as background. If background appears white, the KTX2 file may need to be converted to an uncompressed format or use a different converter.')
            console.log('[HDRSystem] Note: Compressed format will be transcoded by GPU on next render')
          }
        } else {
          console.warn('[HDRSystem] ⚠️ Background texture may not have been set correctly')
        }
      } catch (error) {
        console.error('[HDRSystem] Error setting HDR background:', error)
        // Fall back to default environment if available
        if (this.defaultEnvTexture) {
          this.scene.background = this.defaultEnvTexture
        }
      }
    } else if (this.defaultEnvTexture) {
      // For cubemap KTX2 files, use default environment as background
      this.scene.background = this.defaultEnvTexture
      console.log('[HDRSystem] Using default environment texture as background (KTX2 is cubemap, cannot be used as background)')
    } else {
      // No background available - set to null/transparent
      this.scene.background = null
      console.warn('[HDRSystem] No equirectangular HDR texture available for background (KTX2 may be cubemap format)')
    }
  }

  updateRotation(azimuthDeg: number, elevationDeg: number): void {
    this.config.rotationAzimuth = azimuthDeg
    this.config.rotationElevation = elevationDeg
    this.applyRotationToScene(azimuthDeg, elevationDeg)
  }

  updateBackgroundVisibility(visible: boolean): void {
    this.applyBackgroundVisibilityState(visible)
  }

  /**
   * Update ground projection settings
   */
  updateGroundProjection(config: Partial<GroundProjectionConfig>): void {
    if (!this.config.groundProjection) {
      this.config.groundProjection = { enabled: false }
    }
    
    const wasEnabled = this.config.groundProjection.enabled
    const oldHeight = this.config.groundProjection.height
    const oldRadius = this.config.groundProjection.radius
    const oldPositionY = this.config.groundProjection.positionY
    
    this.config.groundProjection = { ...this.config.groundProjection, ...config }
    
    // Only log when enabled state changes or on first setup
    if (wasEnabled !== this.config.groundProjection.enabled || !this.groundProjection) {
      console.log('[HDRSystem] updateGroundProjection called', { 
        enabled: this.config.groundProjection.enabled,
        height: this.config.groundProjection.height,
        radius: this.config.groundProjection.radius,
        hasPMREM: !!this.pmremEnvMap,
        hasGroundProjection: !!this.groundProjection
      })
    }
    
    if (!this.pmremEnvMap) {
      console.log('[HDRSystem] Ground projection enabled but HDR not loaded yet. Settings will be applied when HDR loads.')
      return
    }
    
    if (this.config.groundProjection.enabled) {
      this.updateShadowPlaneVisibilityForGroundProjection(true)
        // If enabled state changed, setup new ground projection
        if (wasEnabled !== this.config.groundProjection.enabled) {
          console.log('[HDRSystem] Ground projection enabled, setting up')
          if (this.groundProjection) {
            this.groundProjection.dispose()
          }
          // CRITICAL: Use original equirectangular texture, not PMREM cube map
          // GroundedSkybox needs equirectangular to properly unwrap the projection
          // IMPORTANT: Ensure texture is in correct state for GroundedSkybox
          if (!this.originalHdrTexture) {
            console.error('[HDRSystem] Cannot setup ground projection: original HDR texture not available')
            return
          }
          // Reset texture state to defaults for GroundedSkybox
          this.originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
          this.originalHdrTexture.rotation = 0
          this.originalHdrTexture.center.set(0.5, 0.5)
          this.originalHdrTexture.flipY = false
          this.originalHdrTexture.needsUpdate = true
          
          this.groundProjection = setupGroundProjectedEnv(this.scene, {
            envMap: this.originalHdrTexture,
            height: this.config.groundProjection.height,
            radius: this.config.groundProjection.radius,
            enabled: true
          })
      } else if (this.groundProjection) {
        // If only height/radius/resolution/positionY changed, update or recreate
        const newHeight = this.config.groundProjection.height ?? 15
        const newRadius = this.config.groundProjection.radius ?? 100
        const newResolution = this.config.groundProjection.resolution ?? 128
        const newPositionY = this.config.groundProjection.positionY ?? 0
        const heightChanged = oldHeight !== newHeight
        const radiusChanged = oldRadius !== newRadius
        const positionYChanged = oldPositionY !== newPositionY
        
        // Validate values before updating
        if (newHeight <= 0 || newRadius <= 0) {
          console.warn('[HDRSystem] Invalid ground projection values, skipping update:', { height: newHeight, radius: newRadius })
          return
        }
        
        if (radiusChanged || this.config.groundProjection.resolution !== undefined) {
          // Radius or resolution change requires recreating the skybox
          try {
            this.groundProjection.recreate(newHeight, newRadius, newResolution, newPositionY)
          } catch (error) {
            console.error('[HDRSystem] Error recreating ground projection:', error)
            // Try to recover by recreating from scratch
            try {
              if (this.originalHdrTexture) {
                this.groundProjection.dispose()
                // Reset texture state to defaults for GroundedSkybox
                this.originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
                this.originalHdrTexture.rotation = 0
                this.originalHdrTexture.center.set(0.5, 0.5)
                this.originalHdrTexture.flipY = false
                this.originalHdrTexture.needsUpdate = true
                
                this.groundProjection = setupGroundProjectedEnv(this.scene, {
                  envMap: this.originalHdrTexture,
                  height: newHeight,
                  radius: newRadius,
                  resolution: newResolution,
                  positionY: newPositionY,
                  enabled: true
                })
              }
            } catch (recoverError) {
              console.error('[HDRSystem] Failed to recover ground projection:', recoverError)
            }
          }
        } else if (heightChanged || positionYChanged) {
          // Height or positionY can be updated without recreating
          try {
            const newPositionY = this.config.groundProjection.positionY ?? 0
            this.groundProjection.update(newHeight, undefined, newPositionY)
            console.log('[HDRSystem] Updated ground projection position Y:', newPositionY)
          } catch (error) {
            console.error('[HDRSystem] Error updating ground projection height:', error)
          }
        }
      } else {
        // Ground projection should be enabled but doesn't exist yet
        console.log('[HDRSystem] Setting up ground projection')
        // CRITICAL: Use original equirectangular texture, not PMREM cube map
        // GroundedSkybox needs equirectangular to properly unwrap the projection
        // IMPORTANT: Ensure texture is in correct state for GroundedSkybox
        if (!this.originalHdrTexture) {
          console.error('[HDRSystem] Cannot setup ground projection: original HDR texture not available')
          return
        }
        // Reset texture state to defaults for GroundedSkybox
        this.originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
        this.originalHdrTexture.rotation = 0
        this.originalHdrTexture.center.set(0.5, 0.5)
        this.originalHdrTexture.flipY = false
        this.originalHdrTexture.needsUpdate = true
        
        this.groundProjection = setupGroundProjectedEnv(this.scene, {
          envMap: this.originalHdrTexture,
          height: this.config.groundProjection.height,
          radius: this.config.groundProjection.radius,
          enabled: true
        })
      }

      this.applyRotationToScene(this.config.rotationAzimuth ?? 0, this.config.rotationElevation ?? 0)
      this.applyBackgroundVisibilityState(this.config.backgroundVisible ?? true)
    } else {
      this.updateShadowPlaneVisibilityForGroundProjection(false)
      // Disable ground projection
      console.log('[HDRSystem] Disabling ground projection')
      if (this.groundProjection) {
        this.groundProjection.toggle(false)
      }
      
      // Restore HDR background when ground projection is disabled
      if (this.originalHdrTexture) {
        this.originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
        this.originalHdrTexture.needsUpdate = true
        this.scene.background = this.originalHdrTexture
      }

      this.applyRotationToScene(this.config.rotationAzimuth ?? 0, this.config.rotationElevation ?? 0)
      this.applyBackgroundVisibilityState(this.config.backgroundVisible ?? true)
    }
  }
  
  /**
   * Disable HDR and restore default environment
   */
  disableHDR(): void {
    this.updateShadowPlaneVisibilityForGroundProjection(false)

    // Remove ground projection
    if (this.groundProjection) {
      this.groundProjection.dispose()
      this.groundProjection = null
    }
    
    // Clear HDR textures
    if (this.originalHdrTexture) {
      this.originalHdrTexture.dispose()
      this.originalHdrTexture = null
    }
    
    if (this.pmremEnvMap) {
      this.pmremEnvMap.dispose()
      this.pmremEnvMap = null
    }
    
    // Clear scene
    this.scene.background = null
    this.scene.environment = null
    
    // Restore default environment
    // CRITICAL: Use higher intensity for default environment to match HDR brightness
    // Default RoomEnvironment is much dimmer than HDR textures, so we need to boost it
    // to maintain visual consistency. HDR textures are typically 2-3x brighter than
    // procedural environments. We use a multiplier based on the HDR intensity that was
    // being used, or default to 2.0x if HDR intensity wasn't set.
    if (this.defaultEnvTexture) {
      this.scene.environment = this.defaultEnvTexture
      // Calculate default environment intensity to match HDR brightness
      // Use 2.0x multiplier of HDR intensity (or 2.0 if HDR intensity was 1.0)
      // This compensates for default environment being dimmer than HDR textures
      const hdrIntensity = this.config.intensity ?? 1.0
      const defaultEnvIntensity = hdrIntensity * 2.0
      this.applyToMaterials(this.defaultEnvTexture, defaultEnvIntensity)
      console.log('[HDRSystem] Applied default environment with boosted intensity:', defaultEnvIntensity, '(HDR was', hdrIntensity + ') to match HDR brightness')
    }

    this.config.rotationAzimuth = 0
    this.config.rotationElevation = 0
    this.config.backgroundVisible = true
    this.applyRotationToScene(0, 0)
    this.applyBackgroundVisibilityState(true)
    
    // Restore original clear color to maintain color consistency
    if (this.originalClearColor) {
      this.renderer.setClearColor(this.originalClearColor, this.originalClearAlpha)
      console.log('[HDRSystem] Restored original clear color:', {
        color: `#${this.originalClearColor.getHexString()}`,
        alpha: this.originalClearAlpha
      })
    } else {
      // Fallback to default dark gray if original wasn't stored
      this.renderer.setClearColor(new THREE.Color(0x1a1a1a), 1)
      console.log('[HDRSystem] Using default clear color (original not stored)')
    }
    
    console.log('[HDRSystem] HDR disabled, default environment restored')
  }
  
  /**
   * Get current HDR texture
   */
  getOriginalTexture(): THREE.DataTexture | null {
    return this.originalHdrTexture
  }
  
  /**
   * Get PMREM environment map
   */
  getPMREMMap(): THREE.Texture | null {
    return this.pmremEnvMap
  }
  
  /**
   * Get current HDR intensity
   * Useful for applying correct envMapIntensity to materials loaded after HDR
   */
  getIntensity(): number {
    return this.config.intensity ?? 1.0
  }
  
  /**
   * Check if material is managed by HDR system
   * Useful for coordinating with other systems (e.g., weather system)
   */
  isMaterialManaged(material: THREE.Material): boolean {
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
      return false
    }
    
    return material.envMap === this.pmremEnvMap || 
           material.envMap === this.scene.environment
  }
  
  /**
   * Get recommended intensity for material (respects user controls and material properties)
   * Useful for other systems to coordinate with HDR system
   */
  getRecommendedIntensity(material: THREE.Material): number {
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
      return this.config.intensity ?? 1.0
    }
    
    return calculateMaterialIntensity(material, this.config.intensity ?? 1.0)
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.disableHDR()
    
    // Ground projection is already disposed in disableHDR()
    
    if (this.defaultEnvTexture) {
      this.defaultEnvTexture.dispose()
      this.defaultEnvTexture = null
    }
    
    // Don't dispose PMREM generator - it's managed by EnvironmentManager and may be reused
    // Just clear our reference
    this.pmremGenerator = null
    
    this.rgbeLoader = null
    this.exrLoader = null
  }

  private updateShadowPlaneVisibilityForGroundProjection(enable: boolean): void {
    // CRITICAL: Don't hide shadow plane when ground projection is enabled
    // The shadow plane should remain visible and functional with ground projection
    // Both can work together - ground projection provides the ground texture,
    // and shadow plane provides the shadow receiving surface
    // 
    // When ground projection is enabled, we should NOT change shadow plane visibility
    // The user's shadow plane setting should be respected
    if (enable) {
      // Save previous state only if not already saved (for restoration later)
      if (this.previousShadowPlaneVisible === null) {
        const state = useAppStore.getState()
        this.previousShadowPlaneVisible = state.showShadowPlane
      }
      // DON'T hide shadow plane - keep it visible for shadows
      // The shadow plane and ground projection can coexist
    } else if (this.previousShadowPlaneVisible !== null) {
      // Restore previous state when disabling ground projection
      useAppStore.setState({ showShadowPlane: this.previousShadowPlaneVisible })
      this.previousShadowPlaneVisible = null
    }
  }

  /**
   * Pre-load the KTX2 transcoder to ensure it's ready before loading files
   */
  private async preloadTranscoder(): Promise<void> {
    if (!this.ktx2Loader) return
    
    try {
      // Force transcoder to load by accessing the transcoderPending promise
      // This triggers the transcoder to start loading
      const transcoderPending = (this.ktx2Loader as any).transcoderPending
      if (transcoderPending) {
        await transcoderPending
        console.log('[HDRSystem] ✅ Transcoder preloaded successfully')
      } else {
        // If transcoderPending doesn't exist, trigger it by calling detectSupport again
        // or by trying to access the transcoder property
        console.log('[HDRSystem] Transcoder will load on first use')
      }
    } catch (error) {
      console.warn('[HDRSystem] Transcoder preload error (non-fatal):', error)
    }
  }
  
  /**
   * Ensure the transcoder is ready before loading a file
   * If the current transcoder path fails, try fallback paths
   */
  private async ensureTranscoderReady(): Promise<void> {
    if (!this.ktx2Loader) {
      throw new Error('KTX2Loader not available')
    }
    
    try {
      // Wait for transcoder to be ready with timeout
      const transcoderPending = (this.ktx2Loader as any).transcoderPending
      if (transcoderPending) {
        try {
          // Wait for transcoder with timeout (5 seconds)
          await Promise.race([
            transcoderPending,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transcoder load timeout')), 5000))
          ])
          // Give it a small delay to ensure it's fully initialized
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (pendingError) {
          console.warn('[HDRSystem] ⚠️ Transcoder pending promise rejected or timed out:', pendingError)
          // Try fallback paths if current one fails
          await this.tryFallbackTranscoderPaths()
          // Re-check transcoder after fallback
          const transcoderPendingAfterFallback = (this.ktx2Loader as any).transcoderPending
          if (transcoderPendingAfterFallback) {
            try {
              await Promise.race([
                transcoderPendingAfterFallback,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback transcoder timeout')), 5000))
              ])
              await new Promise(resolve => setTimeout(resolve, 100))
            } catch (e) {
              console.warn('[HDRSystem] ⚠️ Fallback transcoder also failed, proceeding anyway')
            }
          }
        }
      } else {
        // If transcoderPending doesn't exist, the transcoder might already be loaded
        // or it will load on first use. Check if it's actually loaded.
        const transcoder = (this.ktx2Loader as any).transcoder
        if (!transcoder) {
          // Transcoder not loaded yet - wait a bit and check again
          console.log('[HDRSystem] Waiting for transcoder to load...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          // If still not loaded, try fallback
          const stillNotLoaded = !(this.ktx2Loader as any).transcoder
          if (stillNotLoaded) {
            console.warn('[HDRSystem] ⚠️ Transcoder didn\'t load, trying fallback paths...')
            await this.tryFallbackTranscoderPaths()
          }
        }
      }
      
      // Verify transcoder is actually loaded
      const transcoder = (this.ktx2Loader as any).transcoder
      if (transcoder) {
        console.log('[HDRSystem] ✅ Transcoder is ready')
      } else {
        console.warn('[HDRSystem] ⚠️ Transcoder may not be fully loaded - proceeding anyway')
        console.warn('[HDRSystem] This may cause "Unsupported vkFormat" errors when loading KTX2 files')
      }
    } catch (error) {
      console.warn('[HDRSystem] ⚠️ Error waiting for transcoder (proceeding anyway):', error)
      // Don't throw - let the load attempt proceed, it might still work
    }
  }
  
  /**
   * Inspect KTX2 file header to determine format
   */
  private async inspectKTX2Format(url: string | File): Promise<{
    format?: string
    isUASTC?: boolean
    isETC1S?: boolean
    isASTC?: boolean
    isETC2?: boolean
    isZstandard?: boolean
    isCubemap?: boolean
    faceCount?: number
    error?: string
  }> {
    try {
      let arrayBuffer: ArrayBuffer
      
      if (url instanceof File) {
        arrayBuffer = await url.arrayBuffer()
      } else {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`)
        }
        arrayBuffer = await response.arrayBuffer()
      }
      
      // KTX2 file header structure (simplified)
      // Offset 0x0C: vkFormat (4 bytes, little-endian)
      // Offset 0x10: typeSize (4 bytes)
      // Offset 0x14: pixelWidth (4 bytes)
      // Offset 0x18: pixelHeight (4 bytes)
      // Offset 0x1C: pixelDepth (4 bytes)
      // Offset 0x20: layerCount (4 bytes)
      // Offset 0x24: faceCount (4 bytes)
      // Offset 0x28: levelCount (4 bytes)
      // Offset 0x2C: supercompressionScheme (4 bytes)
      
      if (arrayBuffer.byteLength < 0x30) {
        return { error: 'File too small to be valid KTX2' }
      }
      
      const view = new DataView(arrayBuffer)
      
      // Check KTX2 identifier (first 12 bytes should be "KTX 20" + 0xBB + 0x0D + 0x0A + 0x1A + 0x0A)
      const identifier = new Uint8Array(arrayBuffer, 0, 12)
      const ktx2Magic = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]
      let isKTX2 = true
      for (let i = 0; i < 12; i++) {
        if (identifier[i] !== ktx2Magic[i]) {
          isKTX2 = false
          break
        }
      }
      
      if (!isKTX2) {
        return { error: 'Not a valid KTX2 file (invalid magic number)' }
      }
      
      // Read vkFormat (offset 0x0C)
      const vkFormat = view.getUint32(0x0C, true) // little-endian
      
      // Read faceCount (offset 0x24) - determines if it's a cubemap (6) or equirectangular (1)
      const faceCount = view.getUint32(0x24, true)
      
      // Read supercompressionScheme (offset 0x2C)
      const supercompressionScheme = view.getUint32(0x2C, true)
      
      // vkFormat values for common formats:
      // UASTC: 0x00000000 (VK_FORMAT_UNDEFINED) when using Basis Universal supercompression
      // ETC1S: 0x00000000 (VK_FORMAT_UNDEFINED) when using Basis Universal supercompression
      // ASTC: Various (0x93B0-0x93FF for ASTC formats)
      // ETC2: Various (0x9274-0x927F for ETC2 formats)
      // RGBA8: 0x00000008 (VK_FORMAT_R8G8B8A8_UNORM)
      
      // Supercompression scheme:
      // 0 = None
      // 1 = BasisLZ/ETC1S (supported by Basis transcoder)
      // 2 = Zstandard (NOT supported by Basis transcoder - requires different decoder)
      // 3 = Zlib
      // 4 = UASTC (Basis Universal UASTC - supported by Basis transcoder)
      
      const formatInfo: {
        format?: string
        isUASTC?: boolean
        isETC1S?: boolean
        isASTC?: boolean
        isETC2?: boolean
        isZstandard?: boolean
        isCubemap?: boolean
        faceCount?: number
        error?: string
      } = {
        faceCount: faceCount,
        isCubemap: faceCount === 6
      }
      
      if (supercompressionScheme === 4) {
        formatInfo.isUASTC = true
        formatInfo.format = 'UASTC (Basis Universal) - Supported'
      } else if (supercompressionScheme === 1) {
        formatInfo.isETC1S = true
        formatInfo.format = 'ETC1S (Basis Universal) - Supported'
      } else if (supercompressionScheme === 2) {
        formatInfo.isZstandard = true
        formatInfo.format = 'Zstandard - NOT supported by Basis transcoder'
      } else if (supercompressionScheme === 3) {
        formatInfo.format = 'Zlib - NOT supported by Basis transcoder'
      } else if (vkFormat >= 0x93B0 && vkFormat <= 0x93FF) {
        formatInfo.isASTC = true
        formatInfo.format = `ASTC (vkFormat: 0x${vkFormat.toString(16)}) - NOT supported by Basis transcoder`
      } else if (vkFormat >= 0x9274 && vkFormat <= 0x927F) {
        formatInfo.isETC2 = true
        formatInfo.format = `ETC2 (vkFormat: 0x${vkFormat.toString(16)}) - NOT supported by Basis transcoder`
      } else if (vkFormat === 0x00000000 && supercompressionScheme === 0) {
        formatInfo.format = `Uncompressed (vkFormat: 0x${vkFormat.toString(16)})`
      } else {
        formatInfo.format = `Unknown (vkFormat: 0x${vkFormat.toString(16)}, supercompression: ${supercompressionScheme})`
      }
      
      return formatInfo
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  /**
   * Try fallback transcoder paths if the current one fails
   */
  private async tryFallbackTranscoderPaths(): Promise<void> {
    if (!this.ktx2Loader) return
    
    const threeVersion = '0.181.1'
    const needleVersion = '0.179.1'
    const fallbackPaths = [
      `https://cdn.jsdelivr.net/npm/three@${threeVersion}/examples/jsm/libs/basis/`, // Three.js CDN (reliable)
      '/basis/' // Local fallback
    ]
    
    const currentPath = (this.ktx2Loader as any).transcoderPath
    console.log('[HDRSystem] Current transcoder path failed, trying fallbacks...')
    
    for (const fallbackPath of fallbackPaths) {
      if (fallbackPath === currentPath) continue // Skip if it's the same as current
      
      try {
        console.log('[HDRSystem] Trying fallback transcoder path:', fallbackPath)
        this.ktx2Loader.setTranscoderPath(fallbackPath)
        this.ktx2Loader.detectSupport(this.renderer)
        
        // Wait a bit for the transcoder to load
        const transcoderPending = (this.ktx2Loader as any).transcoderPending
        if (transcoderPending) {
          await transcoderPending
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        
        // Check if transcoder loaded
        const transcoder = (this.ktx2Loader as any).transcoder
        if (transcoder) {
          console.log('[HDRSystem] ✅ Fallback transcoder path worked:', fallbackPath)
          return
        }
      } catch (error) {
        console.warn('[HDRSystem] Fallback path failed:', fallbackPath, error)
        continue
      }
    }
    
    console.warn('[HDRSystem] ⚠️ All transcoder paths failed, proceeding with current path')
  }
  
  /**
   * Get the original equirectangular HDR texture (for path tracer)
   * Path tracer needs equirectangular texture with image.data, not PMREM cube map
   */
  getOriginalHDRTexture(): THREE.DataTexture | null {
    return this.originalHdrTexture
  }
}
