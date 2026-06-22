import * as THREE from 'three'

/**
 * Face extrusion utilities for SketchUp-style push/pull editing
 */

export interface FaceInfo {
  faceIndex: number
  normal: THREE.Vector3
  position: THREE.Vector3
  geometry: THREE.BufferGeometry
  mesh: THREE.Mesh
}

/**
 * Get face information from a raycast intersection
 */
export function getFaceInfo(intersect: THREE.Intersection): FaceInfo | null {
  if (!intersect.face || !intersect.object || !(intersect.object instanceof THREE.Mesh)) {
    return null
  }

  const mesh = intersect.object as THREE.Mesh
  const geometry = mesh.geometry
  const faceIndex = intersect.faceIndex ?? 0

  if (!geometry.attributes.position) {
    return null
  }

  const positions = geometry.attributes.position
  const face = intersect.face

  // Calculate face normal in world space
  const normal = new THREE.Vector3()
  if (face.normal) {
    normal.copy(face.normal)
  } else {
    // Calculate normal from face vertices
    const a = new THREE.Vector3().fromBufferAttribute(positions, face.a)
    const b = new THREE.Vector3().fromBufferAttribute(positions, face.b)
    const c = new THREE.Vector3().fromBufferAttribute(positions, face.c)
    normal.subVectors(c, b)
    const temp = new THREE.Vector3().subVectors(a, b)
    normal.cross(temp)
    normal.normalize()
  }

  // Transform normal to world space
  mesh.updateMatrixWorld()
  normal.transformDirection(mesh.matrixWorld)

  // Get face center position in world space
  const a = new THREE.Vector3().fromBufferAttribute(positions, face.a)
  const b = new THREE.Vector3().fromBufferAttribute(positions, face.b)
  const c = new THREE.Vector3().fromBufferAttribute(positions, face.c)
  const center = new THREE.Vector3()
    .add(a)
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3)

  center.applyMatrix4(mesh.matrixWorld)

  return {
    faceIndex,
    normal,
    position: center,
    geometry,
    mesh
  }
}

/**
 * Determine which face of a box was clicked (for box primitives)
 * Returns: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | null
 */
export function getBoxFace(intersect: THREE.Intersection, mesh: THREE.Mesh): string | null {
  // Check if geometry is a BoxGeometry - support both type property and constructor name
  const isBoxGeometry = mesh.geometry.type === 'BoxGeometry' || 
                        mesh.geometry.constructor.name === 'BoxGeometry' ||
                        (mesh.userData?.isPrimitive && mesh.userData?.primitiveType === 'box')
  
  if (!isBoxGeometry) {
    console.log('[FaceExtrusion] Geometry is not a BoxGeometry:', {
      type: mesh.geometry.type,
      constructor: mesh.geometry.constructor.name,
      userData: mesh.userData
    })
    return null
  }

  const faceInfo = getFaceInfo(intersect)
  if (!faceInfo) return null

  // Get the face normal in local space
  const localNormal = new THREE.Vector3()
  const geometry = mesh.geometry
  if (intersect.face?.normal) {
    localNormal.copy(intersect.face.normal)
    mesh.updateMatrixWorld()
  } else {
    // Calculate normal from face vertices if not available
    const face = intersect.face
    if (!face) return null
    
    const positions = geometry.attributes.position
    const a = new THREE.Vector3().fromBufferAttribute(positions, face.a)
    const b = new THREE.Vector3().fromBufferAttribute(positions, face.b)
    const c = new THREE.Vector3().fromBufferAttribute(positions, face.c)
    
    const v1 = new THREE.Vector3().subVectors(b, a)
    const v2 = new THREE.Vector3().subVectors(c, a)
    localNormal.crossVectors(v1, v2).normalize()
  }
  
  // Transform normal to world space and back to local to get clean axis-aligned normal
  // This handles rotated boxes correctly
  const worldNormal = localNormal.clone()
  mesh.updateMatrixWorld()
  worldNormal.transformDirection(mesh.matrixWorld)
  
  // Transform back to local space to get axis-aligned normal
  const invMatrix = mesh.matrixWorld.clone().invert()
  worldNormal.transformDirection(invMatrix)
  localNormal.copy(worldNormal)

  // Find the dominant axis (threshold to handle floating point errors)
  const threshold = 0.5 // Must be > 0.5 to be considered dominant
  const absX = Math.abs(localNormal.x)
  const absY = Math.abs(localNormal.y)
  const absZ = Math.abs(localNormal.z)

  if (absY > threshold && absY >= absX && absY >= absZ) {
    return localNormal.y > 0 ? 'top' : 'bottom'
  } else if (absZ > threshold && absZ >= absX && absZ >= absY) {
    return localNormal.z > 0 ? 'front' : 'back'
  } else if (absX > threshold && absX >= absY && absX >= absZ) {
    return localNormal.x > 0 ? 'right' : 'left'
  }

  // Fallback: use largest absolute value
  if (absY > absX && absY > absZ) {
    return localNormal.y > 0 ? 'top' : 'bottom'
  } else if (absZ > absX && absZ > absY) {
    return localNormal.z > 0 ? 'front' : 'back'
  } else if (absX > absY && absX > absZ) {
    return localNormal.x > 0 ? 'right' : 'left'
  }

  return null
}

