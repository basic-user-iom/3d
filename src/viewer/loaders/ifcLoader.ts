// @ts-nocheck

import * as THREE from 'three'
import { LoadedModel } from '../useViewer'

/**
 * Loader for IFC (Industry Foundation Classes) files
 * Uses web-ifc-three library for parsing IFC files
 */
export async function loadIFC(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const { IFCLoader } = await import('web-ifc-three/IFCLoader')
  const loader = new IFCLoader()
  
  // Set WASM path - web-ifc needs WASM files to parse IFC
  // Use CDN as default, but allow override via environment or config
  try {
    // Serve WASM from /web-ifc/ (vite plugin copies node_modules/web-ifc) matching package.json web-ifc@0.0.74
    const wasmPath = import.meta.env.VITE_IFC_WASM_PATH || `${import.meta.env.BASE_URL}web-ifc/`
    loader.ifcManager.setWasmPath(wasmPath)
  } catch (error) {
    console.warn('[IFCLoader] Could not set WASM path, using default:', error)
  }

  try {
    // Convert input to ArrayBuffer or URL
    let arrayBuffer: ArrayBuffer | null = null
    let url: string | null = null

    if (data instanceof File) {
      arrayBuffer = await data.arrayBuffer()
    } else if (data instanceof ArrayBuffer) {
      arrayBuffer = data
    } else if (typeof data === 'string') {
      url = data
    } else {
      throw new Error('Invalid IFC data source')
    }

    // Load the IFC model
    // IFCLoader API: load() for URLs (callback-based), parse() for ArrayBuffer (Promise-based)
    let model: any
    console.log('[IFCLoader] Loading IFC - url:', url ? 'yes' : 'no', 'arrayBuffer:', arrayBuffer ? `${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB` : 'no')
    
    if (url) {
      // For URLs, use load() method (callback-based, wrap in Promise)
      console.log('[IFCLoader] Loading from URL:', url)
      model = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (ifcModel) => {
            console.log('[IFCLoader] Model loaded from URL successfully')
            resolve(ifcModel)
          },
          (progressEvent) => {
            if (onProgress && progressEvent.lengthComputable) {
              const percent = (progressEvent.loaded / progressEvent.total) * 100
              onProgress(percent)
            }
          },
          (error) => {
            console.error('[IFCLoader] Error loading from URL:', error)
            reject(error)
          }
        )
      })
    } else if (arrayBuffer) {
      // For ArrayBuffer, use parse() method (Promise-based)
      console.log('[IFCLoader] Loading from ArrayBuffer using parse()')
      try {
        if (typeof loader.parse === 'function') {
          model = await loader.parse(arrayBuffer)
          console.log('[IFCLoader] Model parsed successfully from ArrayBuffer')
        } else {
          throw new Error('IFCLoader.parse() method not available')
        }
      } catch (error) {
        console.error('[IFCLoader] Error parsing ArrayBuffer:', error)
        throw error
      }
    } else {
      throw new Error('IFC loader: No URL or ArrayBuffer provided')
    }

    // IFCLoader returns an IFCModel which has a mesh property
    // The model itself might be a Group or the mesh directly
    const mesh = model.mesh || model
    
    console.log('[IFCLoader] Model structure:', {
      hasMesh: !!model.mesh,
      modelType: model.constructor.name,
      meshType: mesh.constructor.name,
      children: mesh.children?.length || 0
    })
    
    // Industry-standard: Mark imported models with exclusion flags
    mesh.userData.isModel = true
    mesh.userData.isImportedModel = true
    mesh.userData.excludeFromSkyModifications = true
    mesh.userData.excludeFromWeatherModifications = true
    mesh.userData.format = 'ifc'
    mesh.userData.ifcModel = model // Store reference to IFC model for property queries
    
    // Count meshes and log for debugging
    let meshCount = 0
    let totalVertices = 0
    
    // Enable shadows by default for imported models
    mesh.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        meshCount++
        if (child.geometry) {
          const position = child.geometry.attributes.position
          if (position) {
            totalVertices += position.count
          }
        }
        
        child.castShadow = true
        child.receiveShadow = true
        
        // Ensure visibility
        child.visible = true
        
        // Disable fog on imported models
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((mat: THREE.Material) => {
            mat.fog = false
            mat.needsUpdate = true
            // Ensure material is visible
            if ('visible' in mat) {
              (mat as any).visible = true
            }
          })
        }
      }
    })
    
    console.log(`[IFCLoader] Model contains ${meshCount} mesh(es) with ${totalVertices.toLocaleString()} total vertices`)
    
    // Calculate bounding box for debugging
    const bbox = new THREE.Box3()
    bbox.setFromObject(mesh)
    const size = bbox.getSize(new THREE.Vector3())
    const center = bbox.getCenter(new THREE.Vector3())
    console.log('[IFCLoader] Model bounds:', {
      size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
      center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
      min: bbox.min,
      max: bbox.max
    })
    
    // Create a group to contain the model
    const group = new THREE.Group()
    group.add(mesh)
    group.userData.isModel = true
    group.userData.excludeFromSkyModifications = true
    group.userData.excludeFromWeatherModifications = true
    group.userData.format = 'ifc'
    group.visible = true // Ensure group is visible
    
    // Check if this is a Revit model (from Revit sync server)
    // Mark it so it's not hidden by Streets GL overlay
    if (typeof data === 'string') {
      const url = data.toLowerCase()
      if (url.includes('/api/revit/download') || 
          url.includes('/api/revit/upload') ||
          url.includes('revit')) {
        group.userData.isRevitModel = true
        group.userData.excludeFromStreetsGLHiding = true
        console.log('[IFCLoader] Marked as Revit model - will remain visible', { url: data })
      }
    }

    return {
      scene: group,
      animations: [],
      userData: {
        format: 'ifc',
        ifcModel: model // Store for property queries
      }
    }
  } catch (error) {
    throw new Error(`Failed to load IFC: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
