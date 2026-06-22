import * as THREE from 'three'
import JSZip from 'jszip'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  cloneMenuLayout,
  cloneMenuRowBreaks,
  type MenuLayout,
  type MenuRowBreaks
} from '../config/toolbarMenu'
import { useAppStore } from '../store/useAppStore'
import { getSharedViewer } from '../viewer/useViewer'
import { loadModel } from '../viewer/loaders'

/**
 * Global File Registry - Tracks original File objects for project save/load
 * This allows us to embed actual file data in packaged projects
 * Based on best practices: maintain a registry of loaded files
 */
class FileRegistry {
  private modelFiles = new Map<string, File>() // fileName -> File
  private textureFiles = new Map<string, File>() // textureName -> File
  private hdrFiles = new Map<string, File>() // hdrName -> File

  /**
   * Register a model file when it's loaded
   * Also registers by filename only (without path) for flexible lookup
   */
  registerModelFile(fileName: string, file: File): void {
    // Register with full filename (may include path)
    this.modelFiles.set(fileName, file)
    
    // Also register with just the filename (without path) for flexible lookup
    const fileNameOnly = fileName.split('/').pop()?.split('\\').pop() || fileName
    if (fileNameOnly !== fileName) {
      // Only register separately if they're different
      this.modelFiles.set(fileNameOnly, file)
      console.log(`[FileRegistry] Registered model file: ${fileName} (also as ${fileNameOnly}) (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    } else {
    console.log(`[FileRegistry] Registered model file: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    }
  }

  /**
   * Register a texture file
   */
  registerTextureFile(textureName: string, file: File): void {
    this.textureFiles.set(textureName, file)
  }

  /**
   * Register an HDR file
   */
  registerHdrFile(fileName: string, file: File): void {
    this.hdrFiles.set(fileName, file)
  }

  /**
   * Get a registered model file
   * Supports exact match and filename-only match (handles path variations)
   */
  getModelFile(fileName: string): File | undefined {
    // First try exact match
    let file = this.modelFiles.get(fileName)
    if (file) return file
    
    // Try filename-only match (handles "path/file.glb" vs "file.glb")
    const fileNameOnly = fileName.split('/').pop()?.split('\\').pop() || fileName
    file = this.modelFiles.get(fileNameOnly)
    if (file) {
      console.log(`[FileRegistry] Found file by filename match: "${fileName}" -> "${fileNameOnly}"`)
      return file
    }
    
    // Try case-insensitive match
    const fileNameLower = fileName.toLowerCase()
    for (const [key, value] of this.modelFiles.entries()) {
      if (key.toLowerCase() === fileNameLower) {
        console.log(`[FileRegistry] Found file by case-insensitive match: "${fileName}" -> "${key}"`)
        return value
      }
    }
    
    // Try filename-only case-insensitive match
    const fileNameOnlyLower = fileNameOnly.toLowerCase()
    for (const [key, value] of this.modelFiles.entries()) {
      const keyOnly = key.split('/').pop()?.split('\\').pop() || key
      if (keyOnly.toLowerCase() === fileNameOnlyLower) {
        console.log(`[FileRegistry] Found file by filename case-insensitive match: "${fileName}" -> "${key}"`)
        return value
      }
    }
    
    return undefined
  }

  /**
   * Get all registered model files
   */
  getAllModelFiles(): Map<string, File> {
    return new Map(this.modelFiles)
  }

  /**
   * Get all registered texture files
   */
  getAllTextureFiles(): Map<string, File> {
    return new Map(this.textureFiles)
  }

  /**
   * Get all registered HDR files
   */
  getAllHdrFiles(): Map<string, File> {
    return new Map(this.hdrFiles)
  }

  /**
   * Clear all registered files
   */
  clear(): void {
    this.modelFiles.clear()
    this.textureFiles.clear()
    this.hdrFiles.clear()
    console.log('[FileRegistry] Cleared all registered files')
  }

  /**
   * Remove a specific model file
   */
  unregisterModelFile(fileName: string): void {
    this.modelFiles.delete(fileName)
  }
}

// Global file registry instance
export const fileRegistry = new FileRegistry()

type HdrSerialized =
  | {
      type: 'url'
      url: string
    }
  | {
      type: 'embedded'
      name: string
      mimeType: string
      data: string
    }
  | null

export interface SavedMaterial {
  type: string
  color?: string
  emissive?: string
  emissiveIntensity?: number
  opacity?: number
  transparent?: boolean
  side?: 'Front' | 'Back' | 'Double'
  roughness?: number
  metalness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  transmission?: number
  thickness?: number
  ior?: number
  specularIntensity?: number
  specularColor?: string
  sheen?: number
  sheenRoughness?: number
  sheenColor?: string
  wireframe?: boolean
  map?: string // Base64 encoded texture or URL
  normalMap?: string
  roughnessMap?: string
  metalnessMap?: string
  aoMap?: string
  emissiveMap?: string
  bumpMap?: string
  displacementMap?: string
  alphaMap?: string
  lightMap?: string
  clearcoatMap?: string
  clearcoatNormalMap?: string
  clearcoatRoughnessMap?: string
  sheenColorMap?: string
  sheenRoughnessMap?: string
  transmissionMap?: string
  thicknessMap?: string
  specularMap?: string
  specularIntensityMap?: string
  specularColorMap?: string
}

export interface SavedSceneObject {
  id: string
  name: string
  type: 'imported' | 'primitive' | 'polygon' | 'other'
  // Transform
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  visible: boolean
  // For imported models
  fileName?: string
  fileUrl?: string
  fileData?: string // Base64 encoded file data
  // For primitives
  primitiveType?: 'box' | 'sphere' | 'plane' | 'cone' | 'cylinder' | 'torus' | 'tetrahedron' | 'octahedron'
  primitiveSize?: { x: number; y: number; z: number }
  // For polygons
  polygonVertices?: Array<{ x: number; y: number; z: number }>
  polygonFillOpacity?: number
  // Materials - array for multi-material objects
  materials: SavedMaterial[]
  // User data
  userData?: Record<string, any>
  // Children (for groups)
  children?: SavedSceneObject[]
}

export interface SavedProject {
  version: number
  savedAt: string
  camera: {
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  }
  menuLayout: MenuLayout
  menuRowBreaks?: MenuRowBreaks
  sceneObjects?: SavedSceneObject[] // New: All scene objects with materials and transformations
  store: {
    selections: {
      showGrid: boolean
      showAxes: boolean
      showBoundingBoxes: boolean
      showStats: boolean
      showShadowPlane: boolean
      shadowPlaneTransparent: boolean
      pivotMode: 'center' | 'bottom'
    }
    lighting: {
      ambientIntensity: number
      shadowsEnabled: boolean
      shadowIntensity: number
      shadowBias: number
      shadowOpacityEnabled: boolean
      shadowOpacity: number
      shadowColor: string
      directionalLights: ReturnType<typeof useAppStore.getState>['directionalLights']
      selectedLightId: string | null
      pathTracerLighting: ReturnType<typeof useAppStore.getState>['pathTracerLighting']
    }
    hdr: {
      enabled: boolean
      intensity: number
      rotationAzimuth: number
      rotationElevation: number
      backgroundVisible: boolean
      groundProjectionEnabled: boolean
      groundProjectionHeight: number
      groundProjectionRadius: number
      northOffset: number
      serialization: HdrSerialized
    }
    weather: {
      weatherPreset: string
      cloudDensity: number
      cloudThickness: number
      cloudDetail: number
      cloudScale: number
      cloudStorminess: number
      cloudShadowStrength: number
      cloudColor: string
      fogDensity: number
      fogHeight: number
      fogColor: string
      rainIntensity: number
      snowIntensity: number
      windIntensity: number
      timeOfDay: number
      skyTurbidity: number
      skyAtmosphereDensity: number
      skyRayleigh?: number
      skyMieCoefficient?: number
      skyMieDirectionalG?: number
      skyExposure?: number
      dynamicSkyEnabled: boolean
      sunSize: number
      moonSize: number
      weatherQuality: 'low' | 'medium' | 'high' | 'ultra'
      rainParticleScale: number
      rainParticleSpeed: number
      rainCollisionEnabled: boolean
      snowParticleScale: number
      snowParticleSpeed: number
      snowCollisionEnabled: boolean
      windGustsEnabled: boolean
    }
    rendering: {
      textureAnisotropy: number
      pixelRatio: number
      maxPixelRatio: number
      useLogarithmicDepthBuffer: boolean
      useHighPerformanceGPU: boolean
      preferCPU: boolean
      vsyncEnabled?: boolean
      maxFPS?: number
      upscalingEnabled?: boolean
      upscalingQuality?: number
    }
    water?: {
      enabled: boolean
      level: number
      color: string
      opacity: number
      waveSpeed: number
      waveHeight: number
      reflectivity: number
      mode: 'plane' | 'marchingCubes' | 'ocean'
      marchingCubesResolution: number
      marchingCubesIsolation: number
      marchingCubesMetaballCount: number
      oceanDistortionScale: number
      oceanSize: number
    }
    pathTracer?: {
      active: boolean
      mode: 'gpu' | 'cpu'
      settings: ReturnType<typeof useAppStore.getState>['pathTracerSettings']
      lighting: ReturnType<typeof useAppStore.getState>['pathTracerLighting']
    }
    postProcessing?: {
      enabled: boolean
      bloomEnabled: boolean
      bloomStrength: number
      bloomRadius: number
      bloomThreshold: number
      lutEnabled: boolean
      lutIntensity: number
      anamorphicEnabled: boolean
      anamorphicIntensity: number
      anamorphicThreshold: number
      anamorphicScale: number
      anamorphicColor: string
      aoEnabled: boolean
      aoOutput: number
      aoRadius: number
      aoIntensity: number
      ssrEnabled: boolean
      ssrIntensity: number
      ssrJitter: number
      sssEnabled: boolean
      sssIntensity: number
      sssJitter: number
    }
    places?: ReturnType<typeof useAppStore.getState>['places']
    osmBuildings?: {
      enabled: boolean
      color: string
      opacity: number
      defaultHeight: number
      metersPerLevel: number
    }
    streetsGL?: {
      groundEnabled: boolean
      groundSize: number
      groundOpacity: number
      groundLat: number
      groundLon: number
      groundZoom: number
      groundLayerType: string
      iframeOverlay: boolean
      iframeInteractive: boolean
      showUI: boolean
    }
    gridSize?: number
    selectedObjectId?: string | null // UUID of selected object
    cameraViews: ReturnType<typeof useAppStore.getState>['cameraViews']
    cameraViewThumbnails?: Record<string, string> // Map of viewId -> thumbnail data URL
    hotspots?: Array<{
      id: string
      name: string
      position: { x: number; y: number; z: number }
      targetObjectId?: string
      targetEndpointPosition?: { x: number; y: number; z: number }
      // When false, hotspot icon pin is hidden (only label/panel shown)
      showIcon?: boolean
      icon?: {
        type: 'default' | 'emoji' | 'custom' | 'custom-image' | 'symbol'
        value: string
      }
      panelState?: 'open' | 'closed'
      content: {
        type: 'text' | 'image' | 'youtube' | 'video' | 'interactive' | 'html'
        data: string
        formatting?: {
          fontFamily?: string
          fontSize?: number
          color?: string
          bold?: boolean
          italic?: boolean
          underline?: boolean
          align?: 'left' | 'center' | 'right' | 'justify'
          backgroundColor?: string
          padding?: number
        }
        popupSettings?: {
          width?: number
          height?: number
          maxWidth?: number
          maxHeight?: number
          backgroundColor?: string
          borderRadius?: number
          showOnClick?: boolean
        }
      }
      label?: {
        text: string
        visible: 'always' | 'hover' | 'click'
        fontSize?: number
        color?: string
        backgroundColor?: string
        borderWidth?: number
        borderColor?: string
        borderRadius?: number
        widthPixels?: number | null
        heightPixels?: number | null
        offsetX?: number
        offsetY?: number
      }
      // Panel border styling
      panelBorder?: {
        width?: number
        color?: string
        borderRadius?: number
      }
      // Panel dimensions in pixels (null = auto)
      panelDimensions?: {
        widthPixels?: number | null
        heightPixels?: number | null
      }
      // Lock flag from editor
      locked?: boolean
    }>
    textureMergeMappings?: Map<string, string> // Map<textureNameToMerge, canonicalTextureName>
    modelFiles?: Array<{
      fileName: string
      fileUrl?: string
      fileData?: string // Base64 encoded file data
      requiresManualReload?: boolean // True if file was too large to embed and needs manual reload
      originalFileSize?: number // Original file size in bytes (for large files that weren't embedded)
    }>
  }
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  // Remove any whitespace and validate base64 format
  const cleanBase64 = base64.trim().replace(/\s/g, '')
  
  // Basic base64 validation (should only contain A-Z, a-z, 0-9, +, /, and =)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
    throw new Error('Invalid base64 string format')
  }
  
  try {
    const binaryString = atob(cleanBase64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
  } catch (error) {
    throw new Error(`Failed to decode base64: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Helper to yield to browser to prevent blocking
const yieldToBrowser = (): Promise<void> => {
  return new Promise(resolve => {
    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 })
    } else {
      setTimeout(() => resolve(), 0)
    }
  })
}

// Global counter for texture serialization (to prevent excessive serialization)
let textureSerializationCount = 0
const MAX_TEXTURES_TO_SERIALIZE = 500 // Limit to prevent freezing on very large projects

// Serialize material properties
const serializeMaterial = async (
  material: THREE.Material, 
  skipTextures: boolean = false,
  textureFilesInModelFiles: Set<string> = new Set(),
  onProgress?: (current: number, total: number) => void
): Promise<SavedMaterial> => {
  const saved: SavedMaterial = {
    type: material.type
  }

  if ('color' in material && material.color instanceof THREE.Color) {
    saved.color = '#' + material.color.getHexString()
  }
  if ('emissive' in material && material.emissive instanceof THREE.Color) {
    saved.emissive = '#' + material.emissive.getHexString()
    saved.emissiveIntensity = ('emissiveIntensity' in material) ? (material as any).emissiveIntensity : 0
  }
  if ('opacity' in material) {
    saved.opacity = material.opacity
  }
  if ('transparent' in material) {
    saved.transparent = material.transparent
  }
  if ('side' in material) {
    if (material.side === THREE.DoubleSide) saved.side = 'Double'
    else if (material.side === THREE.BackSide) saved.side = 'Back'
    else saved.side = 'Front'
  }
  if ('wireframe' in material && typeof (material as any).wireframe === 'boolean') {
    saved.wireframe = (material as any).wireframe
  }

  // PBR properties
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    saved.roughness = material.roughness
    saved.metalness = material.metalness
  }

  // Physical material properties
  if (material instanceof THREE.MeshPhysicalMaterial) {
    saved.clearcoat = material.clearcoat
    saved.clearcoatRoughness = material.clearcoatRoughness
    saved.transmission = material.transmission
    saved.thickness = material.thickness
    saved.ior = material.ior
    saved.specularIntensity = material.specularIntensity
    if (material.specularColor instanceof THREE.Color) {
      saved.specularColor = '#' + material.specularColor.getHexString()
    }
    saved.sheen = material.sheen
    saved.sheenRoughness = material.sheenRoughness
    if (material.sheenColor instanceof THREE.Color) {
      saved.sheenColor = '#' + material.sheenColor.getHexString()
    }
  }

  // Skip texture serialization if requested or if we've already serialized too many
  if (skipTextures || textureSerializationCount >= MAX_TEXTURES_TO_SERIALIZE) {
    if (textureSerializationCount >= MAX_TEXTURES_TO_SERIALIZE) {
      console.warn(`[ProjectPersistence] Skipping texture serialization: reached limit of ${MAX_TEXTURES_TO_SERIALIZE} textures`)
    }
    return saved
  }

  // Serialize ALL texture maps (not just map)
  const textureProperties = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
    'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
    'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
    'specularIntensityMap', 'specularColorMap'
  ]

  // Maximum texture dimensions to serialize (to prevent memory issues)
  const MAX_TEXTURE_DIMENSION = 4096
  const MAX_TEXTURE_PIXELS = MAX_TEXTURE_DIMENSION * MAX_TEXTURE_DIMENSION

  // Count textures to serialize for progress tracking
  let texturesToSerialize = 0
  let texturesSerialized = 0
  
  // First pass: count textures that need serialization
  for (const prop of textureProperties) {
    if (prop in material && (material as any)[prop]) {
      const texture = (material as any)[prop] as THREE.Texture
      if (texture && texture.image) {
        // Check if texture is already in modelFiles (skip if so)
        let textureFileName: string | null = null
        if (texture.image && (texture.image as any).src) {
          const src = (texture.image as any).src
          if (typeof src === 'string') {
            const urlParts = src.split('/')
            textureFileName = urlParts[urlParts.length - 1]?.split('?')[0] || null
          }
        }
        
        // Skip if already in modelFiles
        if (textureFileName && textureFilesInModelFiles.has(textureFileName.toLowerCase())) {
          continue
        }
        
        texturesToSerialize++
      }
    }
  }

  for (const prop of textureProperties) {
    if (prop in material && (material as any)[prop]) {
      const texture = (material as any)[prop] as THREE.Texture
      if (texture && texture.image) {
      try {
        // Try to get image data
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
          
          // Verify context is valid and has drawImage method
          if (!ctx) {
            console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: failed to get 2d context`)
            continue
          }
          
          // Double-check that drawImage exists and is a function
          if (typeof ctx.drawImage !== 'function') {
            console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: drawImage is not a function`)
            continue
          }
          
          if (texture.image) {
            const img = texture.image
            
            // Check if image is directly drawable
            let drawableImage: CanvasImageSource | null = null
            let imgWidth = 256
            let imgHeight = 256
            let canDraw = false
            
            if (img instanceof HTMLImageElement) {
              // For HTMLImageElement, ensure it's loaded and not cross-origin
              if (!img.complete) {
                console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: image not loaded`)
                continue
              }
              
