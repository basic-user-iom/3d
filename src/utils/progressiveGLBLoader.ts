/**
 * Progressive GLB Loader
 * Loads GLB files in chunks, prioritizing visible parts first
 * For very large files, this allows viewing while loading
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { getMemoryInfo, canLoadFile, estimateGLBMemory } from './memoryMonitor'

export interface ProgressiveLoadOptions {
  /** Maximum file size to attempt progressive loading (MB) */
  maxProgressiveSize: number
  /** Chunk size for reading file (bytes) */
  chunkSize: number
  /** Callback for load progress (0-100) */
  onProgress?: (progress: number, message: string) => void
  /** Enable interior/exterior separation */
  separateInteriors: boolean
}

/**
 * Check if GLB has interior/exterior separation
 * This is a heuristic - looks for objects with specific naming patterns
 */
function hasInteriorExteriorSeparation(gltf: any): boolean {
  const scene = gltf.scene || gltf
  
  let hasInterior = false
  let hasExterior = false
  
  scene.traverse((obj: THREE.Object3D) => {
    const name = obj.name?.toLowerCase() || ''
    if (name.includes('interior') || name.includes('inside') || name.includes('inner')) {
      hasInterior = true
    }
    if (name.includes('exterior') || name.includes('outside') || name.includes('outer') || name.includes('shell')) {
      hasExterior = true
    }
  })
  
  return hasInterior && hasExterior
}

/**
 * Separate objects into interior and exterior groups
 */
function separateInteriorExterior(scene: THREE.Scene): {
  exterior: THREE.Object3D[]
  interior: THREE.Object3D[]
} {
  const exterior: THREE.Object3D[] = []
  const interior: THREE.Object3D[] = []
  
  scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      const name = obj.name?.toLowerCase() || ''
      const parentName = obj.parent?.name?.toLowerCase() || ''
      
      if (name.includes('interior') || name.includes('inside') || name.includes('inner') ||
          parentName.includes('interior') || parentName.includes('inside') || parentName.includes('inner')) {
        interior.push(obj)
      } else {
        exterior.push(obj)
      }
    }
  })
  
  return { exterior, interior }
}

/**
 * Load GLB with progressive/interior-exterior separation
 * 
 * Strategy:
 * 1. Load metadata first (JSON chunk)
 * 2. Load exterior objects first (visible from outside)
 * 3. Load interior objects on demand (when camera enters)
 * 4. Use LOD for distant objects
 */
export async function loadGLBProgressive(
  file: File,
  options: Partial<ProgressiveLoadOptions> = {}
): Promise<{
  scene: THREE.Scene
  exterior: THREE.Group
  interior: THREE.Group | null
  animations: THREE.AnimationClip[]
}> {
  const opts: ProgressiveLoadOptions = {
    maxProgressiveSize: 500, // 500MB
    chunkSize: 10 * 1024 * 1024, // 10MB chunks
    separateInteriors: true,
    ...options
  }

  // Check memory before loading
  const fileSizeMB = file.size / (1024 * 1024)
  const memoryCheck = canLoadFile(fileSizeMB)
  
  if (!memoryCheck.canLoad) {
    throw new Error(`Cannot load file: ${memoryCheck.reason}`)
  }

  if (memoryCheck.reason) {
    console.warn(`[ProgressiveGLBLoader] ${memoryCheck.reason}`)
  }

  opts.onProgress?.(0, 'Checking file structure...')

  // Read GLB header and JSON chunk first
  const headerBuffer = await file.slice(0, 20).arrayBuffer()
  const headerView = new DataView(headerBuffer)
  
  // Verify GLB magic number
  const magic = headerView.getUint32(0, true)
  if (magic !== 0x46546C67) { // "glTF"
    throw new Error('Invalid GLB file')
  }

  const version = headerView.getUint32(4, true)
  const length = headerView.getUint32(8, true)
  
  // Read JSON chunk length
  const jsonChunkLength = headerView.getUint32(12, true)
  const jsonChunkType = headerView.getUint32(16, true)
  
  if (jsonChunkType !== 0x4E4F534A) { // "JSON"
    throw new Error('Invalid GLB structure')
  }

  // Read JSON chunk
  opts.onProgress?.(10, 'Reading model structure...')
  const jsonChunkBuffer = await file.slice(20, 20 + jsonChunkLength).arrayBuffer()
  const jsonText = new TextDecoder().decode(jsonChunkBuffer)
  const gltfJson = JSON.parse(jsonText)

  // Check if we should use progressive loading
  const useProgressive = fileSizeMB > opts.maxProgressiveSize
  
  if (!useProgressive) {
    // File is small enough, use normal loader
    opts.onProgress?.(50, 'Loading model...')
    const loader = new GLTFLoader()
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer
        loader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            const scene = gltf.scene
            const exterior = new THREE.Group()
            exterior.add(scene)
            
            resolve({
              scene,
              exterior,
              interior: null,
              animations: gltf.animations || []
            })
          },
          reject
        )
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  // Progressive loading for large files
  opts.onProgress?.(20, 'Loading model progressively...')
  
  // Load full file (for now - true progressive loading requires custom GLB parser)
  // TODO: Implement true chunked loading with GLB format parsing
  const loader = new GLTFLoader()
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        opts.onProgress?.(30, 'Parsing model data...')
        
        loader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            opts.onProgress?.(70, 'Organizing model parts...')
            
            const scene = gltf.scene
            const exterior = new THREE.Group()
            const interior = opts.separateInteriors ? new THREE.Group() : null
            
            // Check if model has interior/exterior separation
            const hasSeparation = hasInteriorExteriorSeparation(gltf)
            
            if (hasSeparation && opts.separateInteriors) {
              const { exterior: exteriorObjs, interior: interiorObjs } = separateInteriorExterior(scene)
              
              // Add exterior objects
              exteriorObjs.forEach(obj => {
                if (obj.parent) {
                  obj.parent.remove(obj)
                }
                exterior.add(obj)
              })
              
              // Add interior objects (hidden initially)
              if (interior) {
                interiorObjs.forEach(obj => {
                  if (obj.parent) {
                    obj.parent.remove(obj)
                  }
                  interior.add(obj)
                  obj.visible = false // Hide interior initially
                })
              }
              
              // Add remaining objects to exterior
              scene.children.forEach(child => {
                if (child.parent === scene) {
                  exterior.add(child)
                }
              })
              
              console.log(`[ProgressiveGLBLoader] Separated: ${exteriorObjs.length} exterior, ${interiorObjs.length} interior objects`)
            } else {
              // No separation, add everything to exterior
              exterior.add(scene)
            }
            
            opts.onProgress?.(100, 'Model loaded')
            
            resolve({
              scene,
              exterior,
              interior,
              animations: gltf.animations || []
            })
          },
          reject
        )
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Show interior when camera enters building
 */
export function checkInteriorVisibility(
  camera: THREE.Camera,
  interior: THREE.Group,
  buildingBounds: THREE.Box3,
  threshold: number = 10
): boolean {
  const cameraPos = camera.position
  const center = new THREE.Vector3()
  buildingBounds.getCenter(center)
  
  // Check if camera is inside building bounds
  const isInside = buildingBounds.containsPoint(cameraPos)
  
  // Check distance to building center
  const distance = cameraPos.distanceTo(center)
  const size = buildingBounds.getSize(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z)
  
  // Show interior if camera is close or inside
  const shouldShow = isInside || distance < maxSize * 0.5 + threshold
  
  interior.visible = shouldShow
  
  return shouldShow
}








