/**
 * Extrude a box face by modifying its geometry
 * This creates a new geometry with the face extruded
 * @param box - The mesh to extrude
 * @param faceName - Which face to extrude ('top', 'bottom', 'front', 'back', 'left', 'right')
 * @param distance - Distance to extrude (can be positive or negative)
 * @param originalParams - Optional original parameters {width, height, depth} to use instead of current geometry
 */
export function extrudeBoxFace(
  box: THREE.Mesh,
  faceName: string,
  distance: number,
  originalParams?: { width: number; height: number; depth: number } | null,
  originalCenter?: THREE.Vector3 | null
): THREE.BoxGeometry {
  const geometry = box.geometry as THREE.BoxGeometry
  if (!geometry) {
    throw new Error('Expected BoxGeometry')
  }

  // Use original parameters if provided, otherwise get from current geometry
  let params = originalParams || (geometry as any).parameters
  if (!params) {
    // Fallback: calculate from bounding box if parameters don't exist
    geometry.computeBoundingBox()
    const box3 = geometry.boundingBox
    if (!box3) {
      throw new Error('Could not determine box dimensions')
    }
    const size = box3.getSize(new THREE.Vector3())
    
    // Create new geometry with updated dimensions (use original params if available)
    let width = originalParams?.width || size.x
    let height = originalParams?.height || size.y
    let depth = originalParams?.depth || size.z
    
    let offsetX = 0
    let offsetY = 0
    let offsetZ = 0
    
    switch (faceName) {
      case 'top':
        height += distance
        offsetY = distance / 2
        break
      case 'bottom':
        height += distance
        offsetY = -distance / 2
        break
      case 'front':
        depth += distance
        offsetZ = distance / 2
        break
      case 'back':
        depth += distance
        offsetZ = -distance / 2
        break
      case 'right':
        width += distance
        offsetX = distance / 2
        break
      case 'left':
        width += distance
        offsetX = -distance / 2
        break
    }
    
    // Ensure minimum dimensions
    width = Math.max(0.1, width)
    height = Math.max(0.1, height)
    depth = Math.max(0.1, depth)
    
    // Create new geometry and translate it so the opposite face stays in place.
    const newGeometry = new THREE.BoxGeometry(width, height, depth)
    newGeometry.translate(offsetX, offsetY, offsetZ)
    return newGeometry
  }
  
  // Use parameters directly (from originalParams or current geometry)
  let width = params.width
  let height = params.height
  let depth = params.depth

  // Calculate offset needed to keep the opposite face in place
  let offsetX = 0
  let offsetY = 0
  let offsetZ = 0

  switch (faceName) {
    case 'top':
      height += distance
      offsetY = distance / 2
      break
    case 'bottom':
      height += distance
      offsetY = -distance / 2
      break
    case 'front':
      depth += distance
      offsetZ = distance / 2
      break
    case 'back':
      depth += distance
      offsetZ = -distance / 2
      break
    case 'right':
      width += distance
      offsetX = distance / 2
      break
    case 'left':
      width += distance
      offsetX = -distance / 2
      break
  }

  // Ensure minimum dimensions
  width = Math.max(0.1, width)
  height = Math.max(0.1, height)
  depth = Math.max(0.1, depth)

  // Create new geometry and translate it so the opposite face stays in place.
  const newGeometry = new THREE.BoxGeometry(width, height, depth)
  const center = originalCenter ?? new THREE.Vector3()
  newGeometry.translate(center.x + offsetX, center.y + offsetY, center.z + offsetZ)

  return newGeometry
}