              // Check for cross-origin issues by trying to access naturalWidth
              try {
                const testWidth = img.naturalWidth || img.width
                const testHeight = img.naturalHeight || img.height
                if (testWidth === 0 || testHeight === 0) {
                  console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: image has zero dimensions`)
                  continue
                }
                // If we can read dimensions, we can likely draw it
                canDraw = true
                drawableImage = img
                imgWidth = testWidth
                imgHeight = testHeight
              } catch (crossOriginError) {
                console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: cross-origin image cannot be serialized`)
                continue
              }
            } else if (img instanceof HTMLCanvasElement) {
              canDraw = true
              drawableImage = img
              imgWidth = img.width || 256
              imgHeight = img.height || 256
            } else if (img instanceof ImageBitmap) {
              canDraw = true
              drawableImage = img
              imgWidth = img.width || 256
              imgHeight = img.height || 256
            } else if (img instanceof OffscreenCanvas) {
              // OffscreenCanvas cannot be directly drawn, skip it
              console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: OffscreenCanvas not supported in this context`)
              continue
            } else if (img instanceof ImageData) {
              // Convert ImageData to canvas
              const tempCanvas = document.createElement('canvas')
              tempCanvas.width = img.width
              tempCanvas.height = img.height
              const tempCtx = tempCanvas.getContext('2d')
              if (tempCtx && typeof tempCtx.putImageData === 'function') {
                try {
                  tempCtx.putImageData(img, 0, 0)
                  canDraw = true
                  drawableImage = tempCanvas
                  imgWidth = img.width
                  imgHeight = img.height
                } catch (putError) {
                  console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: failed to put ImageData to canvas`, putError)
                  continue
                }
              } else {
                console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: failed to create temp canvas for ImageData`)
                continue
              }
            } else if (img && typeof img === 'object' && 'width' in img && 'height' in img) {
              // Try to use the image directly if it has width/height
              // This handles cases like VideoFrame or other image-like objects
              const testWidth = (img as any).width
              const testHeight = (img as any).height
              if (testWidth > 0 && testHeight > 0) {
                try {
                  // Test if it's drawable by attempting a type check
                  drawableImage = img as CanvasImageSource
                  imgWidth = testWidth
                  imgHeight = testHeight
                  canDraw = true
                } catch (castError) {
                  console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: unsupported image type`, img.constructor?.name || typeof img)
                  continue
                }
              } else {
                console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: invalid dimensions`)
                continue
              }
            } else {
              // Unknown image type, skip
              console.warn(`[ProjectPersistence] Cannot serialize texture ${prop}: unknown image type`, img.constructor?.name || typeof img)
              continue
            }
            
            // Draw the image to canvas if we have a valid drawable image
            if (canDraw && drawableImage && imgWidth > 0 && imgHeight > 0) {
              // Skip very large textures to prevent memory issues
              const totalPixels = imgWidth * imgHeight
              if (imgWidth > MAX_TEXTURE_DIMENSION || imgHeight > MAX_TEXTURE_DIMENSION || totalPixels > MAX_TEXTURE_PIXELS) {
                console.warn(`[ProjectPersistence] Skipping texture ${prop}: too large (${imgWidth}x${imgHeight}, max ${MAX_TEXTURE_DIMENSION}x${MAX_TEXTURE_DIMENSION})`)
                continue
              }
              
              try {
                // Set canvas dimensions
                canvas.width = imgWidth
                canvas.height = imgHeight
                
                // Clear canvas first
                ctx.clearRect(0, 0, imgWidth, imgHeight)
                
                // Attempt to draw the image - wrap in try-catch for safety
                try {
                  ctx.drawImage(drawableImage, 0, 0, imgWidth, imgHeight)
                  
                  // CRITICAL: Always save textures that are on materials, even if they're in modelFiles
                  // This ensures texture modifications (repeat, offset, rotation, brightness, etc.) are preserved
                  // The modelFiles contain original textures, but material textures may have been modified by the user
                  
                  // Check if texture has been modified (non-default repeat, offset, rotation, or is a canvas)
                  const isModified = texture.repeat.x !== 1 || texture.repeat.y !== 1 ||
                                    texture.offset.x !== 0 || texture.offset.y !== 0 ||
                                    texture.rotation !== 0 ||
                                    texture.image instanceof HTMLCanvasElement ||
                                    (texture.image && (texture.image as any).tagName === 'CANVAS')
                  
                  // If texture is modified OR if it's a canvas (user-created/modified), always save it
                  // Otherwise, check if we can use a reference (only for unmodified textures)
                  let textureFileName: string | null = null
                  if (!isModified && texture.image && (texture.image as any).src) {
                    const src = (texture.image as any).src
                    if (typeof src === 'string' && !src.startsWith('data:') && !src.startsWith('blob:')) {
                      // Extract filename from URL or path
                      const urlParts = src.split('/')
                      textureFileName = urlParts[urlParts.length - 1]?.split('?')[0] || null
                    }
                  }
                  
                  // Only use reference for unmodified textures that are in modelFiles
                  // Modified textures must always be saved to preserve user changes
                  if (!isModified && textureFileName && textureFilesInModelFiles.has(textureFileName.toLowerCase())) {
                    // Save a reference instead of embedding (only for unmodified textures)
                    (saved as any)[prop] = `texture:${textureFileName}` // Reference format
                    continue
                  }
                  
                  // For modified textures or textures not in modelFiles, always serialize the actual texture data
                  
                  // OPTIMIZED: Use JPEG for non-alpha textures to reduce size (much smaller than PNG)
                  // Check if texture has alpha channel by checking if material uses transparency
                  const hasAlpha = material.transparent || (material.opacity !== undefined && material.opacity < 1.0)
                  const format = hasAlpha ? 'image/png' : 'image/jpeg'
                  const quality = hasAlpha ? undefined : 0.75 // Reduced JPEG quality (0.75 = smaller file, still good quality)
                  
                  // Convert to data URL with optimized format
                  const dataUrl = format === 'image/jpeg' 
                    ? canvas.toDataURL('image/jpeg', quality)
                    : canvas.toDataURL('image/png')
                  
                  if (dataUrl && dataUrl !== 'data:,') {
                    (saved as any)[prop] = dataUrl
                    textureSerializationCount++
                    texturesSerialized++
                    
                    // Update progress every 10 textures or every 50 total
                    if (texturesSerialized % 10 === 0 || textureSerializationCount % 50 === 0) {
                      if (onProgress && texturesToSerialize > 0) {
                        onProgress(texturesSerialized, texturesToSerialize)
                      }
                    if (textureSerializationCount % 50 === 0) {
                      console.log(`[ProjectPersistence] Serialized ${textureSerializationCount} textures...`)
                      }
                    }
                  } else {
                    console.warn(`[ProjectPersistence] Failed to serialize texture ${prop}: empty data URL`)
                  }
                } catch (drawError) {
                  // This is the specific error we're trying to catch
                  console.warn(`[ProjectPersistence] Failed to draw image for texture ${prop}:`, drawError)
                  // Continue to next texture instead of failing completely
                }
              } catch (canvasError) {
                console.warn(`[ProjectPersistence] Failed to serialize texture ${prop} to canvas:`, canvasError)
              }
              
              // Yield to browser after each texture to prevent blocking
              // Yield more frequently for large textures
              if (texturesSerialized % 5 === 0) {
              await yieldToBrowser()
              }
            }
        }
      } catch (e) {
        // If texture serialization fails, just skip it
          console.warn(`[ProjectPersistence] Failed to serialize texture ${prop}:`, e)
        }
      }
    }
  }

  return saved
}

// Serialize a scene object recursively
const serializeSceneObject = async (obj: THREE.Object3D, scene: THREE.Scene, isTopLevel: boolean = false): Promise<SavedSceneObject | null> => {
  // Skip helper objects, lights, cameras, and internal groups
  if (
    obj instanceof THREE.Light ||
    obj instanceof THREE.Camera ||
    obj.type === 'GridHelper' ||
    obj.type === 'AxesHelper' ||
    obj.type === 'TransformControls' ||
    obj.userData.isStartingObjectsGroup ||
    obj.userData.isNativeObjectsGroup ||
    obj.userData.isPivotWrapper ||
    (obj.parent && obj.parent.userData.isPivotWrapper)
  ) {
    return null
  }

  const saved: SavedSceneObject = {
    id: obj.uuid,
    name: obj.name || 'Unnamed Object',
    type: 'other',
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    visible: obj.visible,
    materials: [],
    userData: {}
  }

  // CRITICAL: Only treat as "imported model" if:
  // 1. It's a top-level object (direct child of scene) AND
  // 2. It has a fileName
  // This prevents child objects inside models from being saved as separate models
  const isDirectChildOfScene = obj.parent === scene
  const hasFileName = !!obj.userData.fileName
  
  // Only mark as "imported" model if it's a top-level object with a fileName
  // Child objects should never be saved as models, even if they have the isModel flag
  if (hasFileName && isDirectChildOfScene) {
    saved.userData!.fileName = obj.userData.fileName
    saved.userData!.isModel = obj.userData.isModel
    saved.userData!.isImportedModel = obj.userData.isImportedModel
    
      saved.type = 'imported'
      saved.fileName = obj.userData.fileName
    // Also save fileUrl if available (for loading referenced files)
    if (obj.userData.fileUrl) {
      saved.fileUrl = obj.userData.fileUrl
    }
  }
  
  // Check for primitives (only if not already marked as imported)
  if (saved.type === 'other' && obj.name && (obj.name.startsWith('Box ') || obj.name.startsWith('Sphere ') || 
             obj.name.startsWith('Plane ') || obj.name.startsWith('Cone ') || 
             obj.name.startsWith('Cylinder ') || obj.name.startsWith('Torus ') ||
             obj.name.startsWith('Tetrahedron ') || obj.name.startsWith('Octahedron '))) {
    saved.type = 'primitive'
    const typeMatch = obj.name.match(/^(Box|Sphere|Plane|Cone|Cylinder|Torus|Tetrahedron|Octahedron)/)
    if (typeMatch) {
      saved.primitiveType = typeMatch[1].toLowerCase() as any
    }
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const box = new THREE.Box3().setFromObject(obj)
      saved.primitiveSize = {
        x: box.max.x - box.min.x,
        y: box.max.y - box.min.y,
        z: box.max.z - box.min.z
      }
    }
  } else if (obj.userData.isPolygon) {
    saved.type = 'polygon'
    if (obj.userData.vertices) {
      saved.polygonVertices = obj.userData.vertices.map((v: THREE.Vector3) => ({
        x: v.x, y: v.y, z: v.z
      }))
    }
    if (obj.userData.fillOpacity !== undefined) {
      saved.polygonFillOpacity = obj.userData.fillOpacity
    }
  }

  // Serialize materials
  // CRITICAL: Pass textureFilesInModelFiles to skip embedding textures that are already saved
  if (obj instanceof THREE.Mesh && obj.material) {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of materials) {
      // Get textureFilesInModelFiles from the closure (set during createProjectSnapshot)
      const textureFilesSet = (serializeSceneObjects as any).textureFilesInModelFiles || new Set<string>()
      const serialized = await serializeMaterial(mat, false, textureFilesSet, undefined) // Progress callback not available at material level
      saved.materials.push(serialized)
    }
  }

  // Serialize children (recursively, but skip pivot wrappers and helpers)
  // Pass false for isTopLevel since these are children, not top-level objects
  if (obj.children.length > 0) {
    saved.children = []
    for (const child of obj.children) {
      const childSaved = await serializeSceneObject(child, scene, false)
      if (childSaved) {
        saved.children.push(childSaved)
      }
    }
  }

  // CRITICAL: Skip saving empty "other" type objects (empty groups with no content)
  // These create "Unnamed Object" entries that appear empty in the scene
  // NOTE: This check happens AFTER children are serialized, so we can check if saved.children has content
  if (saved.type === 'other' && isTopLevel) {
    // Check if this object has any actual content
    let hasContent = false
    
    // Check if it's a mesh (has geometry)
    if (obj instanceof THREE.Mesh && obj.geometry) {
      hasContent = true
    }
    
    // Check if it has children that were successfully saved (AFTER serialization)
    // This is critical - children might have been filtered out during serialization
    if (saved.children && saved.children.length > 0) {
      // Double-check: verify at least one child has actual content
      const hasValidChild = saved.children.some(child => 
        child.type !== 'other' || // Not an empty "other" type
        (child.children && child.children.length > 0) || // Has children
        (child.materials && child.materials.length > 0) // Has materials
      )
      if (hasValidChild) {
        hasContent = true
      }
    }
    
    // Check if it has materials (might be a mesh that will be restored)
    if (saved.materials && saved.materials.length > 0) {
      hasContent = true
    }
    
    // Check if it has any meaningful userData
    const meaningfulUserData = Object.keys(obj.userData).filter(key => 
      !key.startsWith('_') && 
      key !== 'isStartingObjectsGroup' && 
      key !== 'isNativeObjectsGroup' &&
      key !== 'isPivotWrapper'
    )
    if (meaningfulUserData.length > 0) {
      hasContent = true
    }
    
    // If it's an empty group with no content, skip saving it
    if (!hasContent) {
      console.log(`[ProjectPersistence] Skipping empty "other" type object: "${saved.name}" (no content to save, children: ${saved.children?.length || 0}, materials: ${saved.materials?.length || 0})`)
      return null
    }
  }

  return saved
}

// Serialize all scene objects with periodic yields to prevent blocking
const serializeSceneObjects = async (
  scene: THREE.Scene,
  textureFilesInModelFiles?: Set<string>
): Promise<SavedSceneObject[]> => {
  // Store textureFilesInModelFiles for use in serializeMaterial
  (serializeSceneObjects as any).textureFilesInModelFiles = textureFilesInModelFiles || new Set<string>()
  
  // Reset texture counter at start
  textureSerializationCount = 0
  
  const objects: SavedSceneObject[] = []
  const children = Array.from(scene.children)
  let processed = 0
  
  console.log(`[ProjectPersistence] Serializing ${children.length} scene object(s)...`)
  
  for (const child of children) {
    // Top-level objects are direct children of the scene
    // Log models being serialized for debugging
    if (child.userData.isModel || child.userData.isImportedModel) {
      console.log(`[ProjectPersistence] Serializing model: "${child.name}" (fileName: ${child.userData.fileName || 'none'}, isAutoLoaded: ${child.userData.isAutoLoaded || false})`)
    } else if (!child.userData.isStartingObjectsGroup && !child.userData.isNativeObjectsGroup && !(child instanceof THREE.Light) && !(child instanceof THREE.Camera)) {
      // Log other objects that might become "Unnamed Object" entries
      const childCount = child.children.length
      const isMesh = child instanceof THREE.Mesh
      const hasGeometry = isMesh && (child as THREE.Mesh).geometry !== undefined
      console.log(`[ProjectPersistence] Serializing object: "${child.name || 'unnamed'}" (type: ${child.type}, children: ${childCount}, isMesh: ${isMesh}, hasGeometry: ${hasGeometry})`)
    }
    
    const saved = await serializeSceneObject(child, scene, true)
    if (saved) {
      objects.push(saved)
      if (saved.type === 'imported') {
        console.log(`[ProjectPersistence] ✅ Serialized imported model: "${saved.name}" (${saved.fileName})`)
      }
    } else if (child.userData.isModel || child.userData.isImportedModel) {
      console.warn(`[ProjectPersistence] ⚠️ Model "${child.name}" (${child.userData.fileName || 'no fileName'}) was skipped during serialization`)
    }
    
    processed++
    // Yield to browser every 5 objects to prevent blocking
    if (processed % 5 === 0) {
      await yieldToBrowser()
      console.log(`[ProjectPersistence] Progress: ${processed}/${children.length} objects serialized (${textureSerializationCount} textures)`)
    }
  }
  
  console.log(`[ProjectPersistence] ✅ Serialized ${objects.length} scene object(s) with ${textureSerializationCount} textures`)
  return objects
}

export async function createProjectSnapshot(onProgress?: (progress: number, message: string) => void): Promise<SavedProject> {
  const store = useAppStore.getState()
  const viewer = getSharedViewer()
  if (!viewer) {
    throw new Error('Viewer not ready; please wait until the scene finishes loading.')
  }

  const cameraState = viewer.getCameraState()
  let hdrSerialization: HdrSerialized = null

  if (store.hdrFile) {
    const buffer = await store.hdrFile.arrayBuffer()
    hdrSerialization = {
      type: 'embedded',
      name: store.hdrFile.name,
      mimeType: store.hdrFile.type || 'application/octet-stream',
      data: arrayBufferToBase64(buffer)
    }
  } else if (store.hdrUrl && !store.hdrUrl.startsWith('blob:')) {
    hdrSerialization = {
      type: 'url',
      url: store.hdrUrl
    }
  }

  onProgress?.(5, 'Collecting scene objects...')
  
  // CRITICAL: First collect all texture file names that will be embedded in modelFiles
  // This allows us to skip embedding them again in materials (reduces file size significantly)
  const textureFilesInModelFiles = new Set<string>()
  
  // Serialize all scene objects (textureFilesInModelFiles will be populated after modelFiles are collected)
  // We'll do this in two passes: first collect modelFiles, then serialize with texture info
  const sceneObjects = await serializeSceneObjects(viewer.scene)
  onProgress?.(10, 'Scene objects collected')

  // Load hotspots from localStorage
  let hotspots: SavedProject['store']['hotspots'] = []
  try {
    const hotspotsStorage = localStorage.getItem('3d-viewer-hotspots')
    if (hotspotsStorage) {
      const parsed = JSON.parse(hotspotsStorage)
      if (Array.isArray(parsed)) {
        hotspots = parsed
        console.log(`[ProjectPersistence] Saving ${hotspots.length} hotspot(s)`)
      }
    }
  } catch (e) {
    console.warn('[ProjectPersistence] Failed to load hotspots from storage:', e)
  }

  onProgress?.(15, 'Collecting model files...')

  // Collect model files from scene objects - IMPROVED: Include file data if available
  // CRITICAL: Only process top-level models (direct children of scene) to match serialization logic
  const modelFiles: SavedProject['store']['modelFiles'] = []
  const processedFileNames = new Set<string>()
  const processedTextureFiles = new Set<string>() // Track texture files to avoid duplicates
  const modelFilePromises: Promise<void>[] = []
  
  // Track total embedded size to prevent excessive file sizes
  let totalEmbeddedSize = 0
  const MAX_TOTAL_EMBEDDED_SIZE = 100 * 1024 * 1024 // 100MB total limit
  
  // Count total models for progress tracking
  const topLevelModels = Array.from(viewer.scene.children).filter(obj => 
    obj.parent === viewer.scene && (obj.userData.isModel || obj.userData.isImportedModel)
  )
  let processedModels = 0
  
  // Only iterate through direct children of scene (top-level objects)
  // This matches the serialization logic which only saves top-level objects
  for (const obj of viewer.scene.children) {
    // Only process if it's a model and is a direct child of scene
    const isTopLevelModel = obj.parent === viewer.scene && (obj.userData.isModel || obj.userData.isImportedModel)
    if (isTopLevelModel) {
      const fileName = obj.userData.fileName
      if (fileName && !processedFileNames.has(fileName)) {
        processedFileNames.add(fileName)
        
        // Create promise for async file processing
        const filePromise = (async () => {
          processedModels++
          onProgress?.(15 + Math.floor((processedModels / topLevelModels.length) * 20), `Processing model ${processedModels}/${topLevelModels.length}...`)
          // Try to get original file from registry
          const originalFile = fileRegistry.getModelFile(fileName)
          
          // CRITICAL: Debug file lookup
          if (!originalFile) {
            console.warn(`[ProjectPersistence] ⚠️ Model file "${fileName}" not found in registry`)
            console.warn(`[ProjectPersistence]   Available files in registry:`, Array.from(fileRegistry.getAllModelFiles().keys()))
            console.warn(`[ProjectPersistence]   Object userData:`, {
              fileName: obj.userData.fileName,
              fileUrl: obj.userData.fileUrl,
              isModel: obj.userData.isModel,
              isImportedModel: obj.userData.isImportedModel
            })
          } else {
            console.log(`[ProjectPersistence] ✅ Found model file in registry: ${fileName} (${(originalFile.size / 1024 / 1024).toFixed(2)} MB)`)
          }
          
          // Get fileUrl from object userData (might be blob URL, data URL, or external URL)
          const fileUrl = obj.userData.fileUrl
          
          const modelFileEntry: NonNullable<SavedProject['store']['modelFiles']>[number] = {
            fileName,
            fileUrl: fileUrl || undefined
          }
          
          // If we have a fileUrl but no file in registry, try to fetch it now for embedding
          // This handles cases where models were loaded from URLs
          if (fileUrl && !originalFile && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
            try {
              console.log(`[ProjectPersistence] Attempting to fetch model file from URL for embedding: ${fileName}`)
              const response = await fetch(fileUrl)
              if (response.ok) {
                const blob = await response.blob()
                const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
                // Register it for future use
                fileRegistry.registerModelFile(fileName, file)
                // Now try to embed it
                if (file.size < 50 * 1024 * 1024) {
                  const buffer = await file.arrayBuffer()
                  modelFileEntry.fileData = arrayBufferToBase64(buffer)
                  console.log(`[ProjectPersistence] ✅ Fetched and embedded model file from URL: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
                } else {
                  console.log(`[ProjectPersistence] Model file from URL is too large (${(file.size / 1024 / 1024).toFixed(2)} MB), storing reference only`)
                }
              }
            } catch (fetchError) {
              console.warn(`[ProjectPersistence] Could not fetch model file from URL ${fileUrl}:`, fetchError)
              // Continue with just the URL reference
            }
          }
          
          // IMPROVED: For GLTF files, detect and save external .bin files AND texture images
          let binFilesToSave: Array<{ fileName: string; file: File }> = []
          let textureFilesToSave: Array<{ fileName: string; file: File }> = []
          if (originalFile && fileName.toLowerCase().endsWith('.gltf')) {
            try {
              const gltfText = await originalFile.text()
              const gltfJson = JSON.parse(gltfText)
              
              // Get base directory for resolving relative paths
              const gltfDir = obj.userData.fileUrl 
                ? obj.userData.fileUrl.substring(0, obj.userData.fileUrl.lastIndexOf('/') + 1)
                : ''
              
              // Check for external buffer references (.bin files)
              if (gltfJson.buffers && Array.isArray(gltfJson.buffers)) {
                for (const buffer of gltfJson.buffers) {
                  if (buffer.uri && !buffer.uri.startsWith('data:')) {
                    // External .bin file referenced
                    const binFileName = buffer.uri.split('/').pop() || buffer.uri
                    // Try to find the .bin file - check registry first, then try to find by name
                    let binFile = fileRegistry.getModelFile(binFileName)
                    
                    // If not in registry, try to find it in the same directory as the GLTF
                    if (!binFile && gltfDir) {
                      const binUrl = gltfDir + binFileName
                      try {
                        const response = await fetch(binUrl)
                        if (response.ok) {
                          const blob = await response.blob()
                          binFile = new File([blob], binFileName, { type: 'application/octet-stream' })
                          fileRegistry.registerModelFile(binFileName, binFile)
                          console.log(`[ProjectPersistence] Found and registered .bin file: ${binFileName}`)
                        }
                      } catch (fetchError) {
                        // .bin file not accessible via URL - will need to be loaded manually
                        console.warn(`[ProjectPersistence] Could not fetch .bin file ${binFileName} from ${binUrl}`)
                      }
                    }
                    
                    if (binFile) {
                      binFilesToSave.push({ fileName: binFileName, file: binFile })
                    } else {
                      console.warn(`[ProjectPersistence] ⚠️ GLTF references .bin file "${binFileName}" but file not found. Model may not load correctly.`)
                    }
                  }
                }
              }
              
              // Check for external texture image references
              if (gltfJson.images && Array.isArray(gltfJson.images)) {
                for (const image of gltfJson.images) {
                  // Only process images with URI (external files), skip bufferView (embedded) and data URIs
                  if (image.uri && !image.uri.startsWith('data:') && image.bufferView === undefined) {
                    // Preserve the original path from GLTF (e.g., "images/texture.jpg")
                    const texturePath = image.uri
                    const textureFileName = texturePath.split('/').pop() || texturePath
                    
                    // Try to find the texture file - check registry first (by filename)
                    let textureFile = fileRegistry.getModelFile(textureFileName)
                    
                    // If not in registry, try to fetch it from the same directory as the GLTF
                    if (!textureFile && gltfDir) {
                      // Handle both absolute and relative paths
                      let textureUrl = texturePath
                      if (!textureUrl.startsWith('http://') && !textureUrl.startsWith('https://') && !textureUrl.startsWith('blob:')) {
                        // Relative path - resolve against GLTF directory
                        textureUrl = gltfDir + texturePath
                      }
                      
                      try {
                        const response = await fetch(textureUrl)
                        if (response.ok) {
                          const blob = await response.blob()
                          // Determine MIME type from response or file extension
                          let mimeType = blob.type || 'image/png'
                          if (!mimeType.startsWith('image/')) {
                            const ext = textureFileName.split('.').pop()?.toLowerCase()
                            if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
                            else if (ext === 'png') mimeType = 'image/png'
                            else if (ext === 'webp') mimeType = 'image/webp'
                            else mimeType = 'image/png' // default
                          }
                          textureFile = new File([blob], textureFileName, { type: mimeType })
                          // Register with filename (for lookup by filename)
                          fileRegistry.registerModelFile(textureFileName, textureFile)
                          console.log(`[ProjectPersistence] Found and registered texture file: ${texturePath} (${textureFileName}, ${(blob.size / 1024).toFixed(2)} KB)`)
                        }
                      } catch (fetchError) {
                        console.warn(`[ProjectPersistence] Could not fetch texture file ${texturePath} from ${textureUrl}:`, fetchError)
                      }
                    }
                    
                    if (textureFile) {
                      // Save with filename (for compatibility), but we'll match by path during restore
                      textureFilesToSave.push({ fileName: textureFileName, file: textureFile })
                    } else {
                      console.warn(`[ProjectPersistence] ⚠️ GLTF references texture "${texturePath}" but file not found. Textures may not load correctly.`)
                    }
                  }
                }
              }
            } catch (gltfParseError) {
              console.warn(`[ProjectPersistence] Could not parse GLTF to find .bin files:`, gltfParseError)
            }
          }
          
          // IMPROVED: Embed file data if available and file is reasonably sized (< 50MB)
          // Also check total embedded size limit
          const estimatedBase64Size = originalFile ? originalFile.size * 1.33 : 0
          const canEmbed = originalFile && 
                          originalFile.size < 50 * 1024 * 1024 && 
                          (totalEmbeddedSize + estimatedBase64Size) <= MAX_TOTAL_EMBEDDED_SIZE
          
          if (canEmbed) {
            try {
              const buffer = await originalFile.arrayBuffer()
              
              // CRITICAL: Validate buffer before encoding
              if (!buffer || buffer.byteLength === 0) {
                console.warn(`[ProjectPersistence] ⚠️ Empty buffer for ${fileName}, skipping embedding`)
              } else if (buffer.byteLength !== originalFile.size) {
                console.warn(`[ProjectPersistence] ⚠️ Buffer size mismatch for ${fileName}: buffer=${buffer.byteLength}, file.size=${originalFile.size}`)
              }
              
              // Encode to base64
              const base64 = arrayBufferToBase64(buffer)
              totalEmbeddedSize += base64.length
              
              // CRITICAL: Validate base64 encoding by decoding and comparing sizes
              try {
                const testDecode = base64ToArrayBuffer(base64)
                if (testDecode.byteLength !== buffer.byteLength) {
                  console.error(`[ProjectPersistence] ❌ Base64 encoding validation failed for ${fileName}: ` +
                    `original=${buffer.byteLength}, decoded=${testDecode.byteLength}`)
                  // Continue anyway but log the issue
                } else {
                  console.log(`[ProjectPersistence] ✅ Base64 encoding validated for ${fileName} (${buffer.byteLength} bytes)`)
                }
              } catch (validationError) {
                console.error(`[ProjectPersistence] ❌ Base64 validation error for ${fileName}:`, validationError)
                // Continue anyway - might still work
              }
              
              modelFileEntry.fileData = base64
              console.log(`[ProjectPersistence] ✅ Embedded model file data: ${fileName} (${(originalFile.size / 1024 / 1024).toFixed(2)} MB, base64: ${base64.length} chars)`)
              
              // Also save referenced .bin files (with size limit check)
              for (const { fileName: binFileName, file: binFile } of binFilesToSave) {
                const binEstimatedSize = binFile.size * 1.33
                if (binFile.size < 50 * 1024 * 1024 && (totalEmbeddedSize + binEstimatedSize) <= MAX_TOTAL_EMBEDDED_SIZE) {
                  try {
                    const binBuffer = await binFile.arrayBuffer()
                    const binBase64 = arrayBufferToBase64(binBuffer)
                    
                    // Create a separate model file entry for the .bin file
                    const binFileEntry: NonNullable<SavedProject['store']['modelFiles']>[number] = {
                      fileName: binFileName,
                      fileData: binBase64
                    }
                    modelFiles.push(binFileEntry)
                    totalEmbeddedSize += binBase64.length
                    console.log(`[ProjectPersistence] ✅ Embedded referenced .bin file: ${binFileName} (${(binFile.size / 1024 / 1024).toFixed(2)} MB)`)
                  } catch (binError) {
                    console.warn(`[ProjectPersistence] Failed to embed .bin file ${binFileName}:`, binError)
                  }
                } else {
                  if (totalEmbeddedSize + binEstimatedSize > MAX_TOTAL_EMBEDDED_SIZE) {
                    console.log(`[ProjectPersistence] .bin file ${binFileName} skipped: total embedded size limit reached`)
                  } else {
                    console.log(`[ProjectPersistence] .bin file ${binFileName} is too large (${(binFile.size / 1024 / 1024).toFixed(2)} MB), storing reference only`)
                  }
                }
              }
              
              // Also save referenced texture files (with deduplication)
              for (const { fileName: textureFileName, file: textureFile } of textureFilesToSave) {
                // Skip if already processed (deduplication)
                if (processedTextureFiles.has(textureFileName)) {
                  console.log(`[ProjectPersistence] Skipping duplicate texture file: ${textureFileName}`)
                  continue
                }
                
                // Check total size limit
                const estimatedBase64Size = textureFile.size * 1.33 // Base64 adds ~33%
                if (totalEmbeddedSize + estimatedBase64Size > MAX_TOTAL_EMBEDDED_SIZE) {
                  console.log(`[ProjectPersistence] Skipping texture ${textureFileName}: total embedded size limit reached (${(totalEmbeddedSize / 1024 / 1024).toFixed(2)} MB)`)
                  continue
                }
                
                if (textureFile.size < 50 * 1024 * 1024) {
                  try {
                    const textureBuffer = await textureFile.arrayBuffer()
                    const textureBase64 = arrayBufferToBase64(textureBuffer)
                    
                    // Create a separate model file entry for the texture file
                    const textureFileEntry: NonNullable<SavedProject['store']['modelFiles']>[number] = {
                      fileName: textureFileName,
                      fileData: textureBase64
                    }
                    modelFiles.push(textureFileEntry)
                    processedTextureFiles.add(textureFileName)
                    totalEmbeddedSize += textureBase64.length
                    console.log(`[ProjectPersistence] ✅ Embedded referenced texture file: ${textureFileName} (${(textureFile.size / 1024).toFixed(2)} KB)`)
                  } catch (textureError) {
                    console.warn(`[ProjectPersistence] Failed to embed texture file ${textureFileName}:`, textureError)
                  }
                } else {
                  console.log(`[ProjectPersistence] Texture file ${textureFileName} is too large (${(textureFile.size / 1024 / 1024).toFixed(2)} MB), storing reference only`)
                }
              }
            } catch (error) {
              console.warn(`[ProjectPersistence] Failed to embed model file ${fileName}:`, error)
              // Still save the fileUrl if available
              if (!modelFileEntry.fileUrl && obj.userData.fileUrl) {
                modelFileEntry.fileUrl = obj.userData.fileUrl
              }
            }
          } else if (originalFile && (originalFile.size >= 50 * 1024 * 1024 || (totalEmbeddedSize + estimatedBase64Size) > MAX_TOTAL_EMBEDDED_SIZE)) {
            if ((totalEmbeddedSize + estimatedBase64Size) > MAX_TOTAL_EMBEDDED_SIZE) {
              console.log(`[ProjectPersistence] Model file ${fileName} skipped: total embedded size limit reached (${(totalEmbeddedSize / 1024 / 1024).toFixed(2)} MB used)`)
            } else {
            console.log(`[ProjectPersistence] Model file ${fileName} is too large (${(originalFile.size / 1024 / 1024).toFixed(2)} MB), storing reference only`)
            }
            // Ensure fileUrl is saved even for large files
            if (!modelFileEntry.fileUrl && obj.userData.fileUrl) {
              modelFileEntry.fileUrl = obj.userData.fileUrl
              console.log(`[ProjectPersistence] ✅ Saved fileUrl for large model: ${fileName}`)
            } else if (!modelFileEntry.fileUrl) {
              // CRITICAL: For files loaded from disk, we can't restore them automatically
              // But we can mark them so the user knows they need to reload
              if (obj.userData.fileSource === 'disk') {
                console.warn(`[ProjectPersistence] ⚠️ Large model ${fileName} was loaded from disk and cannot be automatically restored`)
                console.warn(`[ProjectPersistence]   File size: ${(obj.userData.fileSize / 1024 / 1024).toFixed(2)} MB`)
                console.warn(`[ProjectPersistence]   User will need to manually reload this file when loading the project`)
                // Store a special marker to indicate this file needs manual reload
                modelFileEntry.requiresManualReload = true
                modelFileEntry.originalFileSize = obj.userData.fileSize
              } else {
                console.warn(`[ProjectPersistence] ⚠️ Large model ${fileName} has no fileUrl - may not be restorable`)
              }
            }
          } else if (!originalFile && !fileUrl) {
            // No file in registry and no URL - this is a problem
            console.error(`[ProjectPersistence] ❌ CRITICAL: Model file ${fileName} not found in registry and no URL available.`)
            console.error(`[ProjectPersistence]   This model will NOT be restorable when loading the project.`)
            console.error(`[ProjectPersistence]   Please ensure the model file is loaded before saving the project.`)
            console.error(`[ProjectPersistence]   Debug info:`, {
              fileName,
              objectName: obj.name,
              userDataFileName: obj.userData.fileName,
              userDataFileUrl: obj.userData.fileUrl,
              isModel: obj.userData.isModel,
              isImportedModel: obj.userData.isImportedModel,
              registryFiles: Array.from(fileRegistry.getAllModelFiles().keys())
            })
          } else if (!originalFile && fileUrl) {
            console.log(`[ProjectPersistence] Model file ${fileName} not in registry but has URL: ${fileUrl}`)
            console.log(`[ProjectPersistence]   Will attempt to load from URL when restoring project.`)
            
            // If it's a blob URL, we can't fetch it, but we should still save the reference
            if (fileUrl.startsWith('blob:')) {
              console.warn(`[ProjectPersistence] ⚠️ Model file ${fileName} has blob URL - cannot be restored from blob URL.`)
              console.warn(`[ProjectPersistence]   The file should have been registered when loaded. This may indicate a registration issue.`)
            }
          }
          
          modelFiles.push(modelFileEntry)
        })()
        
        modelFilePromises.push(filePromise)
      }
    }
  }
  
  // Wait for all file processing to complete
  await Promise.all(modelFilePromises)
  
  // CRITICAL: Validate that all models have files or URLs
  console.log(`[ProjectPersistence] ========================================`)
  console.log(`[ProjectPersistence] 📊 PROJECT SAVE SUMMARY`)
  console.log(`[ProjectPersistence] ========================================`)
  console.log(`[ProjectPersistence] Scene objects serialized: ${sceneObjects.length}`)
  console.log(`[ProjectPersistence] Model files collected: ${modelFiles.length}`)
  
  // Count models by type
  const importedModels = sceneObjects.filter(obj => obj.type === 'imported')
  const primitives = sceneObjects.filter(obj => obj.type === 'primitive')
  const otherObjects = sceneObjects.filter(obj => obj.type === 'other')
  
  console.log(`[ProjectPersistence]   - Imported models: ${importedModels.length}`)
  console.log(`[ProjectPersistence]   - Primitives: ${primitives.length}`)
  console.log(`[ProjectPersistence]   - Other objects: ${otherObjects.length}`)
  
  // Check for models without files
  const modelsWithoutFiles: string[] = []
  importedModels.forEach(model => {
    if (model.fileName) {
      const hasFile = modelFiles.some(f => f.fileName === model.fileName && f.fileData)
      const hasUrl = modelFiles.some(f => f.fileName === model.fileName && f.fileUrl)
      if (!hasFile && !hasUrl) {
        modelsWithoutFiles.push(model.fileName)
      }
    }
  })
  
  if (modelsWithoutFiles.length > 0) {
    console.warn(`[ProjectPersistence] ⚠️ WARNING: ${modelsWithoutFiles.length} model(s) have no embedded file data or URL:`)
    modelsWithoutFiles.forEach(fileName => {
      console.warn(`[ProjectPersistence]   - ${fileName}`)
    })
    console.warn(`[ProjectPersistence]   These models may not be restorable when loading the project.`)
  } else {
    console.log(`[ProjectPersistence] ✅ All models have file data or URLs`)
  }
  
  // Count embedded vs referenced files
  const embeddedFiles = modelFiles.filter(f => f.fileData).length
  const referencedFiles = modelFiles.filter(f => !f.fileData && f.fileUrl).length
  const missingFiles = modelFiles.filter(f => !f.fileData && !f.fileUrl).length
  
  // Calculate total embedded size
  let totalEmbeddedBytes = 0
  modelFiles.forEach(f => {
    if (f.fileData) {
      // Base64 size is ~33% larger than original, so estimate original size
      totalEmbeddedBytes += Math.floor(f.fileData.length * 0.75)
    }
  })
  
  console.log(`[ProjectPersistence] Model files:`)
  console.log(`[ProjectPersistence]   - Embedded: ${embeddedFiles} (${(totalEmbeddedBytes / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`[ProjectPersistence]   - Referenced (URL): ${referencedFiles}`)
  if (missingFiles > 0) {
    console.warn(`[ProjectPersistence]   - Missing: ${missingFiles}`)
  }
  
  console.log(`[ProjectPersistence] Total embedded size: ${(totalEmbeddedSize / 1024 / 1024).toFixed(2)} MB / ${(MAX_TOTAL_EMBEDDED_SIZE / 1024 / 1024).toFixed(2)} MB limit`)
  console.log(`[ProjectPersistence] ========================================`)

  return {
    version: 5, // Version 5: Enhanced with embedded model files and improved file tracking
    savedAt: new Date().toISOString(),
    camera: {
      position: { x: cameraState.position.x, y: cameraState.position.y, z: cameraState.position.z },
      target: { x: cameraState.target.x, y: cameraState.target.y, z: cameraState.target.z }
    },
    menuLayout: cloneMenuLayout(store.menuLayout),
    menuRowBreaks: cloneMenuRowBreaks(store.menuRowBreaks),
    sceneObjects, // Include all scene objects with materials and transformations
    store: {
      selections: {
        showGrid: store.showGrid,
        showAxes: store.showAxes,
        showBoundingBoxes: store.showBoundingBoxes,
        showStats: store.showStats,
        showShadowPlane: store.showShadowPlane,
        shadowPlaneTransparent: store.shadowPlaneTransparent,
        pivotMode: store.pivotMode
      },
      lighting: {
        ambientIntensity: store.ambientIntensity,
        shadowsEnabled: store.shadowsEnabled,
        shadowIntensity: store.shadowIntensity,
        shadowBias: store.shadowBias,
        shadowOpacityEnabled: store.shadowOpacityEnabled,
        shadowOpacity: store.shadowOpacity,
        shadowColor: store.shadowColor,
        directionalLights: store.directionalLights.map((light) => ({ ...light })),
        selectedLightId: store.selectedLightId,
        pathTracerLighting: { ...store.pathTracerLighting }
      },
      hdr: {
        enabled: store.hdrEnabled,
        intensity: store.hdrIntensity,
        rotationAzimuth: store.hdrRotationAzimuth,
        rotationElevation: store.hdrRotationElevation,
        backgroundVisible: store.hdrBackgroundVisible,
        groundProjectionEnabled: store.hdrGroundProjectionEnabled,
        groundProjectionHeight: store.hdrGroundProjectionHeight,
        groundProjectionRadius: store.hdrGroundProjectionRadius,
        northOffset: store.northOffset,
        serialization: hdrSerialization
      },
      weather: {
        weatherPreset: store.weatherPreset,
        cloudDensity: store.cloudDensity,
        cloudThickness: store.cloudThickness,
        cloudDetail: store.cloudDetail,
        cloudScale: store.cloudScale,
        cloudStorminess: store.cloudStorminess,
        cloudShadowStrength: store.cloudShadowStrength,
        cloudColor: store.cloudColor,
        fogDensity: store.fogDensity,
        fogHeight: store.fogHeight,
        fogColor: store.fogColor,
        rainIntensity: store.rainIntensity,
        snowIntensity: store.snowIntensity,
        windIntensity: store.windIntensity,
        timeOfDay: store.timeOfDay,
        skyTurbidity: store.skyTurbidity,
        skyAtmosphereDensity: store.skyAtmosphereDensity,
        skyRayleigh: store.skyRayleigh,
        skyMieCoefficient: store.skyMieCoefficient,
        skyMieDirectionalG: store.skyMieDirectionalG,
        skyExposure: store.skyExposure,
        dynamicSkyEnabled: store.dynamicSkyEnabled,
        sunSize: store.sunSize,
        moonSize: store.moonSize,
        weatherQuality: store.weatherQuality,
        rainParticleScale: store.rainParticleScale,
        rainParticleSpeed: store.rainParticleSpeed,
        rainCollisionEnabled: store.rainCollisionEnabled,
        snowParticleScale: store.snowParticleScale,
        snowParticleSpeed: store.snowParticleSpeed,
        snowCollisionEnabled: store.snowCollisionEnabled,
        windGustsEnabled: store.windGustsEnabled
      },
      rendering: {
        textureAnisotropy: store.textureAnisotropy,
        pixelRatio: store.pixelRatio,
        maxPixelRatio: store.maxPixelRatio,
        useLogarithmicDepthBuffer: store.useLogarithmicDepthBuffer,
        useHighPerformanceGPU: store.useHighPerformanceGPU,
        preferCPU: store.preferCPU,
        vsyncEnabled: store.vsyncEnabled,
        maxFPS: store.maxFPS,
        upscalingEnabled: store.upscalingEnabled,
        upscalingQuality: store.upscalingQuality
      },
      water: {
        enabled: store.waterEnabled,
        level: store.waterLevel,
        color: store.waterColor,
        opacity: store.waterOpacity,
        waveSpeed: store.waveSpeed,
        waveHeight: store.waveHeight,
        reflectivity: store.waterReflectivity,
        mode: store.waterMode,
        marchingCubesResolution: store.marchingCubesResolution,
        marchingCubesIsolation: store.marchingCubesIsolation,
        marchingCubesMetaballCount: store.marchingCubesMetaballCount,
        oceanDistortionScale: store.oceanDistortionScale,
        oceanSize: store.oceanSize
      },
      pathTracer: {
        active: store.pathTracerActive,
        mode: store.pathTracerMode,
        settings: { ...store.pathTracerSettings },
        lighting: { ...store.pathTracerLighting }
      },
      postProcessing: {
        enabled: store.postProcessingEnabled,
        bloomEnabled: store.bloomEnabled,
        bloomStrength: store.bloomStrength,
        bloomRadius: store.bloomRadius,
        bloomThreshold: store.bloomThreshold,
        lutEnabled: store.lutEnabled,
        lutIntensity: store.lutIntensity,
        anamorphicEnabled: store.anamorphicEnabled,
        anamorphicIntensity: store.anamorphicIntensity,
        anamorphicThreshold: store.anamorphicThreshold,
        anamorphicScale: store.anamorphicScale,
        anamorphicColor: store.anamorphicColor,
        aoEnabled: (store as any).aoEnabled ?? false,
        aoOutput: (store as any).aoOutput ?? 0,
        aoRadius: (store as any).aoRadius,
        aoIntensity: (store as any).aoIntensity ?? 1,
        ssrEnabled: store.ssrEnabled,
        ssrIntensity: store.ssrIntensity,
        ssrJitter: (store as any).ssrJitter,
        sssEnabled: store.sssEnabled,
        sssIntensity: store.sssIntensity,
        sssJitter: (store as any).sssJitter
      },
      places: store.places.map((place) => ({ ...place })),
      osmBuildings: {
        enabled: store.osmBuildingsEnabled,
        color: store.osmBuildingsColor,
        opacity: store.osmBuildingsOpacity,
        defaultHeight: store.osmBuildingsDefaultHeight,
        metersPerLevel: store.osmBuildingsMetersPerLevel
      },
      streetsGL: {
        groundEnabled: store.streetsGLGroundEnabled,
        groundSize: store.streetsGLGroundSize,
        groundOpacity: store.streetsGLGroundOpacity,
        groundLat: store.streetsGLGroundLat,
        groundLon: store.streetsGLGroundLon,
        groundZoom: store.streetsGLGroundZoom,
        groundLayerType: store.streetsGLGroundLayerType,
        iframeOverlay: store.streetsGLIframeOverlay,
        iframeInteractive: store.streetsGLIframeInteractive,
        showUI: store.streetsGLShowUI
      },
      gridSize: store.gridSize,
      selectedObjectId: store.selectedObject?.uuid || null,
      cameraViews: store.cameraViews.map((view) => ({ ...view })),
      cameraViewThumbnails: store.cameraViewThumbnails.size > 0 
        ? Object.fromEntries(store.cameraViewThumbnails) 
        : undefined,
      hotspots: hotspots,
      modelFiles: modelFiles.length > 0 ? modelFiles : undefined
    }
  }
}

/**
 * Save project snapshot with folder selection
 * Uses File System Access API if available, falls back to download
 */
export async function downloadProjectSnapshot(
  chooseFolder: boolean = false,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  try {
    console.log(`[ProjectPersistence] Starting project save...`)
    const snapshot = await createProjectSnapshot(onProgress)
    console.log(`[ProjectPersistence] Project snapshot created successfully`)
    
  const json = JSON.stringify(snapshot, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
    const blobSizeMB = (blob.size / 1024 / 1024).toFixed(2)
    console.log(`[ProjectPersistence] Project JSON size: ${blobSizeMB} MB`)
    
  const timestamp = new Date(snapshot.savedAt).toISOString().replace(/[:.]/g, '-')
  const fileName = `viewer-project-${timestamp}.json`

  // Use File System Access API if available and user wants to choose folder
  if (chooseFolder && 'showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'Project Files',
          accept: {
            'application/json': ['.json']
          }
        }]
      })

      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      
      console.log(`[ProjectPersistence] ✅ Project saved to: ${fileHandle.name}`)
      console.log(`[ProjectPersistence] ✅ Project save completed successfully!`)
      return
    } catch (error: any) {
      // User cancelled or error occurred - fall back to download
      if (error.name !== 'AbortError') {
        console.warn('[ProjectPersistence] File System Access API failed, falling back to download:', error)
      } else {
        // User cancelled - don't show error
        return
      }
    }
  }

  // Fallback: Use download link (browser's default download folder)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  console.log(`[ProjectPersistence] ✅ Project downloaded: ${fileName}`)
  console.log(`[ProjectPersistence] ✅ Project save completed successfully!`)
  } catch (error) {
    console.error(`[ProjectPersistence] ❌ CRITICAL ERROR during project save:`, error)
    throw error
  }
}

/**
 * Collect all resources (model files, textures, HDR) from the scene
 */
async function collectSceneResources(scene: THREE.Scene, store: ReturnType<typeof useAppStore.getState>): Promise<{
  modelFiles: Map<string, File>
  textureFiles: Map<string, File>
  hdrFile: File | null
  resourcePaths: Map<string, string> // Maps original path to relative path in project
}> {
  const modelFiles = new Map<string, File>()
  const textureFiles = new Map<string, File>()
  const resourcePaths = new Map<string, string>()
  let hdrFile: File | null = store.hdrFile || null

  // Collect model files from scene objects
  scene.traverse((obj) => {
    if (obj.userData.isModel || obj.userData.isImportedModel) {
      // Try to get the original file if available
      const fileName = obj.userData.fileName || obj.name
      if (fileName && !modelFiles.has(fileName)) {
        // Note: We can't get the original File object from the scene
        // This would need to be stored when loading, or we'd need to track it
        // For now, we'll mark it for collection
        resourcePaths.set(fileName, `models/${fileName}`)
      }
    }

    // Collect textures from materials
    if (obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((mat) => {
        // Check for texture maps
        const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap']
        textureProps.forEach((prop) => {
          const texture = (mat as any)[prop] as THREE.Texture | undefined
          if (texture && texture.image) {
            // Try to get texture source
            const image = texture.image
            if (image instanceof HTMLImageElement && image.src) {
              // If it's a blob URL, we can't recover the original file
              // If it's a data URL, we can extract it
              if (image.src.startsWith('data:')) {
                const textureName = `texture_${texture.uuid}.png`
                resourcePaths.set(image.src, `textures/${textureName}`)
              } else if (!image.src.startsWith('blob:')) {
                // External URL - we'll note it but can't package it
                const urlParts = image.src.split('/')
                const textureName = urlParts[urlParts.length - 1] || `texture_${texture.uuid}.png`
                resourcePaths.set(image.src, `textures/${textureName}`)
              }
            }
          }
        })
      })
    }
  })

  return { modelFiles, textureFiles, hdrFile, resourcePaths }
}

/**
 * Create a packaged project with all resources in a folder structure
 * Similar to 3DVista - everything in one place
 */
export async function createPackagedProject(includeResources: boolean = true): Promise<Blob> {
  const store = useAppStore.getState()
  const viewer = getSharedViewer()
  if (!viewer) {
    throw new Error('Viewer not ready; please wait until the scene finishes loading.')
  }

  // Create project snapshot
  const snapshot = await createProjectSnapshot()
  
  // Create ZIP archive
  const zip = new JSZip()
  const projectFolder = zip.folder('project')
  
  if (!projectFolder) {
    throw new Error('Failed to create project folder in ZIP')
  }

  // Add project JSON file
  const projectJson = JSON.stringify(snapshot, null, 2)
  projectFolder.file('project.json', projectJson)

  if (includeResources) {
    // Collect resources
    const resources = await collectSceneResources(viewer.scene, store)
    
    // Create folder structure
    const modelsFolder = projectFolder.folder('models')
    const texturesFolder = projectFolder.folder('textures')
    const hdrFolder = projectFolder.folder('hdr')

    // Add HDR file if available
    if (resources.hdrFile) {
      const hdrData = await resources.hdrFile.arrayBuffer()
      const hdrFileName = resources.hdrFile.name || 'environment.hdr'
      hdrFolder?.file(hdrFileName, hdrData)
      
      // Update HDR path in snapshot to be relative
      if (snapshot.store.hdr.serialization?.type === 'embedded') {
        snapshot.store.hdr.serialization = {
          type: 'url',
          url: `hdr/${hdrFileName}`
        }
      }
    }

    // Note: Model files and textures are tricky because:
    // 1. We don't have access to the original File objects after loading
    // 2. They're converted to blob URLs or data URLs
    // 
    // For a complete solution, we would need to:
    // - Store original File objects when loading models
    // - Track texture sources and convert data URLs/blob URLs back to files
    // - Or export the scene as GLB which includes embedded textures
    
    // For now, we'll add a README explaining the limitation
    const readme = `# Project Package

This project package contains:
- project.json: Complete project configuration
- hdr/: HDR environment files (if any)
- models/: Model files should be placed here
- textures/: Texture files should be placed here

## Loading the Project

1. Extract this ZIP file
2. Place your model files in the models/ folder
3. Place texture files in the textures/ folder (if needed)
4. Load the project.json file in the viewer

## Note

Model files and textures are referenced by filename. Make sure:
- Model files match the names stored in project.json
- Texture files are in the textures/ folder with the same names as referenced
- HDR files are in the hdr/ folder

For best results, use the same folder structure when loading models as when saving.
`
    projectFolder.file('README.txt', readme)

    // Try to export scene as GLB (includes all models and textures)
    try {
      const exporter = new GLTFExporter()
      
      // Create a clean scene copy for export (exclude helpers, lights, etc.)
      const exportScene = new THREE.Scene()
      viewer.scene.children.forEach((child) => {
        // Only export user-created objects (models, primitives, etc.)
        if (
          (child.userData.isModel || child.userData.isImportedModel || child.userData.isPolygon) &&
          !(child instanceof THREE.Light) &&
          !(child instanceof THREE.Camera) &&
          child.type !== 'GridHelper' &&
          child.type !== 'AxesHelper' &&
          child.type !== 'TransformControls'
        ) {
          exportScene.add(child.clone())
        }
      })
      
      // Export scene to GLB
      const glbData = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          exportScene,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(result)
            } else {
              reject(new Error('GLTFExporter returned non-binary data'))
            }
          },
          (error) => reject(error),
          { binary: true, includeCustomExtensions: true, animations: [] }
        )
      })
      
      modelsFolder?.file('scene-export.glb', glbData)
      projectFolder.file('scene-export-info.txt', `This GLB file contains the complete scene with all models and embedded textures.
You can load this file instead of individual models to restore the scene.
Note: This is an export and may not preserve all material modifications perfectly.
For best results, use the project.json file to restore the exact project state.`)
    } catch (error) {
      console.warn('[ProjectPersistence] Failed to export scene as GLB:', error)
      // Continue without GLB export - it's optional
    }
  }

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 } // Balance between size and speed
  })

  return zipBlob
}

/**
 * Download project as packaged ZIP file (like 3DVista)
 * Uses File System Access API if available to choose folder
 */
export async function downloadPackagedProject(includeResources: boolean = true, chooseFolder: boolean = false): Promise<void> {
  try {
    const zipBlob = await createPackagedProject(includeResources)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `viewer-project-${timestamp}.zip`

    // Use File System Access API if available and user wants to choose folder
    if (chooseFolder && 'showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'ZIP Archives',
            accept: {
              'application/zip': ['.zip']
            }
          }]
        })

        const writable = await fileHandle.createWritable()
        await writable.write(zipBlob)
        await writable.close()
        
        console.log(`[ProjectPersistence] ✅ Packaged project saved to: ${fileHandle.name}`)
        return
      } catch (error: any) {
        // User cancelled or error occurred - fall back to download
        if (error.name !== 'AbortError') {
          console.warn('[ProjectPersistence] File System Access API failed, falling back to download:', error)
        } else {
          // User cancelled - don't show error
          return
        }
      }
    }

    // Fallback: Use download link (browser's default download folder)
    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    console.log('[ProjectPersistence] ✅ Packaged project downloaded')
  } catch (error) {
    console.error('[ProjectPersistence] ❌ Failed to create packaged project:', error)
    throw error
  }
}

const applyStoreSelections = (snapshot: SavedProject['store']['selections']) => {
  useAppStore.setState({
    showGrid: snapshot.showGrid,
    showAxes: snapshot.showAxes,
    showBoundingBoxes: snapshot.showBoundingBoxes,
    showStats: snapshot.showStats,
    showShadowPlane: snapshot.showShadowPlane,
    shadowPlaneTransparent: snapshot.shadowPlaneTransparent,
    pivotMode: snapshot.pivotMode
  })
}

const applyLighting = (snapshot: SavedProject['store']['lighting']) => {
  useAppStore.setState({
    ambientIntensity: snapshot.ambientIntensity,
    shadowsEnabled: snapshot.shadowsEnabled,
    shadowIntensity: snapshot.shadowIntensity,
    shadowBias: snapshot.shadowBias,
    shadowOpacityEnabled: snapshot.shadowOpacityEnabled,
    shadowOpacity: snapshot.shadowOpacity,
    shadowColor: snapshot.shadowColor,
    directionalLights: snapshot.directionalLights.map((light) => ({ ...light })),
    selectedLightId: snapshot.selectedLightId,
    pathTracerLighting: { ...snapshot.pathTracerLighting }
  })
}

const applyRendering = (snapshot: SavedProject['store']['rendering']) => {
  useAppStore.setState({
    textureAnisotropy: snapshot.textureAnisotropy,
    pixelRatio: snapshot.pixelRatio,
    maxPixelRatio: snapshot.maxPixelRatio,
    useLogarithmicDepthBuffer: snapshot.useLogarithmicDepthBuffer,
    useHighPerformanceGPU: snapshot.useHighPerformanceGPU,
    preferCPU: snapshot.preferCPU,
    vsyncEnabled: snapshot.vsyncEnabled ?? true,
    maxFPS: snapshot.maxFPS ?? 0,
    upscalingEnabled: snapshot.upscalingEnabled ?? false,
    upscalingQuality: snapshot.upscalingQuality ?? 75
  })
}

const applyWeather = (snapshot: SavedProject['store']['weather']) => {
  useAppStore.setState({
    weatherPreset: snapshot.weatherPreset,
    cloudDensity: snapshot.cloudDensity,
    cloudThickness: snapshot.cloudThickness,
    cloudDetail: snapshot.cloudDetail,
    cloudScale: snapshot.cloudScale,
    cloudStorminess: snapshot.cloudStorminess,
    cloudShadowStrength: snapshot.cloudShadowStrength,
    cloudColor: snapshot.cloudColor,
    fogDensity: snapshot.fogDensity,
    fogHeight: snapshot.fogHeight,
    fogColor: snapshot.fogColor,
    rainIntensity: snapshot.rainIntensity,
    snowIntensity: snapshot.snowIntensity,
    windIntensity: snapshot.windIntensity,
    timeOfDay: snapshot.timeOfDay,
    skyTurbidity: snapshot.skyTurbidity,
    skyAtmosphereDensity: snapshot.skyAtmosphereDensity,
    skyRayleigh: snapshot.skyRayleigh,
    skyMieCoefficient: snapshot.skyMieCoefficient,
    skyMieDirectionalG: snapshot.skyMieDirectionalG,
    skyExposure: snapshot.skyExposure,
    dynamicSkyEnabled: snapshot.dynamicSkyEnabled,
    sunSize: snapshot.sunSize,
    moonSize: snapshot.moonSize,
    weatherQuality: snapshot.weatherQuality,
    rainParticleScale: snapshot.rainParticleScale,
    rainParticleSpeed: snapshot.rainParticleSpeed,
    rainCollisionEnabled: snapshot.rainCollisionEnabled,
    snowParticleScale: snapshot.snowParticleScale,
    snowParticleSpeed: snapshot.snowParticleSpeed,
    snowCollisionEnabled: snapshot.snowCollisionEnabled,
    windGustsEnabled: snapshot.windGustsEnabled
  })
}

const restoreHdr = async (hdr: SavedProject['store']['hdr']) => {
  const store = useAppStore.getState()
  useAppStore.setState({
    hdrEnabled: hdr.enabled,
    hdrIntensity: hdr.intensity,
    hdrRotationAzimuth: hdr.rotationAzimuth,
    hdrRotationElevation: hdr.rotationElevation,
    hdrBackgroundVisible: hdr.backgroundVisible,
    hdrGroundProjectionEnabled: hdr.groundProjectionEnabled,
    hdrGroundProjectionHeight: hdr.groundProjectionHeight,
    hdrGroundProjectionRadius: hdr.groundProjectionRadius,
    northOffset: hdr.northOffset
  })

  const serialization = hdr.serialization
  if (!serialization) {
    store.setHdrFile(null)
    store.setHdrUrl(null)
    return
  }

  if (serialization.type === 'url') {
    store.setHdrFile(null)
    store.setHdrUrl(serialization.url)
    return
  }

  try {
    const arrayBuffer = base64ToArrayBuffer(serialization.data)
    const blob = new Blob([arrayBuffer], { type: serialization.mimeType })
    const file = new File([blob], serialization.name, { type: serialization.mimeType })
    const objectUrl = URL.createObjectURL(blob)
    store.setHdrFile(file)
    store.setHdrUrl(objectUrl)
  } catch (error) {
    console.error('[ProjectPersistence] Failed to restore HDR file:', error)
  }
}

/**
 * Prompt user to load missing files automatically
 */
async function promptForMissingFiles(
  missingFiles: Array<{ fileName: string; savedObject: SavedSceneObject }>,
  viewer: any,
  snapshot: SavedProject
): Promise<void> {
  if (missingFiles.length === 0) return
  
  console.log(`[ProjectPersistence] 🔄 Automatically prompting for ${missingFiles.length} missing file(s)...`)
  
  try {
    // Try to use File System Access API first (better UX)
    const anyWindow = window as typeof window & {
      showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>
    }
    
    if (anyWindow.showOpenFilePicker) {
      try {
        const handles = await anyWindow.showOpenFilePicker({
          multiple: true,
          types: [{
            description: '3D Model Files',
            accept: {
              'model/gltf-binary': ['.glb'],
              'model/gltf+json': ['.gltf'],
              'model/fbx': ['.fbx'],
              'model/obj': ['.obj'],
              'model/stl': ['.stl'],
              'model/ply': ['.ply'],
              'application/octet-stream': ['.splat', '.ksplat'],
              'model/3mf': ['.3mf'],
              'model/vnd.collada+xml': ['.dae']
            }
          }]
        })
        
        const files: File[] = []
        for (const handle of handles) {
          if (handle.kind === 'file') {
            const file = await handle.getFile()
            files.push(file)
          }
        }
        
        if (files.length > 0) {
          await loadMissingFiles(files, missingFiles, viewer, snapshot)
          return
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log('[ProjectPersistence] User cancelled file picker')
          return
        }
        console.warn('[ProjectPersistence] File System Access API failed, using fallback:', err)
      }
    }
    
    // Fallback: Create a hidden file input and trigger it
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.glb,.gltf,.fbx,.obj,.stl,.ply,.splat,.ksplat,.3mf,.dae'
    input.style.display = 'none'
    
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement
      if (target.files && target.files.length > 0) {
        const files = Array.from(target.files)
        await loadMissingFiles(files, missingFiles, viewer, snapshot)
      }
      document.body.removeChild(input)
    }
    
    document.body.appendChild(input)
    input.click()
    
    // Clean up if user doesn't select files (timeout after 1 minute)
    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input)
        console.log('[ProjectPersistence] File picker timeout - user did not select files')
      }
    }, 60000)
  } catch (error) {
    console.error('[ProjectPersistence] Failed to prompt for missing files:', error)
  }
}

/**
 * Load missing files and restore their transformations
 */
async function loadMissingFiles(
  selectedFiles: File[],
  missingFiles: Array<{ fileName: string; savedObject: SavedSceneObject }>,
  viewer: any,
  snapshot: SavedProject
): Promise<void> {
  console.log(`[ProjectPersistence] Loading ${selectedFiles.length} selected file(s) for ${missingFiles.length} missing model(s)...`)
  
  // Create a map of filename -> saved object for quick lookup
  const fileNameToSaved = new Map<string, SavedSceneObject>()
  missingFiles.forEach(({ fileName, savedObject }) => {
    // Match by exact filename or just the filename part (without path)
    const fileNameOnly = fileName.split('/').pop()?.split('\\').pop() || fileName
    fileNameToSaved.set(fileName.toLowerCase(), savedObject)
    fileNameToSaved.set(fileNameOnly.toLowerCase(), savedObject)
  })
  
  // Match selected files to saved objects
  const filesToLoad: Array<{ file: File; savedObject: SavedSceneObject }> = []
  
  for (const file of selectedFiles) {
    const fileNameLower = file.name.toLowerCase()
    const savedObject = fileNameToSaved.get(fileNameLower)
    
    if (savedObject) {
      filesToLoad.push({ file, savedObject })
      console.log(`[ProjectPersistence] ✅ Matched file "${file.name}" to saved model "${savedObject.name || savedObject.fileName}"`)
    } else {
      // Try matching by filename only (without extension)
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      for (const [key, value] of fileNameToSaved.entries()) {
        const keyWithoutExt = key.replace(/\.[^/.]+$/, '')
        if (keyWithoutExt === fileNameWithoutExt) {
          filesToLoad.push({ file, savedObject: value })
          console.log(`[ProjectPersistence] ✅ Matched file "${file.name}" to saved model "${value.name || value.fileName}" by name (without extension)`)
          break
        }
      }
    }
  }
  
  if (filesToLoad.length === 0) {
    console.warn('[ProjectPersistence] ⚠️ No selected files matched missing models. Please ensure filenames match.')
    return
  }
  
  // Load files and restore transformations
  for (const { file, savedObject } of filesToLoad) {
    try {
      console.log(`[ProjectPersistence] 🔄 Loading file "${file.name}" and restoring transformations...`)
      
      // Load the model
      const loadedModel = await loadModel({ file })
      if (!loadedModel || !loadedModel.scene) {
        console.error(`[ProjectPersistence] Failed to load model from file: ${file.name}`)
        continue
      }
      
      const obj = loadedModel.scene
      
      // Mark as imported model
      obj.userData.isModel = true
      obj.userData.isImportedModel = true
      obj.userData.fileName = savedObject.fileName || file.name
      obj.userData.excludeFromSkyModifications = true
      obj.userData.excludeFromWeatherModifications = true
      
      // Set fileName on all children
      obj.traverse((child) => {
        if (!child.userData.fileName) {
          child.userData.fileName = savedObject.fileName || file.name
        }
      })
      
      // Restore transformations from saved object
      if (savedObject.position) {
        obj.position.set(savedObject.position.x, savedObject.position.y, savedObject.position.z)
      }
      if (savedObject.rotation) {
        obj.rotation.set(savedObject.rotation.x, savedObject.rotation.y, savedObject.rotation.z)
      }
      if (savedObject.scale) {
        obj.scale.set(savedObject.scale.x, savedObject.scale.y, savedObject.scale.z)
      }
      obj.visible = savedObject.visible !== false
      
      // Restore name and UUID
      if (savedObject.name) {
        obj.name = savedObject.name
      }
      if (savedObject.id) {
        obj.uuid = savedObject.id
      }
      
      // Register file in registry
      fileRegistry.registerModelFile(savedObject.fileName || file.name, file)
      
      // Add to scene
      viewer.scene.add(obj)
      
      // Restore materials if saved
      if (savedObject.materials && savedObject.materials.length > 0) {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            // Try to restore materials (simplified - full restoration would need material matching)
            if (materials.length > 0 && savedObject.materials && savedObject.materials.length > 0) {
              const restoredMat = restoreMaterial(savedObject.materials[0])
              if (restoredMat) {
                child.material = restoredMat
              }
            }
          }
        })
      }
      
      console.log(`[ProjectPersistence] ✅ Successfully loaded and restored "${file.name}"`)
    } catch (error) {
      console.error(`[ProjectPersistence] ❌ Failed to load file "${file.name}":`, error)
    }
  }
  
  console.log(`[ProjectPersistence] ✅ Loaded ${filesToLoad.length} missing file(s)`)
}

const restoreCameraViews = (views: SavedProject['store']['cameraViews'], thumbnails?: SavedProject['store']['cameraViewThumbnails']) => {
  useAppStore.setState({ cameraViews: views.map((view) => ({ ...view })) })
  
  // Restore thumbnails if available
  if (thumbnails && Object.keys(thumbnails).length > 0) {
    const thumbnailMap = new Map<string, string>(Object.entries(thumbnails))
    useAppStore.getState().setCameraViewThumbnails(thumbnailMap)
    console.log(`[ProjectPersistence] Restored ${thumbnailMap.size} camera view thumbnail(s)`)
  } else {
    // Clear thumbnails if not in snapshot (they'll be regenerated automatically)
    useAppStore.getState().clearCameraViewThumbnails()
  }
}

const applyWater = (snapshot: SavedProject['store']['water'] | undefined) => {
  if (!snapshot) return
  useAppStore.setState({
    waterEnabled: snapshot.enabled,
    waterLevel: snapshot.level,
    waterColor: snapshot.color,
    waterOpacity: snapshot.opacity,
    waveSpeed: snapshot.waveSpeed,
    waveHeight: snapshot.waveHeight,
    waterReflectivity: snapshot.reflectivity,
    waterMode: snapshot.mode,
    marchingCubesResolution: snapshot.marchingCubesResolution,
    marchingCubesIsolation: snapshot.marchingCubesIsolation,
    marchingCubesMetaballCount: snapshot.marchingCubesMetaballCount,
    oceanDistortionScale: snapshot.oceanDistortionScale,
    oceanSize: snapshot.oceanSize
  })
}

const applyPathTracer = (snapshot: SavedProject['store']['pathTracer'] | undefined) => {
  if (!snapshot) return
  useAppStore.setState({
    pathTracerActive: snapshot.active,
    pathTracerMode: snapshot.mode,
    pathTracerSettings: { ...snapshot.settings },
    pathTracerLighting: { ...snapshot.lighting }
  })
}

const applyPostProcessing = (snapshot: SavedProject['store']['postProcessing'] | undefined) => {
  if (!snapshot) return
  useAppStore.setState({
    postProcessingEnabled: snapshot.enabled,
    bloomEnabled: snapshot.bloomEnabled,
    bloomStrength: snapshot.bloomStrength,
    bloomRadius: snapshot.bloomRadius,
    bloomThreshold: snapshot.bloomThreshold,
    lutEnabled: snapshot.lutEnabled,
    lutIntensity: snapshot.lutIntensity,
    anamorphicEnabled: snapshot.anamorphicEnabled,
    anamorphicIntensity: snapshot.anamorphicIntensity,
    anamorphicThreshold: snapshot.anamorphicThreshold,
    anamorphicScale: snapshot.anamorphicScale,
    anamorphicColor: snapshot.anamorphicColor,
    aoEnabled: snapshot.aoEnabled,
    aoOutput: snapshot.aoOutput,
    // aoRadius: (snapshot as any).aoRadius, // Not in AppState, skip for now
    aoIntensity: snapshot.aoIntensity,
    ssrEnabled: snapshot.ssrEnabled,
    ssrIntensity: snapshot.ssrIntensity,
    // ssrJitter: (snapshot as any).ssrJitter, // Not in AppState, skip for now
    sssEnabled: snapshot.sssEnabled,
    sssIntensity: snapshot.sssIntensity
    // sssJitter: (snapshot as any).sssJitter // Not in AppState, skip for now
  } as any)
}

const applyPlaces = (snapshot: SavedProject['store']['places'] | undefined) => {
  if (!snapshot) return
  const store = useAppStore.getState()
  store.clearPlaces()
  snapshot.forEach(place => {
    store.addPlace(place)
  })
}

const applyOSMBuildings = (snapshot: SavedProject['store']['osmBuildings'] | undefined) => {
  if (!snapshot) return
  useAppStore.setState({
    osmBuildingsEnabled: snapshot.enabled,
    osmBuildingsColor: snapshot.color,
    osmBuildingsOpacity: snapshot.opacity,
    osmBuildingsDefaultHeight: snapshot.defaultHeight,
    osmBuildingsMetersPerLevel: snapshot.metersPerLevel
  })
}

const applyStreetsGL = (snapshot: SavedProject['store']['streetsGL'] | undefined) => {
  if (!snapshot) return
  useAppStore.setState({
    streetsGLGroundEnabled: snapshot.groundEnabled,
    streetsGLGroundSize: snapshot.groundSize,
    streetsGLGroundOpacity: snapshot.groundOpacity,
    streetsGLGroundLat: snapshot.groundLat,
    streetsGLGroundLon: snapshot.groundLon,
    streetsGLGroundZoom: snapshot.groundZoom,
    streetsGLGroundLayerType: snapshot.groundLayerType as any,
    streetsGLIframeOverlay: snapshot.iframeOverlay,
    streetsGLIframeInteractive: snapshot.iframeInteractive,
    streetsGLShowUI: snapshot.showUI
  })
}

// Restore material from saved data
const restoreMaterial = (saved: SavedMaterial): THREE.Material => {
  let material: THREE.Material

  // Create material based on type
  if (saved.type.includes('Physical')) {
    material = new THREE.MeshPhysicalMaterial()
  } else if (saved.type.includes('Standard')) {
    material = new THREE.MeshStandardMaterial()
  } else if (saved.type.includes('Basic')) {
    material = new THREE.MeshBasicMaterial()
  } else {
    material = new THREE.MeshStandardMaterial()
  }

  // Apply common properties
  if (saved.color && 'color' in material && material.color instanceof THREE.Color) {
    material.color.setHex(parseInt(saved.color.replace('#', ''), 16))
  }
  if (saved.emissive && 'emissive' in material && material.emissive instanceof THREE.Color) {
    material.emissive.setHex(parseInt(saved.emissive.replace('#', ''), 16))
    if ('emissiveIntensity' in material && saved.emissiveIntensity !== undefined) {
      (material as any).emissiveIntensity = saved.emissiveIntensity
    }
  }
  if (saved.opacity !== undefined) {
    material.opacity = saved.opacity
  }
  if (saved.transparent !== undefined) {
    material.transparent = saved.transparent
  }
  if (saved.side) {
    if (saved.side === 'Double') material.side = THREE.DoubleSide
    else if (saved.side === 'Back') material.side = THREE.BackSide
    else material.side = THREE.FrontSide
  }
  if (saved.wireframe !== undefined && 'wireframe' in material) {
    material.wireframe = saved.wireframe
  }

  // Apply PBR properties
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    if (saved.roughness !== undefined) material.roughness = saved.roughness
    if (saved.metalness !== undefined) material.metalness = saved.metalness
  }

  // Apply physical material properties
  if (material instanceof THREE.MeshPhysicalMaterial) {
    if (saved.clearcoat !== undefined) material.clearcoat = saved.clearcoat
    if (saved.clearcoatRoughness !== undefined) material.clearcoatRoughness = saved.clearcoatRoughness
    if (saved.transmission !== undefined) material.transmission = saved.transmission
    if (saved.thickness !== undefined) material.thickness = saved.thickness
    if (saved.ior !== undefined) material.ior = saved.ior
    if (saved.specularIntensity !== undefined) material.specularIntensity = saved.specularIntensity
    if (saved.specularColor && material.specularColor instanceof THREE.Color) {
      material.specularColor.setHex(parseInt(saved.specularColor.replace('#', ''), 16))
    }
    if (saved.sheen !== undefined) material.sheen = saved.sheen
    if (saved.sheenRoughness !== undefined) material.sheenRoughness = saved.sheenRoughness
    if (saved.sheenColor && material.sheenColor instanceof THREE.Color) {
      material.sheenColor.setHex(parseInt(saved.sheenColor.replace('#', ''), 16))
    }
  }

  // Restore ALL texture maps (not just map)
  const textureProperties = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
    'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
    'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
    'specularIntensityMap', 'specularColorMap'
  ]

  for (const prop of textureProperties) {
    if ((saved as any)[prop] && prop in material) {
    try {
      const textureLoader = new THREE.TextureLoader()
        const texture = textureLoader.load((saved as any)[prop])
        ;(material as any)[prop] = texture
      material.needsUpdate = true
    } catch (e) {
        console.warn(`[ProjectPersistence] Failed to restore texture ${prop}:`, e)
      }
    }
  }

  material.needsUpdate = true
  return material
}

// Restore a scene object recursively
const restoreSceneObject = async (
  saved: SavedSceneObject,
  scene: THREE.Scene,
  viewer: any,
  missingFiles?: Array<{ fileName: string; savedObject: SavedSceneObject }>
): Promise<THREE.Object3D | null> => {
  let obj: THREE.Object3D | null = null
  let isExistingObject = false

  try {
    // For imported models, ONLY match by fileName (not by name/UUID) to avoid reusing wrong models
    // GLTF models often have generic names like "Scene", so matching by name would incorrectly reuse models
    // CRITICAL: Since we clear ALL models before restoration, we should only find models that were just restored
    // in this same restoration pass (marked with _restoredFromProject flag)
    let existingByFileName: THREE.Object3D | null = null
    if (saved.type === 'imported' && saved.fileName) {
      // Search scene for models with matching fileName (exact match required)
      // Only consider models that were restored in this pass (to handle duplicate models in snapshot)
      scene.traverse((obj) => {
        if (!existingByFileName && 
            (obj.userData.isModel || obj.userData.isImportedModel) &&
            obj.userData.fileName === saved.fileName &&
            obj.userData._restoredFromProject && // CRITICAL: Only match models restored in this pass
            obj.parent === scene) { // Only top-level objects
          existingByFileName = obj
        }
      })
    }
    
    // Also try UUID match (but only if fileName matches and was restored in this pass)
    const existingById = saved.id ? scene.getObjectByProperty('uuid', saved.id) : null
    const existing = existingByFileName || (
      existingById && 
      (!saved.fileName || (existingById as any).userData?.fileName === saved.fileName) &&
      (existingById as any).userData?._restoredFromProject ? existingById : null
    )

    if (saved.type === 'imported' && saved.fileName) {
      // For imported models, ONLY reuse if fileName matches exactly AND it was restored in this pass
      // This prevents reusing auto-loaded models (which were cleared) or wrong models
      if (existingByFileName && 
          (existingByFileName as THREE.Object3D).userData.fileName === saved.fileName &&
          (existingByFileName as THREE.Object3D).userData._restoredFromProject) {
        obj = existingByFileName as THREE.Object3D
        isExistingObject = true
        console.log(`[ProjectPersistence] Found duplicate model in snapshot: "${saved.fileName}" (already restored), restoring transformations and materials`)
        
        // CRITICAL: Ensure the existing model is visible and in the scene
        obj.visible = true
        if (!obj.parent && !scene.children.includes(obj)) {
          console.log(`[ProjectPersistence] ⚠️ Existing model not in scene, adding it now`)
          scene.add(obj)
        }
        
        // Verify model has content
        let meshCount = 0
        obj.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            meshCount++
            child.visible = true
          }
        })
        console.log(`[ProjectPersistence] Existing model has ${meshCount} mesh(es), visible: ${obj.visible}, in scene: ${scene.children.includes(obj)}, fileName: ${(obj as THREE.Object3D).userData.fileName}`)
      } else {
        // No existing model found with matching fileName - need to load it
        console.log(`[ProjectPersistence] No existing model found for "${saved.fileName}" - will load from file`)
        
        // Model not found - try to load from embedded file data or registry
        const modelFile = fileRegistry.getModelFile(saved.fileName)
        if (modelFile) {
          try {
            // Validate file before loading
            if (!modelFile || modelFile.size === 0) {
              console.warn(`[ProjectPersistence] Invalid model file in registry: ${saved.fileName} (size: ${modelFile?.size || 0})`)
        return null
            }
            
            console.log(`[ProjectPersistence] 🔄 Loading embedded model file: ${saved.fileName} (${(modelFile.size / 1024 / 1024).toFixed(2)} MB)`)
            console.log(`[ProjectPersistence]   File type: ${modelFile.type || 'unknown'}`)
            console.log(`[ProjectPersistence]   File in registry: ✅`)
            
            // CRITICAL: For GLTF files, check if they reference external .bin files and textures
            // If so, we need to set up URL modifiers to handle these file requests
            let binFileMap: Map<string, File> | undefined
            let textureFileMap: Map<string, File> | undefined
            if (saved.fileName.toLowerCase().endsWith('.gltf')) {
              try {
                // Read the GLTF JSON to find buffer references
                const gltfText = await modelFile.text()
                const gltfJson = JSON.parse(gltfText)
                
                // Check if there are external buffer references
                if (gltfJson.buffers && Array.isArray(gltfJson.buffers)) {
                  binFileMap = new Map()
                  for (const buffer of gltfJson.buffers) {
                    if (buffer.uri && !buffer.uri.startsWith('data:')) {
                      // External .bin file referenced
                      const binFileName = buffer.uri.split('/').pop() || buffer.uri
                      // Try to find the .bin file in the registry or snapshot
                      const binFile = fileRegistry.getModelFile(binFileName)
                      if (binFile) {
                        binFileMap.set(binFileName, binFile)
                        console.log(`[ProjectPersistence] Found referenced .bin file: ${binFileName}`)
                      } else {
                        // Check if it's in the snapshot's modelFiles
                        const snapshot = (viewer as any).lastLoadedSnapshot as SavedProject | undefined
                        if (snapshot?.store?.modelFiles) {
                          const binFileEntry = snapshot.store.modelFiles.find(f => f.fileName === binFileName)
                          if (binFileEntry?.fileData) {
                            // Restore the .bin file
                            try {
                              const cleanBase64 = binFileEntry.fileData.trim().replace(/\s/g, '')
                              const arrayBuffer = base64ToArrayBuffer(cleanBase64)
                              const binFile = new File([arrayBuffer], binFileName, { 
                                type: 'application/octet-stream',
                                lastModified: Date.now()
                              })
                              fileRegistry.registerModelFile(binFileName, binFile)
                              binFileMap.set(binFileName, binFile)
                              console.log(`[ProjectPersistence] ✅ Restored referenced .bin file: ${binFileName}`)
                            } catch (binError) {
                              console.warn(`[ProjectPersistence] Failed to restore .bin file ${binFileName}:`, binError)
                            }
                          }
                        }
                      }
                    }
                  }
                }
                
                // Check if there are external image references (textures)
                if (gltfJson.images && Array.isArray(gltfJson.images)) {
                  textureFileMap = new Map()
                  const snapshot = (viewer as any).lastLoadedSnapshot as SavedProject | undefined
                  for (const image of gltfJson.images) {
                    // Only process images with URI (external files), skip bufferView (embedded) and data URIs
                    if (image.uri && !image.uri.startsWith('data:') && image.bufferView === undefined) {
                      // Store both the original path and the filename for matching
                      const texturePath = image.uri // e.g., "images/texture.jpg"
                      const textureFileName = texturePath.split('/').pop() || texturePath // e.g., "texture.jpg"
                      
                      // Try to find the texture file in the registry or snapshot
                      // First try by filename (most common case)
                      let textureFile = fileRegistry.getModelFile(textureFileName)
                      
                      // If not found by filename, try to find by full path in snapshot
                      if (!textureFile && snapshot?.store?.modelFiles) {
                        // Try exact filename match first
                        let textureFileEntry = snapshot.store.modelFiles.find(f => f.fileName === textureFileName)
                        
                        // If not found, try matching by any file that ends with the same filename
                        if (!textureFileEntry) {
                          textureFileEntry = snapshot.store.modelFiles.find(f => {
                            const fName = f.fileName.split('/').pop() || f.fileName
                            return fName === textureFileName
                          })
                        }
                        
                        if (textureFileEntry?.fileData) {
                          // Restore the texture file
                          try {
                            const cleanBase64 = textureFileEntry.fileData.trim().replace(/\s/g, '')
                            const arrayBuffer = base64ToArrayBuffer(cleanBase64)
                            // Determine MIME type from file extension
                            const ext = textureFileName.split('.').pop()?.toLowerCase()
                            let mimeType = 'image/png'
                            if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
                            else if (ext === 'png') mimeType = 'image/png'
                            else if (ext === 'webp') mimeType = 'image/webp'
                            textureFile = new File([arrayBuffer], textureFileName, { 
                              type: mimeType,
                              lastModified: Date.now()
                            })
                            fileRegistry.registerModelFile(textureFileName, textureFile)
                            console.log(`[ProjectPersistence] ✅ Restored referenced texture file: ${textureFileName}`)
                          } catch (textureError) {
                            console.warn(`[ProjectPersistence] Failed to restore texture file ${textureFileName}:`, textureError)
                          }
                        }
                      }
                      
                      if (textureFile) {
                        // Store with both the original path and filename for flexible matching
                        textureFileMap.set(texturePath, textureFile) // Store with original path
                        textureFileMap.set(textureFileName, textureFile) // Also store with filename for fallback
                        console.log(`[ProjectPersistence] Found referenced texture file: ${texturePath} (${textureFileName})`)
                      } else {
                        console.warn(`[ProjectPersistence] ⚠️ GLTF references texture "${texturePath}" but file not found`)
                      }
                    }
                  }
                }
              } catch (gltfParseError) {
                console.warn(`[ProjectPersistence] Could not parse GLTF to find .bin files:`, gltfParseError)
              }
            }
            
            // CRITICAL: Set up URL modifier for .bin files and textures if needed
            const allFileMaps = new Map<string, File>()
            const allBlobUrls = new Map<string, string>()
            
            if (binFileMap && binFileMap.size > 0) {
              for (const [binFileName, binFile] of binFileMap.entries()) {
                allFileMaps.set(binFileName, binFile)
                const blobUrl = URL.createObjectURL(binFile)
                allBlobUrls.set(binFileName, blobUrl)
                console.log(`[ProjectPersistence] Created blob URL for .bin file: ${binFileName}`)
              }
            }
            
            if (textureFileMap && textureFileMap.size > 0) {
              // Create blob URLs for all texture paths (both original path and filename)
              const processedFiles = new Set<File>()
              for (const [texturePath, textureFile] of textureFileMap.entries()) {
                // Only create blob URL once per file (multiple paths may point to same file)
                if (!processedFiles.has(textureFile)) {
                  const blobUrl = URL.createObjectURL(textureFile)
                  processedFiles.add(textureFile)
                  // Store blob URL with the path as key
                  allBlobUrls.set(texturePath, blobUrl)
                  console.log(`[ProjectPersistence] Created blob URL for texture file: ${texturePath}`)
                } else {
                  // File already processed, reuse existing blob URL
                  const existingBlobUrl = Array.from(allBlobUrls.entries()).find(([path, url]) => {
                    const existingFile = allFileMaps.get(path)
                    return existingFile === textureFile
                  })?.[1]
                  if (existingBlobUrl) {
                    allBlobUrls.set(texturePath, existingBlobUrl)
                  }
                }
                allFileMaps.set(texturePath, textureFile)
              }
            }
            
            if (allFileMaps.size > 0) {
              // Set up URL modifier to intercept .bin and texture file requests
              // Use sophisticated path matching similar to GLTFLoader
              THREE.DefaultLoadingManager.setURLModifier((url) => {
                // Normalize the URL: remove blob prefixes, normalize slashes
                let cleanUrl = url.replace(/^blob:[^/]+/, '').replace(/^[/\\]+/, '').replace(/^\.\//, '')
                cleanUrl = cleanUrl.replace(/\\/g, '/')
                
                // Remove leading slash if present
                if (cleanUrl.startsWith('/')) {
                  cleanUrl = cleanUrl.substring(1)
                }
                
                const urlLower = cleanUrl.toLowerCase()
                const fileName = cleanUrl.split('/').pop() || cleanUrl
                const fileNameLower = fileName.toLowerCase()
                
                // Strategy 1: Exact path match (case-insensitive)
                for (const [storedPath, file] of allFileMaps.entries()) {
                  const storedPathLower = storedPath.toLowerCase()
                  if (storedPathLower === urlLower || storedPathLower === cleanUrl.toLowerCase()) {
                    const blobUrl = allBlobUrls.get(storedPath)
                    if (blobUrl) {
                      console.log(`[ProjectPersistence] Redirecting file request (exact match): ${url} -> ${blobUrl}`)
                      return blobUrl
                    }
                  }
                }
                
                // Strategy 2: Filename-only match (handles "images/texture.jpg" vs "texture.jpg")
                for (const [storedPath, file] of allFileMaps.entries()) {
                  const storedFileName = storedPath.split('/').pop()?.toLowerCase()
                  if (storedFileName && storedFileName === fileNameLower) {
                    const blobUrl = allBlobUrls.get(storedPath)
                    if (blobUrl) {
                      console.log(`[ProjectPersistence] Redirecting file request (filename match): ${url} -> ${blobUrl}`)
                      return blobUrl
                    }
                  }
                }
                
                // Strategy 3: Path suffix match (handles "folder/images/texture.jpg" vs "images/texture.jpg")
                for (const [storedPath, file] of allFileMaps.entries()) {
                  const storedPathLower = storedPath.toLowerCase()
                  if (storedPathLower.endsWith('/' + urlLower) || urlLower.endsWith('/' + storedPathLower)) {
                    const blobUrl = allBlobUrls.get(storedPath)
                    if (blobUrl) {
                      console.log(`[ProjectPersistence] Redirecting file request (suffix match): ${url} -> ${blobUrl}`)
                      return blobUrl
                    }
                  }
                }
                
                // Strategy 4: Partial match (any part of path contains the filename)
                for (const [storedPath, file] of allFileMaps.entries()) {
                  const storedPathLower = storedPath.toLowerCase()
                  if (storedPathLower.includes(fileNameLower) || urlLower.includes(storedPath.split('/').pop()?.toLowerCase() || '')) {
                    const blobUrl = allBlobUrls.get(storedPath)
                    if (blobUrl) {
                      console.log(`[ProjectPersistence] Redirecting file request (partial match): ${url} -> ${blobUrl}`)
                      return blobUrl
                    }
                  }
                }
                
                // No match found, return original URL
                return url
              })
            }
            
            // Try to load the model with timeout
            const loadPromise = loadModel({ file: modelFile })
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Model loading timeout (30s)')), 30000)
            })
            
            const loadedModel = await Promise.race([loadPromise, timeoutPromise])
            
            // Clean up URL modifier after loading (but keep blob URLs valid for async texture loading)
            if (binFileMap && binFileMap.size > 0) {
              // Don't clear the URL modifier immediately - textures might still be loading
              // It will be cleared when the next model loads or page unloads
              console.log(`[ProjectPersistence] URL modifier set up for ${binFileMap.size} .bin file(s)`)
            }
            
            if (loadedModel && loadedModel.scene) {
              obj = loadedModel.scene
              
              // CRITICAL: Verify the scene has actual content (meshes, groups, etc.)
              let hasContent = false
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
                  hasContent = true
                }
              })
              
              if (!hasContent) {
                console.warn(`[ProjectPersistence] ⚠️ Loaded model "${saved.fileName}" has no visible content (no meshes or groups)`)
              }
              
              // Mark as imported model
              obj.userData.isModel = true
              obj.userData.isImportedModel = true
              obj.userData.fileName = saved.fileName
              // Store fileUrl if available (for future saves)
              if (saved.fileUrl) {
                obj.userData.fileUrl = saved.fileUrl
              }
              obj.userData.excludeFromSkyModifications = true
              obj.userData.excludeFromWeatherModifications = true
              // Preserve the saved UUID if possible (for consistency)
              if (saved.id) {
                obj.uuid = saved.id
              }
              // Set name
              if (saved.name) {
                obj.name = saved.name
              }
              
              // CRITICAL: Ensure object is visible
              obj.visible = true
              
              // IMPORTANT: loadModel doesn't add to scene automatically, so we'll add it in restoreSceneObjects
              // Mark as not existing so it gets added to scene
              isExistingObject = false
              
              // Log detailed info about the loaded model
              let meshCount = 0
              let groupCount = 0
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) meshCount++
                if (child instanceof THREE.Group) groupCount++
              })
              
              console.log(`[ProjectPersistence] ✅ Loaded model from embedded file: ${saved.fileName}`)
              console.log(`[ProjectPersistence] Model content: ${meshCount} mesh(es), ${groupCount} group(s), visible: ${obj.visible}`)
              console.log(`[ProjectPersistence] Model position: (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})`)
              console.log(`[ProjectPersistence] Model scale: (${obj.scale.x.toFixed(2)}, ${obj.scale.y.toFixed(2)}, ${obj.scale.z.toFixed(2)})`)
            } else {
              console.warn(`[ProjectPersistence] Failed to load model from file: ${saved.fileName} - loadModel returned null or no scene`)
              return null
            }
          } catch (error: any) {
            console.error(`[ProjectPersistence] Error loading embedded model file ${saved.fileName}:`, error)
            // Provide more diagnostic information
            if (error.message?.includes('typed array') || error.message?.includes('Invalid typed array length')) {
              console.error(`[ProjectPersistence] ❌ File data corruption detected!`)
              console.error(`[ProjectPersistence] File size: ${modelFile.size} bytes`)
              console.error(`[ProjectPersistence] File type: ${modelFile.type}`)
              console.error(`[ProjectPersistence] File name: ${modelFile.name}`)
              
              // Try to diagnose the issue
              const fileFromRegistry = fileRegistry.getModelFile(saved.fileName)
              if (fileFromRegistry) {
                console.error(`[ProjectPersistence] File in registry size: ${fileFromRegistry.size} bytes`)
                console.error(`[ProjectPersistence] File in registry type: ${fileFromRegistry.type}`)
                
                // Try to read first few bytes to check if file is readable
                try {
                  const firstBytes = await fileFromRegistry.slice(0, 4).arrayBuffer()
                  const view = new Uint8Array(firstBytes)
                  console.error(`[ProjectPersistence] First 4 bytes: [${Array.from(view).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`)
                  
                  // Check if it's a GLB file
                  if (saved.fileName.toLowerCase().endsWith('.glb')) {
                    const magic = (view[3] << 24) | (view[2] << 16) | (view[1] << 8) | view[0]
                    if (magic === 0x46546C67) {
                      console.error(`[ProjectPersistence] ✅ GLB magic number is valid (0x${magic.toString(16)})`)
                    } else {
                      console.error(`[ProjectPersistence] ❌ GLB magic number is invalid (got 0x${magic.toString(16)}, expected 0x46546C67)`)
                    }
                  }
                } catch (readError) {
                  console.error(`[ProjectPersistence] ❌ Could not read file bytes:`, readError)
                }
              }
              
              console.error(`[ProjectPersistence] 💡 Recommendation: Re-save the project or load the model file directly to regenerate the embedded data.`)
            } else {
              console.error(`[ProjectPersistence] Error details:`, {
                message: error.message,
                stack: error.stack,
                fileName: saved.fileName,
                fileSize: modelFile?.size
              })
            }
            return null
          }
        } else {
          // Model file not found in registry - try to load from URL if available
          const modelFileUrls = (fileRegistry as any).modelFileUrls as Map<string, string> | undefined
          const fileUrl = modelFileUrls?.get(saved.fileName) || saved.fileUrl
          
          if (fileUrl) {
            try {
              console.log(`[ProjectPersistence] Loading model from URL: ${saved.fileName} (${fileUrl})`)
              // Use loadModel directly to avoid side effects from loadFromUrl (like removing previous models)
              const loadedModel = await loadModel({ url: fileUrl })
              if (loadedModel && loadedModel.scene) {
                obj = loadedModel.scene
                // Mark as imported model
                obj.userData.isModel = true
                obj.userData.isImportedModel = true
                obj.userData.fileName = saved.fileName
                obj.userData.fileUrl = fileUrl // Store URL for future reference
                obj.userData.excludeFromSkyModifications = true
                obj.userData.excludeFromWeatherModifications = true
                
                // CRITICAL: Also set fileName on all children (GLTF models often have root named "Scene")
                // This ensures verification can find the model even if root is named "Scene"
                obj.traverse((child) => {
                  if (!child.userData.fileName) {
                    child.userData.fileName = saved.fileName
                  }
                })
                // Preserve the saved UUID if possible (for consistency)
                if (saved.id) {
                  obj.uuid = saved.id
                }
                // Set name
                if (saved.name) {
                  obj.name = saved.name
                }
                // IMPORTANT: Try to fetch and register the file for future saves
                // This allows us to embed it in future project saves
                if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
                  try {
                    const response = await fetch(fileUrl)
                    if (response.ok) {
                      const blob = await response.blob()
                      const file = new File([blob], saved.fileName, { type: blob.type || 'application/octet-stream' })
                      fileRegistry.registerModelFile(saved.fileName, file)
                      console.log(`[ProjectPersistence] ✅ Registered model file from URL for future saves: ${saved.fileName}`)
                    }
                  } catch (fetchError) {
                    // Non-critical - file is loaded, just can't register it
                    console.debug(`[ProjectPersistence] Could not register file from URL (non-critical):`, fetchError)
                  }
                }
                // IMPORTANT: loadModel doesn't add to scene automatically, so we'll add it in restoreSceneObjects
                // Mark as not existing so it gets added to scene
                isExistingObject = false
                console.log(`[ProjectPersistence] ✅ Loaded model from URL: ${saved.fileName}`)
              } else {
                console.warn(`[ProjectPersistence] Failed to load model from URL: ${saved.fileName}`)
                return null
              }
            } catch (error) {
              console.error(`[ProjectPersistence] Error loading model from URL ${saved.fileName}:`, error)
              console.warn(`[ProjectPersistence] ⚠️ Could not load model "${saved.name}" (${saved.fileName}) from URL. The file may need to be manually reloaded.`)
              return null
            }
          } else {
            // Model file not found in registry - try to auto-load from multiple path variations
            const snapshot = (viewer as any).lastLoadedSnapshot as SavedProject | undefined
            const fileEntry = snapshot?.store?.modelFiles?.find(f => f.fileName === saved.fileName)
            const fileUrl = fileEntry?.fileUrl || saved.fileName
            
            // Extract filename from path (handles both absolute and relative paths)
            const fileNameOnly = saved.fileName.split('/').pop()?.split('\\').pop() || saved.fileName
            
            // Try multiple path variations automatically
            const pathsToTry: string[] = []
            
            // 1. Original URL/path if available (skip blob/data URLs)
            if (fileUrl && !fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) {
              pathsToTry.push(fileUrl)
              
              // If it's an absolute Windows path, try to convert to relative
              const windowsPathMatch = fileUrl.match(/^([A-Za-z]):[\/\\](.+)$/i)
              if (windowsPathMatch) {
                const [, drive, path] = windowsPathMatch
                const normalizedPath = path.replace(/\\/g, '/')
                // Try relative path from root
                pathsToTry.push('/' + normalizedPath)
                // Try without leading slash
                pathsToTry.push(normalizedPath)
                // Extract just the filename part and try common directories
                const pathParts = normalizedPath.split('/')
                if (pathParts.length > 1) {
                  // Try with files-upload prefix (common location)
                  pathsToTry.push('files-upload/' + pathParts[pathParts.length - 1])
                  // Try just the last directory + filename
                  if (pathParts.length > 2) {
                    pathsToTry.push(pathParts[pathParts.length - 2] + '/' + pathParts[pathParts.length - 1])
                  }
                }
              }
            }
            
            // 2. Try common relative paths
            pathsToTry.push(fileNameOnly) // Just filename
            pathsToTry.push('files-upload/' + fileNameOnly) // Common location
            pathsToTry.push('models/' + fileNameOnly) // Models directory
            pathsToTry.push('./' + fileNameOnly) // Current directory
            
            // 3. If original path had directory structure, try to preserve it
            if (saved.fileName.includes('/') || saved.fileName.includes('\\')) {
              const normalizedPath = saved.fileName.replace(/\\/g, '/')
              // Remove Windows drive letter if present
              const cleanPath = normalizedPath.replace(/^[A-Za-z]:\//, '').replace(/^[A-Za-z]:\\/, '')
              if (!pathsToTry.includes(cleanPath)) {
                pathsToTry.push(cleanPath)
              }
              // Try with files-upload prefix
              if (!cleanPath.startsWith('files-upload/')) {
                pathsToTry.push('files-upload/' + cleanPath)
              }
            }
            
            // Try each path until one works
            let loaded = false
            console.log(`[ProjectPersistence] 🔄 Attempting to auto-load model: "${saved.name || 'unnamed'}" (${saved.fileName})`)
            console.log(`[ProjectPersistence]   Will try ${pathsToTry.length} path variation(s)`)
            
            for (const pathToTry of pathsToTry) {
              try {
                if (pathsToTry.indexOf(pathToTry) < 3 || pathsToTry.length <= 5) {
                  console.log(`[ProjectPersistence]   Trying path ${pathsToTry.indexOf(pathToTry) + 1}/${pathsToTry.length}: ${pathToTry}`)
                }
                
                const loadedModel = await loadModel({ url: pathToTry })
                
                if (loadedModel && loadedModel.scene) {
                  obj = loadedModel.scene
                  // Mark as imported model
                  obj.userData.isModel = true
                  obj.userData.isImportedModel = true
                  obj.userData.fileName = saved.fileName
                  obj.userData.fileUrl = pathToTry
                  obj.userData.excludeFromSkyModifications = true
                  obj.userData.excludeFromWeatherModifications = true
                  
                  // Set fileName on all children
                  obj.traverse((child) => {
                    if (!child.userData.fileName) {
                      child.userData.fileName = saved.fileName
                    }
                  })
                  
                  // Restore transformations
                  if (saved.position) {
                    obj.position.set(saved.position.x, saved.position.y, saved.position.z)
                  }
                  if (saved.rotation) {
                    obj.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z)
                  }
                  if (saved.scale) {
                    obj.scale.set(saved.scale.x, saved.scale.y, saved.scale.z)
                  }
                  obj.visible = saved.visible !== false
                  
                  // Restore name and UUID
                  if (saved.name) {
                    obj.name = saved.name
                  }
                  if (saved.id) {
                    obj.uuid = saved.id
                  }
                  
                  // IMPORTANT: loadModel doesn't add to scene automatically
                  isExistingObject = false
                  
                  console.log(`[ProjectPersistence] ✅ Successfully auto-loaded model from: ${pathToTry}`)
                  loaded = true
                  break // Success! Stop trying other paths
                }
              } catch (pathError) {
                // This path didn't work, try next one
                // Log first few failures, then only debug for the rest
                if (pathsToTry.indexOf(pathToTry) < 3) {
                  console.log(`[ProjectPersistence]   Path attempt ${pathsToTry.indexOf(pathToTry) + 1}/${pathsToTry.length} failed: ${pathToTry}`)
                } else {
                  console.debug(`[ProjectPersistence]   Path failed: ${pathToTry} (${pathError instanceof Error ? pathError.message : String(pathError)})`)
                }
                continue
              }
            }
            
            // If all automatic attempts failed, mark as missing and prompt for file picker
            if (!loaded && !obj) {
              const requiresManualReload = (fileEntry as any)?.requiresManualReload || false
              const originalFileSize = (fileEntry as any)?.originalFileSize
              
              console.error(`[ProjectPersistence] ❌ Could not auto-load model "${saved.name || 'unnamed'}" (${saved.fileName})`)
              console.error(`[ProjectPersistence]   Tried ${pathsToTry.length} path(s):`)
              pathsToTry.slice(0, 5).forEach((path, idx) => {
                console.error(`[ProjectPersistence]     ${idx + 1}. ${path}`)
              })
              if (pathsToTry.length > 5) {
                console.error(`[ProjectPersistence]     ... and ${pathsToTry.length - 5} more`)
              }
              if (requiresManualReload) {
                console.error(`[ProjectPersistence]   - File was too large to embed (${originalFileSize ? (originalFileSize / 1024 / 1024).toFixed(2) + ' MB' : 'unknown size'})`)
              }
              console.error(`[ProjectPersistence] 💡 Will prompt for file picker to select: ${saved.fileName}`)
              
              // Track this as a missing file that needs to be loaded
              if (missingFiles && saved.type === 'imported' && saved.fileName) {
                missingFiles.push({ fileName: saved.fileName, savedObject: saved })
              }
              return null
            }
          }
        }
      }
    } else if (saved.type === 'primitive' && saved.primitiveType) {
      // Restore primitive
      let geometry: THREE.BufferGeometry
      const size = saved.primitiveSize || { x: 1, y: 1, z: 1 }

      switch (saved.primitiveType) {
        case 'box':
          geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
          break
        case 'sphere':
          geometry = new THREE.SphereGeometry(size.x / 2, 32, 32)
          break
        case 'plane':
          geometry = new THREE.PlaneGeometry(size.x, size.y)
          break
        case 'cone':
          geometry = new THREE.ConeGeometry(size.x / 2, size.y, 32)
          break
        case 'cylinder':
          geometry = new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y, 32)
          break
        case 'torus':
          geometry = new THREE.TorusGeometry(size.x / 2, size.y / 4, 16, 100)
          break
        case 'tetrahedron':
          geometry = new THREE.TetrahedronGeometry(size.x / 2)
          break
        case 'octahedron':
          geometry = new THREE.OctahedronGeometry(size.x / 2)
          break
        default:
          geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
      }

      const material = saved.materials.length > 0
        ? restoreMaterial(saved.materials[0])
        : new THREE.MeshStandardMaterial({ color: 0x888888 })

      obj = new THREE.Mesh(geometry, material)
      obj.name = saved.name
      obj.userData.isModel = true
      obj.userData.isImportedModel = true
      obj.castShadow = true
      obj.receiveShadow = true

      if (saved.primitiveType === 'plane') {
        material.side = THREE.DoubleSide
      }
    } else if (saved.type === 'polygon' && saved.polygonVertices) {
      // Restore polygon - this is complex, we'll create a basic representation
      // The full polygon restoration would require the polygon drawing system
      const shape = new THREE.Shape()
      if (saved.polygonVertices.length > 0) {
        const first = saved.polygonVertices[0]
        shape.moveTo(first.x, first.z) // Use x and z for 2D shape
        for (let i = 1; i < saved.polygonVertices.length; i++) {
          const v = saved.polygonVertices[i]
          shape.lineTo(v.x, v.z)
        }
        shape.lineTo(first.x, first.z) // Close the shape
      }

      const geometry = new THREE.ShapeGeometry(shape)
      const material = saved.materials.length > 0
        ? restoreMaterial(saved.materials[0])
        : new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: saved.polygonFillOpacity || 0.5,
            side: THREE.DoubleSide 
          })

      obj = new THREE.Mesh(geometry, material)
      obj.name = saved.name
      obj.userData.isPolygon = true
      obj.userData.vertices = saved.polygonVertices.map(v => new THREE.Vector3(v.x, v.y, v.z))
      obj.userData.fillOpacity = saved.polygonFillOpacity || 0.5
    } else {
      // Generic object - create a placeholder
      // CRITICAL: Skip restoring empty "other" type objects (they appear as empty "Unnamed Object" entries)
      // Only restore if it has children or materials (actual content)
      const hasContent = (saved.children && saved.children.length > 0) || 
                         (saved.materials && saved.materials.length > 0) ||
                         (saved.userData && Object.keys(saved.userData).length > 0)
      
      if (!hasContent) {
        console.log(`[ProjectPersistence] Skipping restoration of empty "other" type object: "${saved.name}" (no content)`)
        return null
      }
      
      obj = new THREE.Group()
      obj.name = saved.name
    }

    // Apply transform (always apply, even for existing objects)
    if (obj) {
      obj.position.set(saved.position.x, saved.position.y, saved.position.z)
      obj.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z)
      obj.scale.set(saved.scale.x, saved.scale.y, saved.scale.z)
      obj.visible = saved.visible

      // Restore userData
      if (saved.userData) {
        Object.assign(obj.userData, saved.userData)
      }
      
      // Mark that this object was restored (so we don't add it twice)
      obj.userData._restoredFromProject = true

      // Restore materials if it's a mesh (always restore, even for existing objects to apply material modifications)
      if (obj instanceof THREE.Mesh && saved.materials.length > 0) {
        if (saved.materials.length === 1) {
          const restoredMat = restoreMaterial(saved.materials[0])
          // If it's an existing object, we need to update the material in place or replace it
          if (isExistingObject && obj.material) {
            // Update existing material properties
            if (obj.material instanceof THREE.Material) {
              const existingMat = Array.isArray(obj.material) ? obj.material[0] : obj.material
              // Copy properties from restored material to existing
              if (restoredMat instanceof THREE.MeshStandardMaterial && existingMat instanceof THREE.MeshStandardMaterial) {
                existingMat.color.copy(restoredMat.color)
                existingMat.roughness = restoredMat.roughness
                existingMat.metalness = restoredMat.metalness
                existingMat.opacity = restoredMat.opacity
                existingMat.transparent = restoredMat.transparent
                if (restoredMat.emissive && existingMat.emissive) {
                  existingMat.emissive.copy(restoredMat.emissive)
                }
                existingMat.needsUpdate = true
              } else {
                // If material types don't match, replace it
                obj.material = restoredMat
              }
            }
          } else {
            obj.material = restoredMat
          }
        } else {
          obj.material = saved.materials.map(m => restoreMaterial(m))
        }
      }

      // Restore children
      if (saved.children && saved.children.length > 0) {
        for (const childSaved of saved.children) {
          const child = await restoreSceneObject(childSaved, scene, viewer, missingFiles)
          if (child) {
            obj.add(child)
          }
        }
      }
    }
  } catch (error) {
    console.error(`[ProjectPersistence] Failed to restore object "${saved.name}":`, error)
    return null
  }

  return obj
}

// Restore all scene objects
const restoreSceneObjects = async (
  savedObjects: SavedSceneObject[],
  scene: THREE.Scene,
  viewer: any
): Promise<Array<{ fileName: string; savedObject: SavedSceneObject }>> => {
  // Track missing files that need to be loaded
  const missingFiles: Array<{ fileName: string; savedObject: SavedSceneObject }> = []
  // Clear existing user-created objects (but keep lights, helpers, etc.)
  // CRITICAL: Also clear auto-loaded models to prevent conflicts during restoration
  // IMPORTANT: Clear ALL models before restoration - we'll restore them from the snapshot
  const objectsToRemove: THREE.Object3D[] = []
  const fileNamesToRestore = new Set(savedObjects
    .filter(obj => obj.type === 'imported' && obj.fileName)
    .map(obj => obj.fileName!))
  
  scene.traverse((obj) => {
    if (
      (obj.userData.isModel || obj.userData.isImportedModel || obj.userData.isPolygon || obj.userData.isAutoLoaded) &&
      !(obj instanceof THREE.Light) &&
      !(obj instanceof THREE.Camera) &&
      obj.type !== 'GridHelper' &&
      obj.type !== 'AxesHelper' &&
      obj.type !== 'TransformControls' &&
      !obj.userData.isStartingObjectsGroup &&
      !obj.userData.isNativeObjectsGroup
    ) {
      // Always remove - we'll restore from snapshot
      // Even if fileName matches, we want to restore from snapshot to ensure correct state
      objectsToRemove.push(obj)
    }
  })
  
  if (objectsToRemove.length > 0) {
    console.log(`[ProjectPersistence] Clearing ${objectsToRemove.length} existing model(s) before restoration`)
    console.log(`[ProjectPersistence]   Will restore ${fileNamesToRestore.size} model(s) from snapshot:`, Array.from(fileNamesToRestore).join(', '))
  objectsToRemove.forEach(obj => {
    if (obj.parent) {
      obj.parent.remove(obj)
    } else {
      scene.remove(obj)
    }
  })
  }

  // Restore saved objects
  let restoredCount = 0
  let failedCount = 0
  const failedObjects: Array<{ name: string; fileName?: string; error?: string }> = []
  
  console.log(`[ProjectPersistence] Starting restoration of ${savedObjects.length} object(s)...`)
  
  for (let i = 0; i < savedObjects.length; i++) {
    const saved = savedObjects[i]
    try {
      if (i % 10 === 0 && i > 0) {
        console.log(`[ProjectPersistence] Progress: ${i}/${savedObjects.length} objects processed...`)
      }
      
      const obj = await restoreSceneObject(saved, scene, viewer, missingFiles)
      if (obj) {
      // Only add to scene if it's not already in the scene (existing objects are already there)
        if (!obj.parent && !scene.children.includes(obj)) {
      scene.add(obj)
          restoredCount++
          
          // CRITICAL: Verify the object was actually added
          if (scene.children.includes(obj)) {
            console.log(`[ProjectPersistence] ✅ Added restored object to scene: ${saved.name || saved.fileName || 'unnamed'}`)
            console.log(`[ProjectPersistence] Object is now in scene (total children: ${scene.children.length})`)
            
            // For models, ensure they're visible and have content
            if (obj.userData.isModel || obj.userData.isImportedModel) {
              obj.visible = true
              let meshCount = 0
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  meshCount++
                  child.visible = true
                }
              })
              console.log(`[ProjectPersistence] Model visibility: object.visible=${obj.visible}, contains ${meshCount} mesh(es)`)
            }
          } else {
            console.error(`[ProjectPersistence] ❌ Failed to add object to scene: ${saved.name || saved.fileName || 'unnamed'}`)
            failedCount++
          }
        } else if (obj.parent) {
          restoredCount++
          console.log(`[ProjectPersistence] ✅ Object already has parent (part of group): ${saved.name || saved.fileName || 'unnamed'}`)
        } else if (scene.children.includes(obj)) {
          restoredCount++
          console.log(`[ProjectPersistence] ✅ Object already in scene: ${saved.name || saved.fileName || 'unnamed'}`)
        }
      } else {
        failedCount++
        const errorMsg = `Failed to restore object: ${saved.name || saved.fileName || 'unnamed'}`
        console.warn(`[ProjectPersistence] ⚠️ ${errorMsg}`)
        failedObjects.push({ 
          name: saved.name || 'unnamed', 
          fileName: saved.fileName,
          error: 'restoreSceneObject returned null'
        })
      }
    } catch (error) {
      failedCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[ProjectPersistence] ❌ Error restoring object "${saved.name || saved.fileName || 'unnamed'}":`, error)
      failedObjects.push({ 
        name: saved.name || 'unnamed', 
        fileName: saved.fileName,
        error: errorMsg
      })
    }
  }
  
  // Log failed objects details
  if (failedObjects.length > 0) {
    console.error(`[ProjectPersistence] ========================================`)
    console.error(`[ProjectPersistence] ❌ FAILED OBJECTS DETAILS:`)
    failedObjects.forEach((failed, idx) => {
      console.error(`[ProjectPersistence]   ${idx + 1}. "${failed.name}"${failed.fileName ? ` (${failed.fileName})` : ''}`)
      if (failed.error) {
        console.error(`[ProjectPersistence]      Error: ${failed.error}`)
      }
    })
    console.error(`[ProjectPersistence] ========================================`)
  }
  
  console.log(`[ProjectPersistence] ========================================`)
  console.log(`[ProjectPersistence] Restore summary: ${restoredCount} restored, ${failedCount} failed out of ${savedObjects.length} total`)
  if (failedCount > 0) {
    console.error(`[ProjectPersistence] ⚠️ ${failedCount} object(s) failed to restore. Check logs above for details.`)
  }
  if (missingFiles.length > 0) {
    console.error(`[ProjectPersistence] ⚠️ ${missingFiles.length} model file(s) need to be loaded manually:`)
    missingFiles.forEach(({ fileName }) => {
      console.error(`[ProjectPersistence]   - ${fileName}`)
    })
  }
  console.log(`[ProjectPersistence] ========================================`)
  
  // CRITICAL: Verify models are actually visible in the scene
  // Only check top-level objects (direct children of scene), not child objects
  console.log(`[ProjectPersistence] Verifying restored models in scene...`)
  let visibleModelCount = 0
  let hiddenModelCount = 0
  let missingModelCount = 0
  const missingModelNames: string[] = []
  
  // First, check which models from the snapshot were supposed to be restored
  const expectedModelNames = new Set<string>()
  savedObjects.forEach(saved => {
    if (saved.type === 'imported' && saved.fileName) {
      expectedModelNames.add(saved.fileName)
    }
  })
  
  for (const obj of scene.children) {
    // Only check direct children of scene that are marked as models
    if (obj.userData.isModel || obj.userData.isImportedModel) {
      if (obj.visible) {
        visibleModelCount++
        // Count meshes in this model (traverse only this object and its children)
        let meshCount = 0
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.visible) {
            meshCount++
          }
        })
        console.log(`[ProjectPersistence] ✅ Model "${obj.name || 'unnamed'}" (${obj.userData.fileName || 'no file'}) is visible with ${meshCount} visible mesh(es)`)
      } else {
        hiddenModelCount++
        console.warn(`[ProjectPersistence] ⚠️ Model "${obj.name || 'unnamed'}" (${obj.userData.fileName || 'no file'}) is hidden (visible=false)`)
      }
    }
  }
  
  // Check for missing models
  // CRITICAL: Check both fileName and traverse children to find models
  // Also handle case-insensitive matching and path variations
  // IMPORTANT: GLTF models often have root named "Scene", so we need to check userData.fileName
  expectedModelNames.forEach(fileName => {
    let found = false
    const fileNameLower = fileName.toLowerCase()
    const fileNameBase = fileName.split('/').pop()?.split('\\').pop()?.toLowerCase() || fileNameLower
    
    // First check direct children
    for (const obj of scene.children) {
      if (obj.userData.isModel || obj.userData.isImportedModel) {
        const objFileName = obj.userData.fileName
        if (objFileName) {
          const objFileNameLower = objFileName.toLowerCase()
          const objFileNameBase = objFileName.split('/').pop()?.split('\\').pop()?.toLowerCase() || objFileNameLower
          
          // Match by exact fileName, case-insensitive fileName, or base filename
          if (objFileName === fileName || 
              objFileNameLower === fileNameLower || 
              objFileNameBase === fileNameBase) {
            found = true
            console.log(`[ProjectPersistence] ✅ Found model "${fileName}" as "${obj.name || 'unnamed'}" (fileName: ${objFileName})`)
            break
          }
        }
      }
      
      // Also check if any child has this fileName (for GLTF scenes where root might be named "Scene")
      obj.traverse((child) => {
        if ((child.userData.isModel || child.userData.isImportedModel) && child.userData.fileName) {
          const childFileName = child.userData.fileName
          const childFileNameLower = childFileName.toLowerCase()
          const childFileNameBase = childFileName.split('/').pop()?.split('\\').pop()?.toLowerCase() || childFileNameLower
          
          if (childFileName === fileName || 
              childFileNameLower === fileNameLower || 
              childFileNameBase === fileNameBase) {
            found = true
            console.log(`[ProjectPersistence] ✅ Found model "${fileName}" in child "${child.name || 'unnamed'}" (fileName: ${childFileName})`)
          }
        }
      })
      if (found) break
    }
    
    if (!found) {
      // Additional check: look for models that were loaded but might have different fileName format
      // This handles cases where the fileName might have been modified or the model structure changed
      console.warn(`[ProjectPersistence] ⚠️ Model "${fileName}" not found in scene. Checking all models...`)
      for (const obj of scene.children) {
        if (obj.userData.isModel || obj.userData.isImportedModel) {
          console.log(`[ProjectPersistence]   Found model: name="${obj.name}", fileName="${obj.userData.fileName}", visible=${obj.visible}`)
        }
      }
      
      missingModelCount++
      missingModelNames.push(fileName)
    }
  })
  
  console.log(`[ProjectPersistence] Scene verification: ${visibleModelCount} visible model(s), ${hiddenModelCount} hidden model(s), ${missingModelCount} missing model(s)`)
  if (missingModelCount > 0) {
    console.error(`[ProjectPersistence] ❌ Missing models that should have been restored:`)
    missingModelNames.forEach(fileName => {
      console.error(`[ProjectPersistence]   - ${fileName}`)
    })
    console.error(`[ProjectPersistence] 💡 These models were not found in the registry and had no URL. They may need to be manually reloaded.`)
  }
  
  // Update bounding boxes if available
  if (viewer && (viewer as any).updateBoundingBoxes) {
    setTimeout(() => {
      (viewer as any).updateBoundingBoxes()
    }, 100)
  }
  
  // CRITICAL: If models are loaded but not visible, try to frame the main model (not every child)
  // Only frame top-level models (direct children of scene), not individual child objects
  if (visibleModelCount > 0 && viewer && (viewer as any).frameObject) {
    setTimeout(() => {
      // Find the main model (top-level scene child, not nested children)
      let mainModel: THREE.Object3D | null = null
      
      // First, try to find a model that's a direct child of the scene
      for (const child of scene.children) {
        if ((child.userData.isModel || child.userData.isImportedModel) && child.visible) {
          // Check if it's actually a model scene (has meshes or groups)
          let hasContent = false
          child.traverse((obj) => {
            if (obj instanceof THREE.Mesh || (obj instanceof THREE.Group && obj.children.length > 0)) {
              hasContent = true
            }
          })
          
          if (hasContent) {
            mainModel = child
            break
          }
        }
      }
      
      // If no direct child model found, find the largest model by mesh count
      if (!mainModel) {
        let maxMeshes = 0
        scene.traverse((obj) => {
          if ((obj.userData.isModel || obj.userData.isImportedModel) && obj.visible && !obj.parent?.userData.isModel) {
            let meshCount = 0
            obj.traverse((child) => {
              if (child instanceof THREE.Mesh) meshCount++
            })
            if (meshCount > maxMeshes) {
              maxMeshes = meshCount
              mainModel = obj
            }
          }
        })
      }
      
      // Frame only the main model
      if (mainModel) {
        try {
          (viewer as any).frameObject(mainModel)
          console.log(`[ProjectPersistence] ✅ Framed main model "${mainModel.name || 'unnamed'}" in viewport`)
        } catch (frameError) {
          console.warn(`[ProjectPersistence] Could not frame main model:`, frameError)
        }
      } else {
        console.warn(`[ProjectPersistence] ⚠️ No main model found to frame`)
      }
    }, 500)
  }
  
  // Return missing files for automatic loading
  return missingFiles
}

