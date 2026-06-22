import * as THREE from 'three'

export interface InstancingResult {
  success: boolean
  instancedMesh: THREE.InstancedMesh | null
  originalObjects: THREE.Object3D[]
  instanceCount: number
  error?: string
}

/**
 * Compare two geometries to see if they're the same
 * Checks geometry attributes (position, normal, uv) and indices
 */
export function areGeometriesEqual(geom1: THREE.BufferGeometry, geom2: THREE.BufferGeometry): boolean {
  // Quick check: same object reference
  if (geom1 === geom2) return true

  // Check if both have position attributes
  const pos1 = geom1.attributes.position
  const pos2 = geom2.attributes.position
  if (!pos1 || !pos2) return false
  if (pos1.count !== pos2.count) return false

  // Compare position data
  const pos1Array = pos1.array as Float32Array
  const pos2Array = pos2.array as Float32Array
  if (pos1Array.length !== pos2Array.length) return false
  
  // Compare with tolerance for floating point differences
  const tolerance = 0.0001
  for (let i = 0; i < pos1Array.length; i++) {
    if (Math.abs(pos1Array[i] - pos2Array[i]) > tolerance) {
      return false
    }
  }

  // Compare indices if they exist
  if (geom1.index && geom2.index) {
    const idx1 = geom1.index.array as Uint32Array | Uint16Array
    const idx2 = geom2.index.array as Uint32Array | Uint16Array
    if (idx1.length !== idx2.length) return false
    for (let i = 0; i < idx1.length; i++) {
      if (idx1[i] !== idx2[i]) return false
    }
  } else if (geom1.index !== geom2.index) {
    // One has indices, the other doesn't
    return false
  }

  return true
}

/**
 * Get a signature for a geometry based on its key properties
 * Used for quick duplicate detection
 */
export function getGeometrySignature(geometry: THREE.BufferGeometry): string {
  const pos = geometry.attributes.position
  if (!pos) return ''

  const vertexCount = pos.count
  const hasIndex = geometry.index !== null
  const indexCount = hasIndex ? geometry.index!.count : 0
  
  // Use a hash of the first few vertices for quick comparison
  const posArray = pos.array as Float32Array
  let hash = 0
  const sampleSize = Math.min(100, posArray.length) // Sample first 100 values
  for (let i = 0; i < sampleSize; i++) {
    hash = ((hash << 5) - hash) + posArray[i]
    hash = hash & hash // Convert to 32-bit integer
  }

  return `${vertexCount}-${indexCount}-${hasIndex ? 'idx' : 'noidx'}-${hash}`
}

/**
 * Find all meshes in an object (recursively)
 */
function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh)) {
      meshes.push(child)
    }
  })
  
  return meshes
}

/**
 * Get the primary geometry from an object (first mesh's geometry)
 */
function getPrimaryGeometry(obj: THREE.Object3D): THREE.BufferGeometry | null {
  const meshes = collectMeshes(obj)
  if (meshes.length === 0) return null
  return meshes[0].geometry || null
}

/**
 * Get the primary material from an object (first mesh's material)
 */
function getPrimaryMaterial(obj: THREE.Object3D): THREE.Material | null {
  const meshes = collectMeshes(obj)
  if (meshes.length === 0) return null
  const material = meshes[0].material
  if (!material) return null
  return Array.isArray(material) ? material[0] : material
}

/**
 * Group objects by their geometry signature
 */
export function groupObjectsByGeometry(objects: THREE.Object3D[]): Map<string, THREE.Object3D[]> {
  const groups = new Map<string, THREE.Object3D[]>()
  
  objects.forEach(obj => {
    const meshes = collectMeshes(obj)
    if (meshes.length === 0) return
    
    // Use the first mesh's geometry as the signature
    const firstMesh = meshes[0]
    if (!firstMesh.geometry) return
    
    const signature = getGeometrySignature(firstMesh.geometry)
    
    if (!groups.has(signature)) {
      groups.set(signature, [])
    }
    groups.get(signature)!.push(obj)
  })
  
  return groups
}

/**
 * Convert multiple objects with the same geometry into a single InstancedMesh
 * All objects must have the same geometry structure
 */