export interface GenericExtrudeOptions {
  mesh: THREE.Mesh
  faceIndex: number
  distance: number
  worldNormal?: THREE.Vector3
  originalGeometry?: THREE.BufferGeometry
  originalMatrixWorld?: THREE.Matrix4
}

/**
 * Extrude an arbitrary triangular face of a mesh by creating a simple prism
 * Uses non-indexed geometry for simplicity; keeps the original face as the base,
 * adds the offset face, and connects edges with side quads (two triangles each).
 */
export function extrudeFaceGeneric(options: GenericExtrudeOptions): THREE.BufferGeometry {
  const { mesh, faceIndex, distance, worldNormal, originalGeometry, originalMatrixWorld } = options

  const sourceGeometry = (originalGeometry ? originalGeometry.clone() : (mesh.geometry as THREE.BufferGeometry).clone())
  const baseGeometry = sourceGeometry.toNonIndexed()

  const positions = baseGeometry.attributes.position
  if (!positions) {
    throw new Error('Geometry has no position attribute')
  }

  const faceStart = faceIndex * 3
  if (faceStart + 3 > positions.count) {
    throw new Error(`Invalid face index ${faceIndex} for geometry with ${positions.count / 3} faces`)
  }

  const v0 = new THREE.Vector3().fromBufferAttribute(positions, faceStart)
  const v1 = new THREE.Vector3().fromBufferAttribute(positions, faceStart + 1)
  const v2 = new THREE.Vector3().fromBufferAttribute(positions, faceStart + 2)

  // Determine world-space normal; fall back to computed normal if not provided
  const computedNormal = new THREE.Vector3()
  computedNormal.subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize()
  const worldNormalDir = (worldNormal ? worldNormal.clone() : computedNormal).normalize()

  // Convert world-space displacement to local-space displacement to respect object scaling/rotation
  const displacementWorld = worldNormalDir.clone().multiplyScalar(distance)
  const matrixWorld = (originalMatrixWorld ? originalMatrixWorld.clone() : mesh.matrixWorld.clone())
  const invMatrix = new THREE.Matrix4().copy(matrixWorld).invert()
  const originLocal = new THREE.Vector3().applyMatrix4(invMatrix)
  const displacementLocal = displacementWorld.clone().applyMatrix4(invMatrix).sub(originLocal)

  const v0e = v0.clone().add(displacementLocal)
  const v1e = v1.clone().add(displacementLocal)
  const v2e = v2.clone().add(displacementLocal)

  const newPositions: number[] = Array.from(positions.array as ArrayLike<number>)

  const addTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    newPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }

  // Offset face
  addTri(v0e, v1e, v2e)

  // Side faces (two triangles per edge)
  addTri(v0, v1, v1e)
  addTri(v0, v1e, v0e)

  addTri(v1, v2, v2e)
  addTri(v1, v2e, v1e)

  addTri(v2, v0, v0e)
  addTri(v2, v0e, v2e)

  const newGeometry = new THREE.BufferGeometry()
  newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3))
  newGeometry.computeVertexNormals()
  newGeometry.computeBoundingBox()
  newGeometry.computeBoundingSphere()

  return newGeometry
}