// Flag to prevent auto-loading while a project is being loaded
let isProjectLoading = false

export function isProjectCurrentlyLoading(): boolean {
  return isProjectLoading
}

export async function applyProjectSnapshot(snapshot: SavedProject): Promise<void> {
  if (snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3 && snapshot.version !== 4 && snapshot.version !== 5) {
    throw new Error(`Unsupported project snapshot version: ${snapshot.version}`)
  }
  
  // Set flag to prevent auto-loading during project restoration
  isProjectLoading = true

  const setMenuLayout = useAppStore.getState().setMenuLayout
  const saveMenuLayout = useAppStore.getState().saveMenuLayoutToStorage

  const layoutInput =
    snapshot.menuRowBreaks && snapshot.menuRowBreaks
      ? { layout: snapshot.menuLayout, rowBreaks: snapshot.menuRowBreaks }
      : snapshot.menuLayout

  setMenuLayout(layoutInput)
  saveMenuLayout()

  applyStoreSelections(snapshot.store.selections)
  applyLighting(snapshot.store.lighting)
  await restoreHdr(snapshot.store.hdr)
  applyWeather(snapshot.store.weather)
  applyRendering(snapshot.store.rendering)
  
  // Restore new settings (version 3+)
  if (snapshot.version >= 3) {
    if (snapshot.store.water) {
      applyWater(snapshot.store.water)
    }
    if (snapshot.store.pathTracer) {
      applyPathTracer(snapshot.store.pathTracer)
    }
    if (snapshot.store.postProcessing) {
      applyPostProcessing(snapshot.store.postProcessing)
    }
    if (snapshot.store.places) {
      applyPlaces(snapshot.store.places)
    }
    if (snapshot.store.osmBuildings) {
      applyOSMBuildings(snapshot.store.osmBuildings)
    }
    if (snapshot.store.streetsGL) {
      applyStreetsGL(snapshot.store.streetsGL)
    }
    if (snapshot.store.gridSize !== undefined) {
      useAppStore.setState({ gridSize: snapshot.store.gridSize })
    }
  }
  
  restoreCameraViews(snapshot.store.cameraViews, snapshot.store.cameraViewThumbnails)

  // Restore hotspots (version 4+)
  if (snapshot.version >= 4 && snapshot.store.hotspots) {
    try {
      localStorage.setItem('3d-viewer-hotspots', JSON.stringify(snapshot.store.hotspots))
      console.log(`[ProjectPersistence] Restored ${snapshot.store.hotspots.length} hotspot(s)`)
    } catch (e) {
      console.warn('[ProjectPersistence] Failed to restore hotspots:', e)
    }
  }

  const viewer = getSharedViewer()
  if (viewer) {
    // CRITICAL: Store snapshot on viewer so it can be accessed during restoration
    // This is needed for restoring .bin files and textures that are referenced in GLTF files
    (viewer as any).lastLoadedSnapshot = snapshot
    
    // CRITICAL: Initialize modelFileUrls map if it doesn't exist
    // This map stores URLs for referenced (non-embedded) model files
    if (!(fileRegistry as any).modelFileUrls) {
      (fileRegistry as any).modelFileUrls = new Map<string, string>()
    }
    
    // CRITICAL: Restore model files to registry FIRST (before restoring scene objects)
    // This ensures embedded model files are available when restoreSceneObject tries to load them
    if (snapshot.version >= 5 && snapshot.store.modelFiles && snapshot.store.modelFiles.length > 0) {
      console.log(`[ProjectPersistence] Restoring ${snapshot.store.modelFiles.length} model file(s) to registry...`)
      
      for (const modelFile of snapshot.store.modelFiles) {
        // If file data is embedded, restore it to registry
        if (modelFile.fileData) {
          try {
            // Validate base64 string before decoding
            if (!modelFile.fileData || typeof modelFile.fileData !== 'string') {
              console.warn(`[ProjectPersistence] Invalid fileData for ${modelFile.fileName}: expected string, got ${typeof modelFile.fileData}`)
              continue
            }
            
            // Remove any whitespace that might have been introduced during JSON serialization
            const cleanBase64 = modelFile.fileData.trim().replace(/\s/g, '')
            
            // Decode base64 to ArrayBuffer
            const arrayBuffer = base64ToArrayBuffer(cleanBase64)
            
            // Validate ArrayBuffer size (should be > 0)
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              console.warn(`[ProjectPersistence] Invalid ArrayBuffer for ${modelFile.fileName}: size is 0`)
              continue
            }
            
            // Validate expected size: base64 encoding increases size by ~33%, so decoded size should be ~75% of base64 string length
            const expectedMinSize = Math.floor(cleanBase64.length * 0.75)
            const expectedMaxSize = Math.ceil(cleanBase64.length * 0.76)
            if (arrayBuffer.byteLength < expectedMinSize || arrayBuffer.byteLength > expectedMaxSize) {
              console.warn(`[ProjectPersistence] ArrayBuffer size validation warning for ${modelFile.fileName}: ` +
                `decoded size=${arrayBuffer.byteLength}, expected ~${expectedMinSize}-${expectedMaxSize} ` +
                `(base64 length=${cleanBase64.length})`)
              // Continue anyway - might still be valid
            }
            
            // Create Blob and File with proper MIME type based on file extension
            const fileName = modelFile.fileName || 'model.glb'
            const extension = fileName.toLowerCase().split('.').pop() || 'glb'
            let mimeType = 'application/octet-stream'
            if (extension === 'gltf') {
              mimeType = 'model/gltf+json'
            } else if (extension === 'glb') {
              mimeType = 'model/gltf-binary'
            } else if (extension === 'fbx') {
              mimeType = 'application/octet-stream'
            }
            
            // CRITICAL: Create File directly from ArrayBuffer (not wrapped in Blob)
            // This ensures the FileReader in GLTF loader can properly read the binary data
            const file = new File([arrayBuffer], fileName, { 
              type: mimeType,
              lastModified: Date.now()
            })
            
            // Validate file size matches ArrayBuffer size
            if (file.size !== arrayBuffer.byteLength) {
              console.error(`[ProjectPersistence] ❌ File size mismatch for ${fileName}: file.size=${file.size}, arrayBuffer.byteLength=${arrayBuffer.byteLength}`)
              // Try alternative: create from Uint8Array view
              const uint8Array = new Uint8Array(arrayBuffer)
              const fileAlt = new File([uint8Array], fileName, { 
                type: mimeType,
                lastModified: Date.now()
              })
              if (fileAlt.size === arrayBuffer.byteLength) {
                console.log(`[ProjectPersistence] ✅ Created File from Uint8Array (size matches)`)
                fileRegistry.registerModelFile(fileName, fileAlt)
                console.log(`[ProjectPersistence] ✅ Restored embedded model file: ${fileName} (${(fileAlt.size / 1024 / 1024).toFixed(2)} MB, buffer: ${arrayBuffer.byteLength} bytes)`)
                continue
              } else {
                console.error(`[ProjectPersistence] ❌ Alternative File creation also failed: fileAlt.size=${fileAlt.size}`)
                continue
              }
            }
            
            // Additional validation: Check if GLB/GLTF file has valid header
            if (extension === 'glb' || extension === 'gltf') {
              const headerView = new Uint8Array(arrayBuffer.slice(0, 4))
              // GLB files start with "glTF" magic number (0x46546C67)
              // GLTF JSON files start with "{" or whitespace
              if (extension === 'glb') {
                const magic = (headerView[3] << 24) | (headerView[2] << 16) | (headerView[1] << 8) | headerView[0]
                if (magic !== 0x46546C67) {
                  console.warn(`[ProjectPersistence] ⚠️ GLB file ${fileName} has invalid magic number: 0x${magic.toString(16)} (expected 0x46546C67)`)
                  // Continue anyway - might still be valid
                }
              }
            }
            
            fileRegistry.registerModelFile(fileName, file)
            console.log(`[ProjectPersistence] ✅ Restored embedded model file: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)} MB, buffer: ${arrayBuffer.byteLength} bytes)`)
          } catch (error) {
            console.error(`[ProjectPersistence] Failed to restore embedded model file ${modelFile.fileName}:`, error)
            // Continue with other files even if one fails
          }
        } else if (modelFile.fileUrl) {
          // Model file is referenced by URL - try to load it
          try {
            console.log(`[ProjectPersistence] Attempting to load referenced model file from URL: ${modelFile.fileName}`)
            // Check if it's a blob URL or data URL (these are safe to load)
            if (modelFile.fileUrl.startsWith('blob:') || modelFile.fileUrl.startsWith('data:')) {
              // For blob/data URLs, we can't directly create a File object, but we can try to load from URL
              // Store the URL in userData so restoreSceneObject can use it
              // Note: We don't register a null file, just store the URL
              const urls = (fileRegistry as any).modelFileUrls as Map<string, string> | undefined
              if (urls) urls.set(modelFile.fileName, modelFile.fileUrl)
              console.log(`[ProjectPersistence] ✅ Registered model file URL (blob/data) for ${modelFile.fileName}`)
            } else {
              // External URL - we'll try to load it when restoring the scene object
              // Try to fetch and register the file if it's a non-blob/data URL
              if (modelFile.fileUrl.startsWith('http://') || modelFile.fileUrl.startsWith('https://')) {
                try {
                  const response = await fetch(modelFile.fileUrl)
                  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
                  const blob = await response.blob()
                  const file = new File([blob], modelFile.fileName, { type: blob.type })
                  fileRegistry.registerModelFile(modelFile.fileName, file)
                  console.log(`[ProjectPersistence] ✅ Fetched and registered referenced model file: ${modelFile.fileName}`)
                } catch (error) {
                  console.warn(`[ProjectPersistence] Failed to fetch or register model file from URL ${modelFile.fileName}:`, error)
                  // Still register the URL even if fetch fails, so restoreSceneObject can try to load it
                  const urls = (fileRegistry as any).modelFileUrls as Map<string, string> | undefined
                  if (urls) urls.set(modelFile.fileName, modelFile.fileUrl)
                }
              } else {
                // Other URL types - just store the URL
                const urls = (fileRegistry as any).modelFileUrls as Map<string, string> | undefined
                if (urls) urls.set(modelFile.fileName, modelFile.fileUrl)
                console.log(`[ProjectPersistence] ✅ Registered external model file URL for ${modelFile.fileName}`)
              }
            }
          } catch (error) {
            console.warn(`[ProjectPersistence] Failed to register model file URL ${modelFile.fileName}:`, error)
          }
        } else {
          console.log(`[ProjectPersistence] Model file ${modelFile.fileName} is referenced (not embedded and no URL). Please ensure the file is available.`)
        }
      }
    } else if (snapshot.version >= 4 && snapshot.store.modelFiles && snapshot.store.modelFiles.length > 0) {
      // Legacy version 4 - just log
      console.log(`[ProjectPersistence] Project contains ${snapshot.store.modelFiles.length} model file(s):`, 
        snapshot.store.modelFiles.map(f => f.fileName).join(', '))
      console.log('[ProjectPersistence] 💡 Note: Model files are referenced by name. Make sure they are available when loading the project.')
    }

    // Restore camera state (continues where you left off)
    const { camera } = snapshot
    const position = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z)
    const target = new THREE.Vector3(camera.target.x, camera.target.y, camera.target.z)
    viewer.setCameraState(position, target, false)

    // Restore scene objects (version 3+)
    // Model files are now in registry, so restoreSceneObject can load them if needed
    if (snapshot.version >= 3 && snapshot.sceneObjects && snapshot.sceneObjects.length > 0) {
      console.log(`[ProjectPersistence] ========================================`)
      console.log(`[ProjectPersistence] Restoring ${snapshot.sceneObjects.length} scene object(s)...`)
      console.log(`[ProjectPersistence] ========================================`)
      
      let missingFiles: Array<{ fileName: string; savedObject: SavedSceneObject }> = []
      try {
        missingFiles = await restoreSceneObjects(snapshot.sceneObjects, viewer.scene, viewer)
        console.log('[ProjectPersistence] ✅ Scene objects restoration completed')
      } catch (restoreError) {
        console.error(`[ProjectPersistence] ❌ CRITICAL ERROR during scene restoration:`, restoreError)
        console.error(`[ProjectPersistence] Error details:`, {
          message: restoreError instanceof Error ? restoreError.message : String(restoreError),
          stack: restoreError instanceof Error ? restoreError.stack : undefined,
          sceneObjectsCount: snapshot.sceneObjects.length
        })
        // Continue anyway - some objects might have been restored
      }
      
      // Automatically prompt for missing files
      if (missingFiles.length > 0) {
        console.log(`[ProjectPersistence] 📋 ${missingFiles.length} file(s) need to be loaded:`, missingFiles.map(f => f.fileName).join(', '))
        try {
          await promptForMissingFiles(missingFiles, viewer, snapshot)
        } catch (promptError) {
          console.error(`[ProjectPersistence] Failed to prompt for missing files:`, promptError)
        }
      }
      
      // Restore selected object if it exists
      if (snapshot.store.selectedObjectId) {
        const selectedObject = viewer.scene.getObjectByProperty('uuid', snapshot.store.selectedObjectId)
        if (selectedObject) {
          useAppStore.getState().setSelectedObject(selectedObject)
          console.log('[ProjectPersistence] ✅ Selected object restored')
        }
      }
    }

    // Final summary
    console.log(`[ProjectPersistence] ========================================`)
    console.log(`[ProjectPersistence] 📊 PROJECT RESTORATION SUMMARY`)
    console.log(`[ProjectPersistence] ========================================`)
    const totalModels = snapshot.sceneObjects?.filter(obj => obj.type === 'imported').length || 0
    const visibleModels = Array.from(viewer.scene.children).filter(obj => 
      (obj.userData.isModel || obj.userData.isImportedModel) && obj.visible
    ).length
    console.log(`[ProjectPersistence] Expected models: ${totalModels}`)
    console.log(`[ProjectPersistence] Visible models in scene: ${visibleModels}`)
    if (totalModels > visibleModels) {
      console.warn(`[ProjectPersistence] ⚠️ ${totalModels - visibleModels} model(s) failed to load. Check console for details.`)
    } else if (visibleModels > 0) {
      console.log(`[ProjectPersistence] ✅ All models loaded successfully!`)
    }
    console.log(`[ProjectPersistence] ========================================`)
    
    // Clear flag when project restoration is complete
    isProjectLoading = false
    
    // After project restoration, if Pagani model is not in the scene and auto-load is enabled,
    // auto-load it (but only if it wasn't in the snapshot)
    const hasPagani = Array.from(viewer.scene.children).some(obj => 
      (obj.userData.isModel || obj.userData.isImportedModel) &&
      obj.userData.fileName && 
      obj.userData.fileName.includes('Pagani')
    )
    
    if (!hasPagani) {
      // Check if Pagani was supposed to be in the snapshot
      const paganiInSnapshot = snapshot.sceneObjects?.some(obj => 
        obj.type === 'imported' && 
        obj.fileName && 
        obj.fileName.includes('Pagani')
      )
      
      if (!paganiInSnapshot) {
        // Pagani wasn't in snapshot, so auto-load it after a short delay
        console.log(`[ProjectPersistence] Pagani model not in snapshot and not in scene - will auto-load after restoration`)
        setTimeout(async () => {
          try {
            const autoLoadPath = 'files-upload/Pagani-glb/Pagani Utopia 2023.gltf'
            const loadedModel = await loadModel({ url: autoLoadPath })
            
            if (loadedModel && loadedModel.scene) {
              // Mark as auto-loaded model
              loadedModel.scene.userData.isModel = true
              loadedModel.scene.userData.isImportedModel = true
              loadedModel.scene.userData.isAutoLoaded = true
              loadedModel.scene.userData.fileName = 'Pagani Utopia 2023.gltf'
              loadedModel.scene.userData.fileUrl = autoLoadPath
              loadedModel.scene.userData.excludeFromSkyModifications = true
              loadedModel.scene.userData.excludeFromWeatherModifications = true
              
              // Add to scene
              viewer.scene.add(loadedModel.scene)
              
              // Register file in FileRegistry if possible
              try {
                const response = await fetch(autoLoadPath)
                if (response.ok) {
                  const blob = await response.blob()
                  const file = new File([blob], 'Pagani Utopia 2023.gltf', { type: blob.type || 'model/gltf+json' })
                  fileRegistry.registerModelFile('Pagani Utopia 2023.gltf', file)
                }
              } catch (regError) {
                console.warn(`[ProjectPersistence] Could not register Pagani file in registry:`, regError)
              }
              
              console.log(`[ProjectPersistence] ✅ Auto-loaded Pagani model after project restoration`)
            }
          } catch (error) {
            console.warn(`[ProjectPersistence] Failed to auto-load Pagani after project restoration:`, error)
          }
        }, 500)
      }
    }
  }
}

