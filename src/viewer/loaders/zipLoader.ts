import * as THREE from 'three'
import JSZip from 'jszip'
import { LoadedModel } from '../useViewer'
import { loadGLTF } from './gltfLoader'
import { loadFBX } from './fbxLoader'
import { loadOBJ } from './objLoader'
import { loadSTL } from './stlLoader'
import { loadPLY } from './plyLoader'
import { load3MF } from './3mfLoader'
import { loadCollada } from './colladaLoader'
import { load3DS } from './3dsLoader'
import { revokeAllLoaderBlobUrls, registerBlobUrl } from './blobUrlRegistry'

// Type definitions removed as they're not directly used

function pickMainEntry(paths: string[]): string | null {
  const lower = paths.map((p) => p.toLowerCase())
  const preferOrder = ['.glb', '.gltf', '.fbx', '.obj', '.dae', '.ply', '.stl', '.3mf', '.3ds']
  for (const ext of preferOrder) {
    const idx = lower.findIndex((p) => p.endsWith(ext))
    if (idx !== -1) return paths[idx]
  }
  return null
}

export async function loadFromZip(
  data: File | ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const buffer = data instanceof File ? await data.arrayBuffer() : data

  // Revoke blob URLs from previous ZIP imports before creating new ones
  revokeAllLoaderBlobUrls()

  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
  if (entries.length === 0) throw new Error('ZIP has no files')

  const mainPath = pickMainEntry(entries)
  if (!mainPath) throw new Error('ZIP does not contain a supported 3D model file')

  // Extract all files to Blob URLs
  const urlMap = new Map<string, string>()
  const byName = new Map<string, string>()

  const makeUrl = async (path: string) => {
    const file = zip.files[path]
    const blob = await file.async('blob')
    const url = URL.createObjectURL(blob)
    registerBlobUrl(url)
    urlMap.set(path.toLowerCase(), url)
    byName.set(path.split('/').pop()!.toLowerCase(), url)
  }

  // Create URLs in parallel (limited)
  await Promise.all(entries.map((p) => makeUrl(p)))

  // ZIP loaded, processing files

  // Create a case-insensitive lookup map for better matching
  const caseInsensitiveMap = new Map<string, string>()
  for (const [path, url] of urlMap.entries()) {
    const parts = path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/').toLowerCase()
      if (!caseInsensitiveMap.has(subPath)) {
        caseInsensitiveMap.set(subPath, url)
      }
    }
  }
  
  // Extract directory of main model file for relative path resolution
  const mainDir = mainPath.substring(0, mainPath.lastIndexOf('/') + 1)
  
  THREE.DefaultLoadingManager.setURLModifier((url) => {
    // If it's already a blob URL, don't modify it
    if (url.startsWith('blob:')) {
      return url
    }
    
    // Clean up the URL: remove leading ./, normalize slashes, remove blob URL prefix if present
    let clean = url.replace(/^blob:[^/]+/, '').replace(/^\.\//, '').replace(/\\/g, '/')
    // Remove leading slash if present
    clean = clean.replace(/^\//, '')
    
    // Extract just the path part if it looks like a full URL was constructed
    // e.g., if GLTF loader constructed "blob:http://.../images/file.jpg", extract "images/file.jpg"
    const urlMatch = clean.match(/\/([^/]+\/.*)$/)
    if (urlMatch) {
      clean = urlMatch[1]
    }
    
    const lower = clean.toLowerCase()
    
    // Processing resource request (texture/bin file)
    
    // Try multiple matching strategies:
    // 1. Exact match (case-insensitive)
    if (urlMap.has(lower)) {
      const resolved = urlMap.get(lower)!
      // Resolved via exact match
      return resolved
    }
    
    // 2. Try with main directory prefix (in case paths are relative to main file)
    const withMainDir = (mainDir + clean).toLowerCase()
    if (urlMap.has(withMainDir)) {
      const resolved = urlMap.get(withMainDir)!
      // Resolved with main dir
      return resolved
    }
    
    // 3. Try case-insensitive sub-path matching (handles images/file.jpg even if ZIP has Images/file.jpg)
    if (caseInsensitiveMap.has(lower)) {
      const resolved = caseInsensitiveMap.get(lower)!
      // Resolved via sub-path match
      return resolved
    }
    
    // 4. Try matching by filename only (last part of path)
    const baseName = lower.split('/').pop()!
    if (baseName && byName.has(baseName)) {
      const resolved = byName.get(baseName)!
      // Resolved via filename match
      return resolved
    }
    
    // 5. Try matching any part of the path (including partial matches)
    for (const [storedPath, blobUrl] of urlMap.entries()) {
      // Check if stored path ends with the requested path
      if (storedPath === lower || storedPath.endsWith('/' + lower) || storedPath.endsWith(lower)) {
        // Resolved via path ending match
        return blobUrl
      }
      // Check if requested path ends with stored path
      if (lower.endsWith('/' + storedPath) || lower === storedPath || lower.endsWith(storedPath)) {
        // Resolved via reverse match
        return blobUrl
      }
      // Check if they share the same filename
      const storedBaseName = storedPath.split('/').pop()!
      if (baseName && storedBaseName === baseName) {
        // Resolved via baseName match
        return blobUrl
      }
    }
    
    // If no match found, return original URL (may fail, but won't break the loader)
    console.warn(`✗ Could not resolve texture URL: ${url}`)
    console.warn(`  Cleaned path: ${clean}`)
    console.warn(`  Base name: ${baseName}`)
    console.warn(`  Available ZIP paths (first 15):`, Array.from(urlMap.keys()).slice(0, 15))
    console.warn(`  Available filenames (first 15):`, Array.from(byName.keys()).slice(0, 15))
    return url
  })

  try {
    const mainFile = zip.files[mainPath]
    const mainBytes = await mainFile.async('arraybuffer')
    const lower = mainPath.toLowerCase()

    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      // For GLTF/GLB, we need to pass the actual file content, not blob URLs
      // The URL modifier will handle mapping texture/bin paths to our blob URLs
      const mainDir = mainPath.substring(0, mainPath.lastIndexOf('/') + 1)
      
      if (lower.endsWith('.glb')) {
        // For .glb (binary), pass ArrayBuffer directly
        return await loadGLTF(mainBytes, mainDir, onProgress)
      } else {
        // For .gltf (JSON text), decode and pass as text string
        // The baseUrl (mainDir) will help resolve relative paths to .bin and texture files
        const gltfText = new TextDecoder().decode(mainBytes)
        return await loadGLTF(gltfText, mainDir, onProgress)
      }
    }
    if (lower.endsWith('.fbx')) return await loadFBX(mainBytes, onProgress)
    if (lower.endsWith('.obj')) {
      const text = new TextDecoder().decode(mainBytes)
      return await loadOBJ(text, mainDir, onProgress)
    }
    if (lower.endsWith('.stl')) return await loadSTL(mainBytes, onProgress)
    if (lower.endsWith('.ply')) return await loadPLY(mainBytes, onProgress)
    if (lower.endsWith('.3mf')) return await load3MF(mainBytes, onProgress)
    if (lower.endsWith('.dae')) {
      const text = new TextDecoder().decode(mainBytes)
      return await loadCollada(text, mainDir, onProgress)
    }
    if (lower.endsWith('.3ds')) return await load3DS(mainBytes, onProgress)

    throw new Error('ZIP main file is not a supported format')
  } catch (e) {
    console.error('Failed to load from ZIP:', e)
    throw e
  }

  // Blob URLs remain valid until the next ZIP import (revokeAllLoaderBlobUrls above).
  // URL modifier stays active for async texture/bin resolution during GLTF load.
}