export function convertToInstancedMesh(
  objects: THREE.Object3D[],
  scene: THREE.Scene
): InstancingResult {
  if (objects.length === 0) {
    return {
      success: false,
      instancedMesh: null,
      originalObjects: [],
      instanceCount: 0,
      error: 'No objects provided'
    }
  }

  // Verify all objects have the same geometry
  const firstGeometry = getPrimaryGeometry(objects[0])
  const firstMaterial = getPrimaryMaterial(objects[0])
  
  if (!firstGeometry || !firstMaterial) {
    return {
      success: false,
      instancedMesh: null,
      originalObjects: [],
      instanceCount: 0,
      error: 'First object has no geometry or material'
    }
  }

  // Verify all objects have the same geometry
  for (let i = 1; i < objects.length; i++) {
    const geom = getPrimaryGeometry(objects[i])
    if (!geom || !areGeometriesEqual(firstGeometry, geom)) {
      return {
        success: false,
        instancedMesh: null,
        originalObjects: [],
        instanceCount: 0,
        error: `Object ${i + 1} has different geometry than the first object`
      }
    }
  }

  // Create InstancedMesh with one instance per object
  const instancedMesh = new THREE.InstancedMesh(
    firstGeometry,
    firstMaterial,
    objects.length
  )

  // Copy properties from first object
  const firstObject = objects[0]
  instancedMesh.name = `${firstObject.name || 'Instance'}_Instanced`
  
  // Get properties from first mesh if available
  const firstMeshes = collectMeshes(firstObject)
  if (firstMeshes.length > 0) {
    const firstMesh = firstMeshes[0]
    instancedMesh.castShadow = firstMesh.castShadow
    instancedMesh.receiveShadow = firstMesh.receiveShadow
    instancedMesh.frustumCulled = firstMesh.frustumCulled
    instancedMesh.visible = firstMesh.visible
  } else {
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.frustumCulled = true
    instancedMesh.visible = true
  }

  // Group objects by their parent to preserve hierarchy
  const parentGroups = new Map<THREE.Object3D | null, THREE.Object3D[]>()
  objects.forEach(obj => {
    const parent = obj.parent
    if (!parentGroups.has(parent)) {
      parentGroups.set(parent, [])
    }
    parentGroups.get(parent)!.push(obj)
  })

  // Create one InstancedMesh per parent group to preserve hierarchy
  const results: THREE.InstancedMesh[] = []
  const allOriginalObjects: THREE.Object3D[] = []

  for (const [parent, parentObjects] of parentGroups) {
    // Create InstancedMesh for this parent group
    const parentInstancedMesh = new THREE.InstancedMesh(
      firstGeometry,
      firstMaterial,
      parentObjects.length
    )

    // Copy properties from first object
    const firstParentObject = parentObjects[0]
    parentInstancedMesh.name = `${firstParentObject.name || 'Instance'}_Instanced`
    
    // Get properties from first mesh if available
    const firstMeshes = collectMeshes(firstParentObject)
    if (firstMeshes.length > 0) {
      const firstMesh = firstMeshes[0]
      parentInstancedMesh.castShadow = firstMesh.castShadow
      parentInstancedMesh.receiveShadow = firstMesh.receiveShadow
      parentInstancedMesh.frustumCulled = firstMesh.frustumCulled
      parentInstancedMesh.visible = firstMesh.visible
    } else {
      parentInstancedMesh.castShadow = true
      parentInstancedMesh.receiveShadow = true
      parentInstancedMesh.frustumCulled = true
      parentInstancedMesh.visible = true
    }

    // Set instance matrices - use local matrices relative to parent
    const matrix = new THREE.Matrix4()
    const parentMatrix = new THREE.Matrix4()
    const parentMatrixInverse = new THREE.Matrix4()
    
    // Get parent's world matrix if it exists
    if (parent) {
      parent.updateMatrixWorld()
      parentMatrix.copy(parent.matrixWorld)
      parentMatrixInverse.copy(parentMatrix).invert()
    }

    parentObjects.forEach((obj, index) => {
      // Update object's world matrix
      obj.updateMatrixWorld()
      
      if (parent) {
        // Convert world matrix to local matrix relative to parent
        matrix.copy(obj.matrixWorld)
        matrix.premultiply(parentMatrixInverse)
      } else {
        // No parent, use world matrix directly
        matrix.copy(obj.matrixWorld)
      }
      
      parentInstancedMesh.setMatrixAt(index, matrix)
    })

    // Mark as instanced
    parentInstancedMesh.userData.isInstanced = true
    parentInstancedMesh.userData.isModel = true
    parentInstancedMesh.userData.originalObjects = parentObjects.map(obj => obj.uuid)
    parentInstancedMesh.userData.instanceCount = parentObjects.length

    // Add to the same parent as original objects (preserve hierarchy)
    if (parent) {
      parent.add(parentInstancedMesh)
      // Set to origin relative to parent
      parentInstancedMesh.position.set(0, 0, 0)
      parentInstancedMesh.rotation.set(0, 0, 0)
      parentInstancedMesh.scale.set(1, 1, 1)
    } else {
      // No parent, add to scene
      scene.add(parentInstancedMesh)
      parentInstancedMesh.position.set(0, 0, 0)
      parentInstancedMesh.rotation.set(0, 0, 0)
      parentInstancedMesh.scale.set(1, 1, 1)
    }

    // Remove original objects from their parent
    parentObjects.forEach(obj => {
      if (obj.parent) {
        obj.parent.remove(obj)
      } else if (scene.children.includes(obj)) {
        scene.remove(obj)
      }
      allOriginalObjects.push(obj)
    })

    results.push(parentInstancedMesh)
  }

  // Return the first result (or we could return all of them)
  const primaryResult = results[0]
  
  return {
    success: true,
    instancedMesh: primaryResult,
    originalObjects: allOriginalObjects,
    instanceCount: primaryResult.count
  }
}