/**
 * Debug utility: Get detailed information about the current project state
 * Useful for diagnosing save/load issues
 */
export function debugProjectState(): {
  viewer: any | null
  sceneObjects: Array<{
    name: string
    fileName: string | undefined
    fileUrl: string | undefined
    uuid: string
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
  }>
  registeredFiles: Array<{
    fileName: string
    size: number
    sizeMB: string
  }>
  snapshotInfo: {
    canCreate: boolean
    estimatedSize: string
  }
} {
  const viewer = getSharedViewer()
  const sceneObjects: any[] = []
  
  if (viewer) {
    viewer.scene.traverse((obj: THREE.Object3D) => {
      if (obj.userData.isModel || obj.userData.isImportedModel) {
        sceneObjects.push({
          name: obj.name || 'unnamed',
          fileName: obj.userData.fileName,
          fileUrl: obj.userData.fileUrl,
          uuid: obj.uuid,
          position: {
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z
          },
          rotation: {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z
          },
          scale: {
            x: obj.scale.x,
            y: obj.scale.y,
            z: obj.scale.z
          }
        })
      }
    })
  }
  
  const registeredFiles: any[] = []
  sceneObjects.forEach(obj => {
    if (obj.fileName) {
      const file = fileRegistry.getModelFile(obj.fileName)
      if (file) {
        registeredFiles.push({
          fileName: obj.fileName,
          size: file.size,
          sizeMB: (file.size / 1024 / 1024).toFixed(2)
        })
      }
    }
  })
  
  // Estimate snapshot size
  let estimatedSize = 0
  registeredFiles.forEach(file => {
    estimatedSize += file.size * 1.33 // Base64 encoding adds ~33%
  })
  estimatedSize += sceneObjects.length * 1000 // Rough estimate for object data
  const estimatedSizeMB = (estimatedSize / 1024 / 1024).toFixed(2)
  
  return {
    viewer: viewer ? {
      ready: true,
      sceneChildren: viewer.scene.children.length
    } : null,
    sceneObjects,
    registeredFiles,
    snapshotInfo: {
      canCreate: !!viewer,
      estimatedSize: `${estimatedSizeMB} MB`
    }
  }
}

