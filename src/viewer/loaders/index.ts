import { detectFormat, isGaussianSplatPly, ModelFormat } from '../../lib/detectFormat'
import { LoadedModel } from '../useViewer'
import { loadGLTF } from './gltfLoader'
import { loadFBX } from './fbxLoader'
import { loadOBJ } from './objLoader'
import { loadSTL } from './stlLoader'
import { loadPLY } from './plyLoader'
import { load3MF } from './3mfLoader'
import { loadCollada } from './colladaLoader'
import { load3DS } from './3dsLoader'
import { load3DM } from './3dmLoader'
import { loadDXF } from './dxfLoader'
import { loadFromZip } from './zipLoader'
import { loadSplat } from './splatLoader'

export interface LoadSource {
  file?: File
  url?: string
  data?: ArrayBuffer | string
  textureFiles?: Map<string, File>
  mergedTextures?: Map<string, string> // Map<textureNameToMerge, canonicalTextureName>
}

export async function loadModel(source: LoadSource, onProgress?: (progress: number) => void): Promise<LoadedModel> {
  let format: ModelFormat = 'unknown'
  let data: ArrayBuffer | string | File
  let baseUrl = source.url || ''

  const promoteGaussianSplatPlyFormat = (candidate: ArrayBuffer) => {
    if (format === 'ply' && isGaussianSplatPly(candidate)) {
      format = 'splat-ply'
    }
  }

  // Get data and detect format
  if (source.file) {
    data = source.file
    format = detectFormat(source.file)
    
    // Format detection (no logging needed)
    
    if (format === 'unknown') {
      // Try to read a bit to detect
      const arrayBuffer = await source.file.arrayBuffer()
      format = detectFormat(arrayBuffer)
      promoteGaussianSplatPlyFormat(arrayBuffer)
      // Format detected from ArrayBuffer
      data = arrayBuffer
      // Extract directory from file path if available
      const fileName = source.file.name
      if (fileName) {
        const lastSlash = fileName.lastIndexOf('/')
        if (lastSlash >= 0) {
          baseUrl = fileName.substring(0, lastSlash + 1)
        }
      }
    } else {
      if (format === 'ply') {
        const arrayBuffer = await source.file.arrayBuffer()
        promoteGaussianSplatPlyFormat(arrayBuffer)
      }

      // Extract directory from file path - use webkitRelativePath if available
      const fileName = source.file.name
      const relativePath = (source.file as any).webkitRelativePath || fileName
      
      // Extract base URL from relative path (for folder selections)
      if (relativePath.includes('/')) {
        const lastSlash = relativePath.lastIndexOf('/')
        if (lastSlash >= 0) {
          baseUrl = relativePath.substring(0, lastSlash + 1)
        }
      } else if (fileName) {
        const lastSlash = fileName.lastIndexOf('/')
        if (lastSlash >= 0) {
          baseUrl = fileName.substring(0, lastSlash + 1)
        }
      }
      
      // Base URL extracted from file path
    }
    
    // Safety check: if format is ZIP but we have textureFiles, it's probably a folder selection
    if (format === 'zip' && source.textureFiles && source.textureFiles.size > 0) {
      console.warn('Format detected as ZIP but textureFiles provided - treating as folder selection, re-detecting...')
      // Re-read and detect - ZIP files start with "PK" magic bytes
      const arrayBuffer = await source.file.arrayBuffer()
      const view = new Uint8Array(arrayBuffer.slice(0, 4))
      if (!(view[0] === 0x50 && view[1] === 0x4B)) {
        // Not a real ZIP, detect from extension or content
        format = detectFormat(source.file.name) || detectFormat(arrayBuffer)
        // Re-detected format (not ZIP)
        if (format === 'gltf' || format === 'glb') {
          // For GLTF, use text or binary based on format
          if (format === 'gltf') {
            data = new TextDecoder().decode(arrayBuffer)
          } else {
            data = arrayBuffer
          }
        }
      }
    }
  } else if (source.url) {
    format = detectFormat(source.url)
    const urlObj = new URL(source.url, window.location.href)
    baseUrl = urlObj.href.substring(0, urlObj.href.lastIndexOf('/') + 1)
    
    // Create AbortController for timeout (more compatible than AbortSignal.timeout)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    try {
      const response = await fetch(source.url, {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId) // Clear timeout if fetch succeeds
      
      if (!response.ok) {
        throw new Error(`Failed to fetch model from ${source.url}: ${response.status} ${response.statusText}`)
      }
      
      // Try to detect format from Content-Type header if URL detection failed
      if (format === 'unknown') {
        const contentType = response.headers.get('Content-Type') || ''
        console.log(`[LoadModel] Content-Type: ${contentType}`)
        
        if (contentType.includes('application/ifc') || contentType.includes('ifc')) {
          format = 'ifc'
          console.log('[LoadModel] Detected IFC format from Content-Type header')
        } else if (contentType.includes('model/gltf-binary') || contentType.includes('glb')) {
          format = 'glb'
        } else if (contentType.includes('model/gltf+json') || contentType.includes('gltf')) {
          format = 'gltf'
        }
        
        // Also try to get filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition') || ''
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (filenameMatch && filenameMatch[1]) {
          const filename = filenameMatch[1].replace(/['"]/g, '')
          console.log(`[LoadModel] Filename from Content-Disposition: ${filename}`)
          const detectedFromFilename = detectFormat(filename)
          if (detectedFromFilename !== 'unknown') {
            format = detectedFromFilename
            console.log(`[LoadModel] Detected format from filename: ${format}`)
          }
        }
      }
      
      data = await response.arrayBuffer()
      promoteGaussianSplatPlyFormat(data)
      
      // If format is still unknown, try to detect from ArrayBuffer content
      if (format === 'unknown') {
        format = detectFormat(data)
        promoteGaussianSplatPlyFormat(data)
        console.log(`[LoadModel] Detected format from content: ${format}`)
      }
      
      console.log(`[LoadModel] Final format: ${format}, data size: ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`)
    } catch (error) {
      clearTimeout(timeoutId) // Clear timeout in case of error
      
      // Handle network errors, timeouts, and connection failures
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          throw new Error(`Connection timeout: Failed to load model from ${source.url}. The server took too long to respond. Please check your internet connection and try again.`)
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          throw new Error(`Connection failed: Unable to reach ${source.url}. Please check your internet connection, VPN settings, or firewall. If the problem persists, try downloading the file and loading it locally.`)
        } else if (error.message.includes('CORS')) {
          throw new Error(`CORS error: The server at ${source.url} does not allow cross-origin requests. Please download the file and load it locally, or configure the server to allow CORS.`)
        }
        // Re-throw with more context
        throw new Error(`Failed to load model from ${source.url}: ${error.message}`)
      }
      throw new Error(`Unknown error while loading model from ${source.url}. Please check your internet connection and try again.`)
    }
  } else if (source.data) {
    data = source.data
    if (data instanceof ArrayBuffer) {
      format = detectFormat(data)
      promoteGaussianSplatPlyFormat(data)
    } else {
      format = detectFormat(data as string)
    }
  } else {
    throw new Error('No valid source provided')
  }

  // Route to appropriate loader with timeout
  const loadPromise = (async () => {
    switch (format) {
      case 'zip':
        if (source.file instanceof File) {
          return loadFromZip(source.file, onProgress)
        }
        if (data instanceof ArrayBuffer) {
          return loadFromZip(data, onProgress)
        }
        throw new Error('ZIP loading requires a File or ArrayBuffer')
      case 'gltf':
      case 'glb':
        return loadGLTF(data, baseUrl, onProgress, source.textureFiles, source.mergedTextures)
      case 'fbx':
        return loadFBX(data, onProgress, source.textureFiles)
      case 'obj':
        return loadOBJ(data, baseUrl, onProgress)
      case 'stl':
        return loadSTL(data, onProgress)
      case 'ply':
        return loadPLY(data, onProgress)
      case 'splat-ply':
      case 'splat':
      case 'ksplat':
        if (data instanceof ArrayBuffer) {
          return loadSplat(data, format, baseUrl, onProgress)
        }
        if (typeof data === 'string') {
          return loadSplat(data, format, baseUrl, onProgress)
        }
        if (source.file) {
          return loadSplat(source.file, format, baseUrl, onProgress)
        }
        throw new Error('Splat loading requires a File, ArrayBuffer, or URL')
      case '3mf':
        return load3MF(data, onProgress)
      case 'dae':
        return loadCollada(data, baseUrl, onProgress)
      case '3ds':
        return load3DS(data, onProgress)
      case '3dm':
        return load3DM(data, onProgress)
      case 'dxf':
        // DXF: dedicated loader focused on Revit room polylines
        if (data instanceof ArrayBuffer) {
          return loadDXF(data)
        }
        if (typeof data === 'string') {
          return loadDXF(data)
        }
        if (source.file instanceof File) {
          return loadDXF(source.file)
        }
        throw new Error('DXF loading requires a File, string, or ArrayBuffer')
      case 'ifc': {
        // IFC: Industry Foundation Classes format for BIM models (lazy-loaded vendor chunk)
        const { loadIFC } = await import('./ifcLoader')
        if (data instanceof ArrayBuffer) {
          return loadIFC(data, onProgress)
        }
        if (typeof data === 'string') {
          return loadIFC(data, onProgress)
        }
        if (source.file instanceof File) {
          return loadIFC(source.file, onProgress)
        }
        throw new Error('IFC loading requires a File, string, or ArrayBuffer')
      }
      case 'dwg':
        // DWG is a binary Autodesk format and not directly supported in-browser.
        // Guide users to export DXF from Revit instead.
        throw new Error(
          'DWG files are not supported. Please export a DXF from Revit with "Export rooms, spaces, and areas as polylines" enabled.'
        )
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  })()

  // Add timeout to prevent hanging
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Loading timeout: Model took too long to load (${format} format)`))
    }, 60000) // 60 second timeout
  })

  return Promise.race([loadPromise, timeoutPromise])
}