/**
 * Find all duplicate objects in the scene and convert them to instances
 */
export function convertAllDuplicatesToInstances(scene: THREE.Scene): {
  converted: number
  instancesCreated: number
  errors: string[]
} {
  const errors: string[] = []
  let converted = 0
  let instancesCreated = 0

  // Get all objects (models, primitives, etc.) - not just top-level
  // Objects can be nested inside groups (like a "Scene" group)
  const allObjects: THREE.Object3D[] = []
  const processedObjects = new Set<THREE.Object3D>()
  
  scene.traverse((obj) => {
    // Skip if already processed or instanced
    if (processedObjects.has(obj) || obj instanceof THREE.InstancedMesh || obj.userData.isInstanced) {
      return
    }
    
    // Skip helper objects or system objects
    if (obj.userData.isHelper || 
        obj.userData.isLightGizmo || 
        obj.userData.isBoundingBoxHelper ||
        obj.userData.isStartingObjectsGroup ||
        obj.userData.isNativeObjectsGroup ||
        obj.userData.isPivotWrapper ||
        obj instanceof THREE.Light ||
        obj instanceof THREE.Camera ||
        obj.name === 'Scene' && obj instanceof THREE.Group) {
      return
    }
    
    // Check if this is a model (same logic as ObjectsPanel)
    const isModel = obj.userData.isModel === true || obj.userData.isImportedModel === true
    
    // Determine if this is a root model object (should appear in the list)
    // Root model = has isModel flag, OR is a direct child of scene with isImportedModel, OR parent doesn't have isModel
    const isRootModel = obj.userData.isModel === true || 
                       (obj.userData.isImportedModel === true && 
                        (!obj.parent || obj.parent === scene || !obj.parent.userData.isModel))
    
    // Include root models and primitives (same as ObjectsPanel)
    if (isRootModel || obj.userData.isPrimitive === true) {
      allObjects.push(obj)
      processedObjects.add(obj)
    }
  })
  
  console.log(`[ObjectInstancing] Found ${allObjects.length} objects to check for duplicates`)

  // Group by geometry signature
  const groups = groupObjectsByGeometry(allObjects)
  
  console.log(`[ObjectInstancing] Found ${groups.size} geometry groups`)

  // Convert each group with 2+ objects
  for (const [signature, objects] of groups) {
    if (objects.length < 2) {
      console.log(`[ObjectInstancing] Skipping group with only ${objects.length} object(s)`)
      continue
    }

    console.log(`[ObjectInstancing] Checking group with ${objects.length} objects (signature: ${signature})`)

    // Verify geometries are actually the same
    const firstObj = objects[0]
    const firstMeshes = collectMeshes(firstObj)
    if (firstMeshes.length === 0) {
      console.warn(`[ObjectInstancing] First object has no meshes, skipping`)
      continue
    }

    const allSameGeometry = objects.every(obj => {
      const meshes = collectMeshes(obj)
      if (meshes.length !== firstMeshes.length) {
        console.warn(`[ObjectInstancing] Object ${obj.name || obj.uuid} has ${meshes.length} meshes, expected ${firstMeshes.length}`)
        return false
      }
      
      return meshes.every((mesh, idx) => {
        if (!mesh.geometry || !firstMeshes[idx].geometry) {
          console.warn(`[ObjectInstancing] Object ${obj.name || obj.uuid} mesh ${idx} has no geometry`)
          return false
        }
        const isEqual = areGeometriesEqual(mesh.geometry, firstMeshes[idx].geometry)
        if (!isEqual) {
          console.warn(`[ObjectInstancing] Object ${obj.name || obj.uuid} mesh ${idx} has different geometry`)
        }
        return isEqual
      })
    })

    if (!allSameGeometry) {
      console.warn(`[ObjectInstancing] Objects with signature ${signature} have different geometries, skipping`)
      continue
    }

    console.log(`[ObjectInstancing] All ${objects.length} objects have the same geometry, converting to instance...`)

    // Convert to instance
    const result = convertToInstancedMesh(objects, scene)
    if (result.success) {
      converted += objects.length
      instancesCreated++
      console.log(`[ObjectInstancing] ✅ Successfully converted ${objects.length} objects to 1 InstancedMesh`)
    } else {
      const errorMsg = result.error || 'Unknown error'
      console.error(`[ObjectInstancing] ❌ Failed to convert objects: ${errorMsg}`)
      errors.push(errorMsg)
    }
  }

  return {
    converted,
    instancesCreated,
    errors
  }
}