/**
 * Debug utility: Validate a saved project snapshot
 */
export function validateProjectSnapshot(snapshot: SavedProject): {
  valid: boolean
  errors: string[]
  warnings: string[]
  info: {
    version: number
    sceneObjects: number
    modelFiles: number
    embeddedFiles: number
    urlReferences: number
  }
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Validate version
  if (!snapshot.version || (snapshot.version < 1 || snapshot.version > 5)) {
    errors.push(`Invalid version: ${snapshot.version}`)
  }
  
  // Validate structure
  if (!snapshot.sceneObjects || !Array.isArray(snapshot.sceneObjects)) {
    errors.push('Missing or invalid sceneObjects array')
  }
  
  if (!snapshot.store || !snapshot.store.modelFiles) {
    warnings.push('No modelFiles in snapshot')
  }
  
  // Validate model files
  let embeddedFiles = 0
  let urlReferences = 0
  
  if (snapshot.store?.modelFiles) {
    snapshot.store.modelFiles.forEach((file, i) => {
      if (!file.fileName) {
        errors.push(`Model file ${i} missing fileName`)
      }
      
      if (file.fileData) {
        embeddedFiles++
        // Validate base64
        const cleanBase64 = file.fileData.trim().replace(/\s/g, '')
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
          errors.push(`Model file ${file.fileName} has invalid base64 data`)
        }
      }
      
      if (file.fileUrl) {
        urlReferences++
        if (file.fileUrl.startsWith('blob:')) {
          warnings.push(`Model file ${file.fileName} uses blob URL (may not work after page reload)`)
        }
      }
      
      if (!file.fileData && !file.fileUrl) {
        warnings.push(`Model file ${file.fileName} has no embedded data or URL`)
      }
    })
  }
  
  // Validate scene objects
  if (snapshot.sceneObjects) {
    const modelFileNames = new Set(snapshot.store?.modelFiles?.map(f => f.fileName) || [])
    snapshot.sceneObjects.forEach((obj, i) => {
      if (obj.type === 'imported' && obj.fileName) {
        if (!modelFileNames.has(obj.fileName)) {
          warnings.push(`Scene object ${i} (${obj.name || 'unnamed'}) references file "${obj.fileName}" not in modelFiles`)
        }
      }
    })
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info: {
      version: snapshot.version,
      sceneObjects: snapshot.sceneObjects?.length || 0,
      modelFiles: snapshot.store?.modelFiles?.length || 0,
      embeddedFiles,
      urlReferences
    }
  }
}

