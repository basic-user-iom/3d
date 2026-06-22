import * as THREE from 'three'
import { KTX2Loader } from 'three-stdlib'
import { loadHDR } from './hdrLoader'
import JSZip from 'jszip'

// Shared KTX2 loader instance
let ktx2Loader: KTX2Loader | null = null

// Initialize KTX2 loader
async function initKTX2(renderer?: THREE.WebGLRenderer): Promise<KTX2Loader | null> {
  if (ktx2Loader) return ktx2Loader
  
  try {
    ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath('/basis/')
    if (renderer) {
      ktx2Loader.detectSupport(renderer)
    }
    return ktx2Loader
  } catch (e) {
    console.warn('KTX2 loader initialization failed:', e)
    return null
  }
}

/**
 * Load any supported texture format (including KTX2, HDR/EXR, and standard images)
 * @param file The texture file to load
 * @param renderer The WebGL renderer (for KTX2 support detection)
 * @param maxAnisotropy Maximum anisotropy value
 * @param customAnisotropy Custom anisotropy value (optional)
 * @returns Promise resolving to the loaded texture
 */
export async function loadTexture(
  file: File,
  renderer?: THREE.WebGLRenderer,
  maxAnisotropy: number = 16,
  customAnisotropy?: number
): Promise<THREE.Texture> {
  const fileName = file.name.toLowerCase()
  const ext = fileName.split('.').pop()
  
  // Handle HDR/EXR textures
  if (ext === 'hdr' || ext === 'exr') {
    return await loadHDR(file)
  }
  
  // Handle KTX2/Basis compressed textures
  if (ext === 'ktx2' || ext === 'basis') {
    if (!renderer) {
      throw new Error('Renderer required for KTX2/Basis texture loading')
    }
    
    const ktx2 = await initKTX2(renderer)
    if (!ktx2) {
      throw new Error('KTX2 loader not available')
    }
    
    const objectUrl = URL.createObjectURL(file)
    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        ktx2.load(
          objectUrl,
          (tex) => {
            URL.revokeObjectURL(objectUrl)
            
            // Apply proper filtering to prevent striping
            if (tex instanceof THREE.Texture) {
              tex.flipY = false
              tex.needsUpdate = true
            }
            resolve(tex)
          },
          undefined,
          (error) => {
            URL.revokeObjectURL(objectUrl)
            reject(error)
          }
        )
      })
      
      return texture
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw error
    }
  }
  
  // Handle Substance 3D files (.sbar, .sbsar)
  // Note: These are proprietary formats. Some may be ZIP archives, but most contain
  // procedural materials requiring the Substance Engine SDK. We'll attempt to extract
  // any embedded textures as a best-effort approach.
  if (ext === 'sbar' || ext === 'sbsar') {
    try {
      // Try to read as ZIP archive (some old Substance archives were ZIP-based)
      const buffer = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(buffer)
      
      // Look for any image files inside the archive
      const imageExtensions = ['jpg', 'jpeg', 'png', 'tga', 'bmp', 'webp', 'tif', 'tiff', 'ktx2', 'basis']
      let foundImage: { path: string; blob: Blob } | null = null
      
      for (const path in zip.files) {
        const entry = zip.files[path]
        if (entry.dir) continue
        
        const entryExt = path.toLowerCase().split('.').pop()
        if (entryExt && imageExtensions.includes(entryExt)) {
          const blob = await entry.async('blob')
          foundImage = { path, blob }
          console.log(`📦 Found embedded image in SBAR/SBSAR: ${path}`)
          break // Use the first image we find
        }
      }
      
      if (foundImage) {
        // Create a temporary File from the extracted blob
        const extractedFile = new File([foundImage.blob], foundImage.path, { type: foundImage.blob.type })
        // Recursively load the extracted image with proper settings
        return await loadTexture(extractedFile, renderer, maxAnisotropy, customAnisotropy)
      }
    } catch (zipError) {
      // Not a ZIP archive or extraction failed - this is expected for most SBAR/SBSAR files
      console.debug('SBAR/SBSAR is not a ZIP archive or extraction failed:', zipError)
    }
    
    // If we get here, the file is not supported
    throw new Error('SBAR/SBSAR files require Adobe Substance Engine SDK for procedural material rendering. Some older archives may contain embedded images, but this file does not. Please export textures from Substance as PNG/JPG/KTX2 and upload those instead.')
  }
  
  // Handle standard image formats (JPG, PNG, WEBP, etc.)
  const loader = new THREE.TextureLoader()
  const objectUrl = URL.createObjectURL(file)
  
  try {
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        objectUrl,
        (tex) => {
          URL.revokeObjectURL(objectUrl)
          tex.flipY = false
          
          // Apply proper filtering to prevent striping
          tex.minFilter = THREE.LinearMipmapLinearFilter
          tex.magFilter = THREE.LinearFilter
          tex.generateMipmaps = true
          
          // Apply anisotropy
          if (customAnisotropy !== undefined && customAnisotropy >= 0) {
            tex.anisotropy = Math.min(customAnisotropy, maxAnisotropy, 16)
          } else {
            tex.anisotropy = Math.min(maxAnisotropy, 16)
          }
          
          tex.needsUpdate = true
          resolve(tex)
        },
        undefined,
        (error) => {
          URL.revokeObjectURL(objectUrl)
          reject(error)
        }
      )
    })
    
    return texture
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

/**
 * Get list of supported texture extensions
 */
export function getSupportedTextureExtensions(): string[] {
  return ['jpg', 'jpeg', 'png', 'tga', 'bmp', 'webp', 'hdr', 'exr', 'ktx2', 'basis', 'sbar', 'sbsar']
}