export async function loadProjectFromFile(file: File): Promise<void> {
  console.log(`[ProjectPersistence] Loading project file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
  
  // For large files, warn user
  const fileSizeMB = file.size / 1024 / 1024
  if (fileSizeMB > 50) {
    console.warn(`[ProjectPersistence] ⚠️ Large project file detected (${fileSizeMB.toFixed(2)} MB). Loading may take a while...`)
  }
  
  try {
  const text = await file.text()
    console.log(`[ProjectPersistence] File read successfully, parsing JSON...`)
    
  let parsed: SavedProject
  try {
      // Use a timeout for JSON parsing to prevent hanging on corrupted files
      parsed = await Promise.race([
        Promise.resolve(JSON.parse(text) as SavedProject),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('JSON parsing timeout (30s)')), 30000)
        )
      ])
      console.log(`[ProjectPersistence] JSON parsed successfully`)
  } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse project file (invalid JSON): ${error.message}`)
      } else if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`Project file is too large or corrupted. JSON parsing timed out.`)
      } else {
    throw new Error('Invalid project file. Please select a JSON project exported from the viewer.')
      }
  }

    console.log(`[ProjectPersistence] Applying project snapshot...`)
  await applyProjectSnapshot(parsed)
    console.log(`[ProjectPersistence] ✅ Project loaded successfully!`)
  } catch (error) {
    console.error(`[ProjectPersistence] ❌ Failed to load project:`, error)
    isProjectLoading = false // Clear flag on error
    throw error
  } finally {
    isProjectLoading = false // Always clear flag when done
  }
}

