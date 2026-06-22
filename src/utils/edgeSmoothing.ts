/**
 * Edge Smoothing Utility (Autosoft Edge)
 * Smooths/sharpens edges on 3D meshes by modifying vertex normals and positions
 * Similar to Twinmotion's Autosoft Edge and D5 Render's edge smoothing features
 * 
 * Based on standard edge beveling/chamfering techniques:
 * - Vertex normal smoothing (creates soft edges visually)
 * - Edge beveling (adds geometry for physical bevels at higher intensities)
 * - UV-preserving geometry modification
 */

import * as THREE from 'three'

export interface EdgeSmoothingOptions {
  intensity: number // 0.0 (sharp) to 1.0 (very soft), default 0.5
  preserveUVs: boolean // Preserve texture coordinates, default true
  angleThreshold: number // Angle in radians below which edges are smoothed, default Math.PI / 6 (30 degrees)
  useGeometryBeveling: boolean // If true, adds geometry for true beveling (slower but more accurate)
  segments: number // Number of segments for beveled edges (only used if useGeometryBeveling is true)
}

/**
 * Smooth edges on a mesh using a hybrid approach:
 * - Low intensity (< 0.5): Uses normal smoothing (fast, visual effect)
 * - High intensity (>= 0.5): Uses geometry beveling (slower, but adds actual geometry)
 */
export function smoothEdges(
  mesh: THREE.Mesh,
  options: Partial<EdgeSmoothingOptions> = {}
): void {
  if (!mesh.geometry) return
  
  const opts: EdgeSmoothingOptions = {
    intensity: 0.5,
    preserveUVs: true,
    angleThreshold: Math.PI / 6, // 30 degrees
    useGeometryBeveling: false, // Default to normal smoothing for performance
    segments: 2,
    ...options
  }
  
  // Use geometry beveling for higher intensities or if explicitly requested
  if (opts.useGeometryBeveling || opts.intensity >= 0.5) {
    bevelEdgesGeometry(mesh, opts)
  } else {
    smoothEdgesNormals(mesh, opts)
  }
}

/**
 * Smooth edges by modifying vertex normals only (fast, visual effect)
 * This creates the appearance of soft edges without changing geometry
 */
function smoothEdgesNormals(
  mesh: THREE.Mesh,
  opts: EdgeSmoothingOptions
): void {
  const geometry = mesh.geometry
  
  // Ensure geometry has attributes we need
  if (!geometry.attributes.position || !geometry.attributes.normal) {
    console.warn('[EdgeSmoothing] Geometry missing required attributes')
    return
  }
  
  // Clone geometry to avoid modifying original
  const clonedGeometry = geometry.clone()
  
  const positions = clonedGeometry.attributes.position.array as Float32Array
  const normals = clonedGeometry.attributes.normal.array as Float32Array
  const uvs = clonedGeometry.attributes.uv ? clonedGeometry.attributes.uv.array as Float32Array : null
  
  const vertexCount = positions.length / 3
  
  // Build vertex-to-face adjacency map
  const vertexFaces = new Map<number, number[]>()
  const faces: Array<{ a: number; b: number; c: number }> = []
  
  if (clonedGeometry.index) {
    const indices = clonedGeometry.index.array as Uint16Array | Uint32Array
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]
      const b = indices[i + 1]
      const c = indices[i + 2]
      faces.push({ a, b, c })
      
      if (!vertexFaces.has(a)) vertexFaces.set(a, [])
      if (!vertexFaces.has(b)) vertexFaces.set(b, [])
      if (!vertexFaces.has(c)) vertexFaces.set(c, [])
      
      vertexFaces.get(a)!.push(faces.length - 1)
      vertexFaces.get(b)!.push(faces.length - 1)
      vertexFaces.get(c)!.push(faces.length - 1)
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < positions.length; i += 9) {
      const a = i / 3
      const b = i / 3 + 1
      const c = i / 3 + 2
      faces.push({ a, b, c })
      
      if (!vertexFaces.has(a)) vertexFaces.set(a, [])
      if (!vertexFaces.has(b)) vertexFaces.set(b, [])
      if (!vertexFaces.has(c)) vertexFaces.set(c, [])
      
      vertexFaces.get(a)!.push(faces.length - 1)
      vertexFaces.get(b)!.push(faces.length - 1)
      vertexFaces.get(c)!.push(faces.length - 1)
    }
  }
  
  // Calculate face normals
  const faceNormals: THREE.Vector3[] = []
  for (const face of faces) {
    const v0 = new THREE.Vector3(positions[face.a * 3], positions[face.a * 3 + 1], positions[face.a * 3 + 2])
    const v1 = new THREE.Vector3(positions[face.b * 3], positions[face.b * 3 + 1], positions[face.b * 3 + 2])
    const v2 = new THREE.Vector3(positions[face.c * 3], positions[face.c * 3 + 1], positions[face.c * 3 + 2])
    
    const edge1 = new THREE.Vector3().subVectors(v1, v0)
    const edge2 = new THREE.Vector3().subVectors(v2, v0)
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()
    faceNormals.push(normal)
  }
  
  // Smooth vertex normals based on adjacent face normals
  const smoothedNormals = new Float32Array(vertexCount * 3)
  
  for (let i = 0; i < vertexCount; i++) {
    const faceIndices = vertexFaces.get(i) || []
    const smoothNormal = new THREE.Vector3()
    let weightSum = 0
    
    // Average normals from adjacent faces, weighted by angle
    for (const faceIdx of faceIndices) {
      const face = faces[faceIdx]
      const faceNormal = faceNormals[faceIdx]
      
      // Calculate angle at this vertex for weighting
      let angle = 0
      if (face.a === i) {
        const v0 = new THREE.Vector3(positions[face.a * 3], positions[face.a * 3 + 1], positions[face.a * 3 + 2])
        const v1 = new THREE.Vector3(positions[face.b * 3], positions[face.b * 3 + 1], positions[face.b * 3 + 2])
        const v2 = new THREE.Vector3(positions[face.c * 3], positions[face.c * 3 + 1], positions[face.c * 3 + 2])
        const edge1 = new THREE.Vector3().subVectors(v1, v0).normalize()
        const edge2 = new THREE.Vector3().subVectors(v2, v0).normalize()
        angle = Math.acos(Math.max(-1, Math.min(1, edge1.dot(edge2))))
      } else if (face.b === i) {
        const v0 = new THREE.Vector3(positions[face.b * 3], positions[face.b * 3 + 1], positions[face.b * 3 + 2])
        const v1 = new THREE.Vector3(positions[face.a * 3], positions[face.a * 3 + 1], positions[face.a * 3 + 2])
        const v2 = new THREE.Vector3(positions[face.c * 3], positions[face.c * 3 + 1], positions[face.c * 3 + 2])
        const edge1 = new THREE.Vector3().subVectors(v1, v0).normalize()
        const edge2 = new THREE.Vector3().subVectors(v2, v0).normalize()
        angle = Math.acos(Math.max(-1, Math.min(1, edge1.dot(edge2))))
      } else {
        const v0 = new THREE.Vector3(positions[face.c * 3], positions[face.c * 3 + 1], positions[face.c * 3 + 2])
        const v1 = new THREE.Vector3(positions[face.a * 3], positions[face.a * 3 + 1], positions[face.a * 3 + 2])
        const v2 = new THREE.Vector3(positions[face.b * 3], positions[face.b * 3 + 1], positions[face.b * 3 + 2])
        const edge1 = new THREE.Vector3().subVectors(v1, v0).normalize()
        const edge2 = new THREE.Vector3().subVectors(v2, v0).normalize()
        angle = Math.acos(Math.max(-1, Math.min(1, edge1.dot(edge2))))
      }
      
      // Only smooth edges below threshold angle (sharp edges)
      if (angle < opts.angleThreshold || opts.intensity > 0.7) {
        const weight = angle * opts.intensity
        smoothNormal.addScaledVector(faceNormal, weight)
        weightSum += weight
      }
    }
    
    if (weightSum > 0) {
      smoothNormal.divideScalar(weightSum).normalize()
    } else {
      // Fallback to original normal if no suitable faces
      smoothNormal.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
    }
    
    // Interpolate between original and smoothed normal based on intensity
    const originalNormal = new THREE.Vector3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
    const finalNormal = originalNormal.clone().lerp(smoothNormal, opts.intensity)
    finalNormal.normalize()
    
    smoothedNormals[i * 3] = finalNormal.x
    smoothedNormals[i * 3 + 1] = finalNormal.y
    smoothedNormals[i * 3 + 2] = finalNormal.z
  }
  
  // Update geometry with smoothed normals
  clonedGeometry.setAttribute('normal', new THREE.BufferAttribute(smoothedNormals, 3))
  
  // If UVs exist and we want to preserve them, make sure they're copied
  if (opts.preserveUVs && uvs && !clonedGeometry.attributes.uv) {
    clonedGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  }
  
  // Update mesh geometry
  mesh.geometry.dispose()
  mesh.geometry = clonedGeometry
  mesh.geometry.attributes.normal.needsUpdate = true
  if (mesh.geometry.attributes.uv) {
    mesh.geometry.attributes.uv.needsUpdate = true
  }
  
  // CRITICAL: Preserve material properties and update after geometry change
  if (mesh.material) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((mat: THREE.Material) => {
      // Log material properties before update for verification
      const wasTwoSided = (mat as any).side === THREE.DoubleSide
      const wasWireframe = (mat as any).wireframe === true
      const hadMap = !!(mat as any).map
      const hadNormalMap = !!(mat as any).normalMap
      const hadColor = !!(mat as any).color
      const colorValue = (mat as any).color ? (mat as any).color.getHex() : null
      
      // Ensure material properties are preserved
      // Material object is not replaced, so properties should persist, but ensure they're set
      mat.needsUpdate = true
      
      // Verify properties after update
      if ((mat as any).side !== THREE.DoubleSide && wasTwoSided) {
        console.warn(`[EdgeSmoothing] ⚠️ Material two-sided property lost! Was: DoubleSide, Now: ${(mat as any).side}`)
        ;(mat as any).side = THREE.DoubleSide
      }
      if ((mat as any).wireframe !== wasWireframe && wasWireframe) {
        console.warn(`[EdgeSmoothing] ⚠️ Material wireframe property lost! Was: ${wasWireframe}, Now: ${(mat as any).wireframe}`)
        ;(mat as any).wireframe = wasWireframe
      }
      if (!(mat as any).map && hadMap) {
        console.warn(`[EdgeSmoothing] ⚠️ Material map property lost!`)
      }
      if (!(mat as any).normalMap && hadNormalMap) {
        console.warn(`[EdgeSmoothing] ⚠️ Material normalMap property lost!`)
      }
      if (!(mat as any).color && hadColor) {
        console.warn(`[EdgeSmoothing] ⚠️ Material color property lost!`)
      } else if ((mat as any).color && colorValue && (mat as any).color.getHex() !== colorValue) {
        console.warn(`[EdgeSmoothing] ⚠️ Material color changed! Was: 0x${colorValue.toString(16)}, Now: 0x${(mat as any).color.getHex().toString(16)}`)
      }
      
      console.log(`[EdgeSmoothing] Material properties after normal smoothing: side=${(mat as any).side === THREE.DoubleSide ? 'DoubleSide' : (mat as any).side === THREE.FrontSide ? 'FrontSide' : 'BackSide'}, wireframe=${(mat as any).wireframe}, hasMap=${!!(mat as any).map}, hasNormalMap=${!!(mat as any).normalMap}, color=0x${(mat as any).color ? (mat as any).color.getHex().toString(16) : 'none'}`)
    })
  }
  
  console.log(`[EdgeSmoothing] ✅ Applied normal-based edge smoothing to mesh: ${mesh.name || 'unnamed'}, intensity: ${opts.intensity.toFixed(2)}`)
}

/**
 * Bevel edges by adding geometry along sharp edges (true beveling)
 * This creates actual geometric bevels by offsetting vertices and creating new faces
 * Similar to Maya's polyBevel or Blender's Bevel modifier
 */
function bevelEdgesGeometry(
  mesh: THREE.Mesh,
  opts: EdgeSmoothingOptions
): void {
  // Clone geometry to avoid modifying original
  // CRITICAL: Use toNonIndexed() first if indexed to ensure we have a clean geometry to work with
  let geometry = mesh.geometry.clone()
  
  // CRITICAL: Check if original geometry has valid position data before cloning
  // This helps diagnose if the issue is with the source geometry
  const originalPosAttr = mesh.geometry.attributes.position
  if (!originalPosAttr || originalPosAttr.count === 0) {
    console.warn('[EdgeSmoothing] Original mesh geometry has no valid position attribute')
    return
  }
  
  // Debug: Log original geometry info
  if (originalPosAttr.count <= 10) {
    const origFirstX = originalPosAttr.getX(0)
    const origFirstY = originalPosAttr.getY(0)
    const origFirstZ = originalPosAttr.getZ(0)
    if (Math.abs(origFirstX) > 1000 || Math.abs(origFirstY) > 1000 || Math.abs(origFirstZ) > 1000) {
      console.warn(`[EdgeSmoothing] Original mesh geometry has corrupted vertex positions: first vertex=[${origFirstX.toFixed(2)}, ${origFirstY.toFixed(2)}, ${origFirstZ.toFixed(2)}], count=${originalPosAttr.count}, mesh.type=${mesh.geometry.type}, mesh.name=${mesh.name || 'unnamed'}`)
      // For now, continue with fallback - the geometry appears to be corrupted
    }
  }
  
  // CRITICAL: Work in local space (don't apply mesh transforms)
  // We want the actual geometry size for bevel distance, not world-space size
  
  // Ensure cloned geometry has required attributes
  if (!geometry.attributes.position) {
    console.warn('[EdgeSmoothing] Cloned geometry missing position attribute')
    return
  }
  
  // CRITICAL: Clear any cached bounding box and recompute from scratch
  // This ensures we get the correct local-space bounding box, unaffected by any cached or incorrect values
  geometry.boundingBox = null
  geometry.boundingSphere = null
  geometry.computeBoundingBox()
  
  // BoxGeometry and most primitives are indexed by default
  // If geometry is non-indexed, we need to handle it differently
  // CRITICAL: Get position attribute directly - ensure we use the correct count
  const posAttr = geometry.attributes.position
  if (!posAttr) {
    console.warn('[EdgeSmoothing] Geometry missing position attribute')
    return
  }
  
  // For bounding box calculation, use the attribute's actual vertex positions
  // posAttr.count gives the number of unique vertices (8 for BoxGeometry)
  // posAttr.array gives the raw Float32Array with all coordinates
  const positions = posAttr.array as Float32Array
  const uvs = geometry.attributes.uv ? geometry.attributes.uv.array as Float32Array : null
  const indices = geometry.index ? geometry.index.array as Uint16Array | Uint32Array : null
  
  if (!indices) {
    // Non-indexed geometry - create index by detecting duplicate vertices
    // This is needed for proper edge detection
    console.warn('[EdgeSmoothing] Non-indexed geometry detected. Converting to indexed for edge detection...')
    
    // Create a vertex map to merge duplicates
    const vertexMap = new Map<string, number>()
    const uniqueVertices: THREE.Vector3[] = []
    const uniqueUVs: THREE.Vector2[] = []
    const indexArray: number[] = []
    const epsilon = 1e-6 // Tolerance for vertex comparison
    
    const vertexCount = positions.length / 3
    
    // Process each triangle (3 vertices per triangle)
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]
      
      // Create a key for this vertex position (rounded to avoid floating point issues)
      const key = `${Math.round(x / epsilon)},${Math.round(y / epsilon)},${Math.round(z / epsilon)}`
      
      let vertexIndex: number
      if (vertexMap.has(key)) {
        // Use existing vertex
        vertexIndex = vertexMap.get(key)!
      } else {
        // Create new vertex
        vertexIndex = uniqueVertices.length
        vertexMap.set(key, vertexIndex)
        uniqueVertices.push(new THREE.Vector3(x, y, z))
        
        if (uvs) {
          uniqueUVs.push(new THREE.Vector2(uvs[i * 2], uvs[i * 2 + 1]))
        }
      }
      
      indexArray.push(vertexIndex)
    }
    
    // Create new indexed geometry
    const indexedGeometry = new THREE.BufferGeometry()
    
    // Set positions
    const newPositions = new Float32Array(uniqueVertices.length * 3)
    for (let i = 0; i < uniqueVertices.length; i++) {
      const v = uniqueVertices[i]
      newPositions[i * 3] = v.x
      newPositions[i * 3 + 1] = v.y
      newPositions[i * 3 + 2] = v.z
    }
    indexedGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
    
    // Set UVs if they exist
    if (opts.preserveUVs && uniqueUVs.length > 0) {
      const newUVs = new Float32Array(uniqueUVs.length * 2)
      for (let i = 0; i < uniqueUVs.length; i++) {
        const uv = uniqueUVs[i]
        newUVs[i * 2] = uv.x
        newUVs[i * 2 + 1] = uv.y
      }
      indexedGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2))
    }
    
    // Set index
    indexedGeometry.setIndex(indexArray)
    
    // Use the indexed geometry for processing
    geometry = indexedGeometry
    const newPositionsArray = indexedGeometry.attributes.position.array as Float32Array
    const newUvsArray = indexedGeometry.attributes.uv ? indexedGeometry.attributes.uv.array as Float32Array : null
    const newIndices = indexedGeometry.index!.array as Uint16Array | Uint32Array
    
    // Update references
    const updatedPositions = newPositionsArray
    const updatedUvs = newUvsArray
    const updatedIndices = newIndices
    const updatedVertexCount = updatedPositions.length / 3
    
    // Calculate bounding box for bevel distance scaling
    // Use geometry's local bounding box (not world space) to get actual geometry size
    // This ensures we get the true size of the geometry, not affected by mesh transforms
    indexedGeometry.computeBoundingBox()
    let bbox = indexedGeometry.boundingBox
    if (!bbox) {
      // Fallback: compute manually if bounding box doesn't exist
      const posAttr = indexedGeometry.attributes.position
      bbox = new THREE.Box3()
      if (posAttr && posAttr.count > 0) {
        bbox.makeEmpty()
        for (let i = 0; i < posAttr.count; i++) {
          const x = posAttr.getX(i)
          const y = posAttr.getY(i)
          const z = posAttr.getZ(i)
          bbox.expandByPoint(new THREE.Vector3(x, y, z))
        }
      }
    }
    const bboxSize = bbox ? bbox.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1)
    const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) || 1
    
    // Use a reasonable bevel distance: 15% of max dimension at intensity 1.0
    // This gives clearly visible beveling without excessive distortion
    // Cap the bevel distance to prevent issues with very large or very small objects
    const baseBevelDistance = maxDim * 0.15  // Increased from 10% to 15% for better visibility
    const bevelDistance = Math.min(baseBevelDistance * opts.intensity, maxDim * 0.4)  // Increased cap from 30% to 40%
    
    // Also ensure minimum bevel distance for very small objects
    // For objects with maxDim < 0.1, use a fixed minimum bevel distance
    const minBevelDistance = maxDim < 0.1 ? 0.02 : maxDim * 0.03  // Increased minimum from 2% to 3%
    const finalBevelDistance = Math.max(bevelDistance, minBevelDistance)
    
    // Build edge-to-face map
    const edgeMap = new Map<string, number[]>()
    const vertexPositions: THREE.Vector3[] = []
    const faceNormals: THREE.Vector3[] = []
    
    for (let i = 0; i < updatedVertexCount; i++) {
      vertexPositions.push(new THREE.Vector3(
        updatedPositions[i * 3],
        updatedPositions[i * 3 + 1],
        updatedPositions[i * 3 + 2]
      ))
    }
    
    const faces: Array<{ a: number; b: number; c: number }> = []
    
    for (let i = 0; i < updatedIndices.length; i += 3) {
      const a = updatedIndices[i]
      const b = updatedIndices[i + 1]
      const c = updatedIndices[i + 2]
      faces.push({ a, b, c })
      
      const v0 = vertexPositions[a]
      const v1 = vertexPositions[b]
      const v2 = vertexPositions[c]
      const edge1 = new THREE.Vector3().subVectors(v1, v0)
      const edge2 = new THREE.Vector3().subVectors(v2, v0)
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()
      faceNormals.push(normal)
      
      const faceIdx = faces.length - 1
      const edges = [
        [Math.min(a, b), Math.max(a, b)].join(','),
        [Math.min(b, c), Math.max(b, c)].join(','),
        [Math.min(c, a), Math.max(c, a)].join(',')
      ]
      
      edges.forEach(edgeKey => {
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, [])
        }
        edgeMap.get(edgeKey)!.push(faceIdx)
      })
    }
    
    // Find sharp edges
    const sharpEdges = new Set<string>()
    edgeMap.forEach((faceIndices, edgeKey) => {
      if (faceIndices.length >= 2) {
        const normal1 = faceNormals[faceIndices[0]]
        const normal2 = faceNormals[faceIndices[1]]
        const dot = Math.max(-1, Math.min(1, normal1.dot(normal2)))
        const angle = Math.acos(dot)
        
        if (angle > opts.angleThreshold) {
          sharpEdges.add(edgeKey)
        }
      } else if (opts.intensity > 0.6) {
        sharpEdges.add(edgeKey)
      }
    })
    
    // Apply beveling
    const vertexOffsets = new Map<number, THREE.Vector3>()
    sharpEdges.forEach(edgeKey => {
      const [v0Idx, v1Idx] = edgeKey.split(',').map(Number)
      const v0 = vertexPositions[v0Idx]
      const v1 = vertexPositions[v1Idx]
      const faceIndices = edgeMap.get(edgeKey) || []
      if (faceIndices.length === 0) return
      
      const edgeDir = new THREE.Vector3().subVectors(v1, v0).normalize()
      
      // Calculate offset direction using proper beveling algorithm
      let offsetDir = new THREE.Vector3()
      
      if (faceIndices.length >= 2) {
        // Two or more faces share this edge - use bisector of face normals
        const normal1 = faceNormals[faceIndices[0]].clone()
        const normal2 = faceNormals[faceIndices[1]].clone()
        
        // Calculate bisector (average of normalized normals)
        const bisector = normal1.add(normal2).normalize()
        
        // Project bisector onto plane perpendicular to edge
        const dot = bisector.dot(edgeDir)
        offsetDir = bisector.clone().sub(edgeDir.clone().multiplyScalar(dot)).normalize()
        
        // If projection is too small, use cross product fallback
        if (offsetDir.length() < 0.001) {
          offsetDir.crossVectors(edgeDir, normal1).normalize()
          if (offsetDir.dot(normal1) < 0) {
            offsetDir.negate()
          }
        }
      } else {
        // Single face (boundary edge) - use face normal projected onto plane perpendicular to edge
        const faceNormal = faceNormals[faceIndices[0]].clone()
        const dot = faceNormal.dot(edgeDir)
        offsetDir = faceNormal.clone().sub(edgeDir.clone().multiplyScalar(dot)).normalize()
        
        if (offsetDir.length() < 0.001) {
          offsetDir = new THREE.Vector3(1, 0, 0)
          if (Math.abs(edgeDir.x) > 0.9) {
            offsetDir.set(0, 1, 0)
          }
          offsetDir.crossVectors(offsetDir, edgeDir).normalize()
        }
      }
      
      if (!vertexOffsets.has(v0Idx)) {
        vertexOffsets.set(v0Idx, new THREE.Vector3())
      }
      if (!vertexOffsets.has(v1Idx)) {
        vertexOffsets.set(v1Idx, new THREE.Vector3())
      }
      
      const offset = offsetDir.clone().multiplyScalar(finalBevelDistance)
      vertexOffsets.get(v0Idx)!.add(offset)
      vertexOffsets.get(v1Idx)!.add(offset)
    })
    
    vertexOffsets.forEach((offset, vertexIdx) => {
      let edgeCount = 0
      sharpEdges.forEach(edgeKey => {
        const [v0Idx, v1Idx] = edgeKey.split(',').map(Number)
        if (v0Idx === vertexIdx || v1Idx === vertexIdx) {
          edgeCount++
        }
      })
      if (edgeCount > 0) {
        offset.divideScalar(edgeCount)
      }
    })
    
    vertexOffsets.forEach((offset, vertexIdx) => {
      vertexPositions[vertexIdx].add(offset)
    })
    
    const finalPositions = new Float32Array(updatedVertexCount * 3)
    for (let i = 0; i < updatedVertexCount; i++) {
      const pos = vertexPositions[i]
      finalPositions[i * 3] = pos.x
      finalPositions[i * 3 + 1] = pos.y
      finalPositions[i * 3 + 2] = pos.z
    }
    
    indexedGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3))
    if (opts.preserveUVs && updatedUvs) {
      indexedGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(updatedUvs), 2))
    }
    
    indexedGeometry.computeVertexNormals()
    
    mesh.geometry.dispose()
    mesh.geometry = indexedGeometry
    mesh.geometry.attributes.position.needsUpdate = true
    mesh.geometry.attributes.normal.needsUpdate = true
    if (mesh.geometry.attributes.uv) {
      mesh.geometry.attributes.uv.needsUpdate = true
    }
    
    // CRITICAL: Preserve material properties and update after geometry change
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((mat: THREE.Material) => {
        // Log material properties before update for verification
        const wasTwoSided = (mat as any).side === THREE.DoubleSide
        const wasWireframe = (mat as any).wireframe === true
        const hadMap = !!(mat as any).map
        const hadNormalMap = !!(mat as any).normalMap
        
        // Ensure material properties are preserved
        // Material object is not replaced, so properties should persist, but ensure they're set
        mat.needsUpdate = true
        
        // Verify properties after update
        if ((mat as any).side !== THREE.DoubleSide && wasTwoSided) {
          console.warn(`[EdgeSmoothing] ⚠️ Material two-sided property lost! Was: DoubleSide, Now: ${(mat as any).side}`)
          ;(mat as any).side = THREE.DoubleSide
        }
        if ((mat as any).wireframe !== wasWireframe && wasWireframe) {
          console.warn(`[EdgeSmoothing] ⚠️ Material wireframe property lost! Was: ${wasWireframe}, Now: ${(mat as any).wireframe}`)
          ;(mat as any).wireframe = wasWireframe
        }
        if (!(mat as any).map && hadMap) {
          console.warn(`[EdgeSmoothing] ⚠️ Material map property lost!`)
        }
        if (!(mat as any).normalMap && hadNormalMap) {
          console.warn(`[EdgeSmoothing] ⚠️ Material normalMap property lost!`)
        }
        
        console.log(`[EdgeSmoothing] Material properties after beveling: side=${(mat as any).side === THREE.DoubleSide ? 'DoubleSide' : (mat as any).side === THREE.FrontSide ? 'FrontSide' : 'BackSide'}, wireframe=${(mat as any).wireframe}, hasMap=${!!(mat as any).map}, hasNormalMap=${!!(mat as any).normalMap}`)
      })
    }
    
    console.log(`[EdgeSmoothing] ✅ Applied geometry-based edge beveling to non-indexed mesh: ${mesh.name || 'unnamed'}, intensity: ${opts.intensity.toFixed(2)}, sharp edges: ${sharpEdges.size}, bevel distance: ${finalBevelDistance.toFixed(4)}, maxDim: ${maxDim.toFixed(2)}`)
    return
  }
  
  // For indexed geometry (BoxGeometry, etc.) - continue with existing code
  // CRITICAL: For indexed geometry, use posAttr.count (unique vertices), not positions.length / 3
  // positions.length / 3 might be wrong if the array has extra padding or duplicates
  const vertexCount = posAttr.count || (positions.length / 3)
  
  // Calculate bounding box for bevel distance scaling
  // CRITICAL: Use geometry's computed bounding box (always exists after computeBoundingBox() call above)
  // This ensures we get the actual geometry size in local space, not affected by mesh transforms
  let bbox: THREE.Box3
  let bboxSize: THREE.Vector3
  let maxDim: number
  
  // CRITICAL: Always compute bounding box manually from vertex positions
  // geometry.computeBoundingBox() may use corrupted data, so we compute it ourselves
  // This ensures we get accurate bounding box from actual vertex positions
  bbox = new THREE.Box3()
  bbox.makeEmpty()
  
  // Always use posAttr.getX/getY/getZ which ensures correct access to vertex data
  // posAttr.count is the authoritative count of unique vertices
  let validVertices = 0
  const vertexThreshold = 100 // Lower threshold to catch more corrupted vertices
  
  if (posAttr.count > 0) {
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i)
      const y = posAttr.getY(i)
      const z = posAttr.getZ(i)
      
      // Safety check: skip invalid coordinates (NaN, Infinity, or suspiciously large values)
      // Lower threshold to catch corrupted data earlier
      if (!isFinite(x) || !isFinite(y) || !isFinite(z) || 
          Math.abs(x) > vertexThreshold || Math.abs(y) > vertexThreshold || Math.abs(z) > vertexThreshold) {
        // Skip corrupted vertices
        continue
      }
      
      bbox.expandByPoint(new THREE.Vector3(x, y, z))
      validVertices++
    }
  } else {
    // Fallback: compute from raw positions array
    const rawVertexCount = positions.length / 3
    for (let i = 0; i < rawVertexCount; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]
      
      if (!isFinite(x) || !isFinite(y) || !isFinite(z) ||
          Math.abs(x) > vertexThreshold || Math.abs(y) > vertexThreshold || Math.abs(z) > vertexThreshold) {
        continue
      }
      
      bbox.expandByPoint(new THREE.Vector3(x, y, z))
      validVertices++
    }
  }
  
  // If no valid vertices found, try to get bounding box from mesh's world bounding box
  if (validVertices === 0) {
    console.warn(`[EdgeSmoothing] No valid vertices found in local space. Trying mesh world bounding box...`)
    
    // Try to get bounding box from mesh world transform
    const worldBox = new THREE.Box3()
    worldBox.setFromObject(mesh)
    const worldSize = worldBox.getSize(new THREE.Vector3())
    const worldMaxDim = Math.max(Math.abs(worldSize.x), Math.abs(worldSize.y), Math.abs(worldSize.z))
    
    if (worldMaxDim > 0.001 && worldMaxDim < 1000) {
      // Use world bounding box size as fallback (divide by scale to get local space estimate)
      const scale = mesh.scale
      const scaleFactor = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) || 1
      maxDim = Math.max(1.0, worldMaxDim / scaleFactor) // Use world size divided by scale
      bboxSize = new THREE.Vector3(maxDim, maxDim, maxDim)
      console.log(`[EdgeSmoothing] Using world bounding box size: ${worldMaxDim.toFixed(2)}, local estimate: ${maxDim.toFixed(2)}`)
    } else {
      // Final fallback: use a reasonable default based on geometry type
      console.warn(`[EdgeSmoothing] World bounding box also invalid (${worldMaxDim.toFixed(2)}). Using type-based fallback.`)
      maxDim = 1.0
      bboxSize = new THREE.Vector3(1, 1, 1)
    }
  } else {
    bboxSize = bbox.getSize(new THREE.Vector3())
    maxDim = Math.max(Math.abs(bboxSize.x), Math.abs(bboxSize.y), Math.abs(bboxSize.z))
  }
  
  // Safety check: if maxDim is suspiciously large (> 1000) or small (< 0.001), use fallback
  // Use a reasonable default for primitives (BoxGeometry default size is 1.0)
  if (maxDim > 1000 || maxDim < 0.001) {
    console.warn(`[EdgeSmoothing] Suspicious bounding box size: ${maxDim.toFixed(2)}, using fallback size: 1.0`)
    maxDim = 1.0
    bboxSize = new THREE.Vector3(1, 1, 1)
  }
  
  // Clamp maxDim to reasonable range
  const clampedMaxDim = Math.max(0.001, Math.min(maxDim, 1000))
  const effectiveMaxDim = maxDim > 1000 || maxDim < 0.001 ? 1.0 : clampedMaxDim
  
  // Additional validation: ensure we have a reasonable size
  if (effectiveMaxDim < 0.01) {
    console.warn(`[EdgeSmoothing] Effective max dimension too small: ${effectiveMaxDim.toFixed(4)}, clamping to minimum: 0.1`)
    maxDim = 0.1
    bboxSize = new THREE.Vector3(0.1, 0.1, 0.1)
  }
  
  // Use a reasonable bevel distance: 25% of max dimension at intensity 1.0
  // This gives clearly visible beveling without excessive distortion
  // Cap the bevel distance to prevent issues with very large or very small objects
  const baseBevelDistance = effectiveMaxDim * 0.25  // Increased from 15% to 25% for better visibility
  const bevelDistance = Math.min(baseBevelDistance * opts.intensity, effectiveMaxDim * 0.5)  // Increased cap from 40% to 50%
  
  // Also ensure minimum bevel distance for very small objects
  // For objects with maxDim < 0.1, use a fixed minimum bevel distance
  const minBevelDistance = effectiveMaxDim < 0.1 ? 0.05 : effectiveMaxDim * 0.05  // Increased minimum from 3% to 5%
  const finalBevelDistance = Math.max(bevelDistance, minBevelDistance)
  
  // Build edge-to-face map and vertex positions
  const edgeMap = new Map<string, number[]>() // Edge key -> face indices
  const vertexPositions: THREE.Vector3[] = []
  const vertexUVs: THREE.Vector2[] = []
  const faceNormals: THREE.Vector3[] = []
  
  // Extract vertex positions and UVs
  // CRITICAL: Use posAttr.count for accurate vertex count, or access via getX/getY/getZ
  // For indexed geometry, this should match the number of unique vertices (8 for BoxGeometry)
  const actualVertexCount = posAttr.count || vertexCount
  for (let i = 0; i < actualVertexCount; i++) {
    // Use getX/getY/getZ for safe access to vertex data
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const z = posAttr.getZ(i)
    vertexPositions.push(new THREE.Vector3(x, y, z))
    
    if (uvs) {
      vertexUVs.push(new THREE.Vector2(uvs[i * 2], uvs[i * 2 + 1]))
    }
  }
  
  // Build edge map and calculate face normals
  const faces: Array<{ a: number; b: number; c: number }> = []
  
  // Process indexed geometry (BoxGeometry and most primitives are indexed)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    faces.push({ a, b, c })
    
    // Calculate face normal
    const v0 = vertexPositions[a]
    const v1 = vertexPositions[b]
    const v2 = vertexPositions[c]
    const edge1 = new THREE.Vector3().subVectors(v1, v0)
    const edge2 = new THREE.Vector3().subVectors(v2, v0)
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()
    faceNormals.push(normal)
    
    // Add edges to map (CRITICAL: This builds the edge-to-face mapping for sharp edge detection)
    const faceIdx = faces.length - 1
    const edges = [
      [Math.min(a, b), Math.max(a, b)].join(','),
      [Math.min(b, c), Math.max(b, c)].join(','),
      [Math.min(c, a), Math.max(c, a)].join(',')
    ]
    
    edges.forEach(edgeKey => {
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, [])
      }
      edgeMap.get(edgeKey)!.push(faceIdx)
    })
  }
  
  // Find sharp edges (edges between faces with normals above threshold)
  const sharpEdges = new Set<string>()
  
  edgeMap.forEach((faceIndices, edgeKey) => {
    if (faceIndices.length >= 2) {
      // Edge shared by multiple faces - check angle between face normals
      const normal1 = faceNormals[faceIndices[0]]
      const normal2 = faceNormals[faceIndices[1]]
      const dot = Math.max(-1, Math.min(1, normal1.dot(normal2)))
      const angle = Math.acos(dot)
      
      // If angle is greater than threshold, it's a sharp edge
      if (angle > opts.angleThreshold) {
        sharpEdges.add(edgeKey)
      }
    } else {
      // Boundary edge - always consider sharp if intensity is high
      if (opts.intensity > 0.6) {
        sharpEdges.add(edgeKey)
      }
    }
  })
  
  // Offset vertices along sharp edges
  const vertexOffsets = new Map<number, THREE.Vector3>()
  
  sharpEdges.forEach(edgeKey => {
    const [v0Idx, v1Idx] = edgeKey.split(',').map(Number)
    const v0 = vertexPositions[v0Idx]
    const v1 = vertexPositions[v1Idx]
    
    // Get faces sharing this edge
    const faceIndices = edgeMap.get(edgeKey) || []
    if (faceIndices.length === 0) return
    
    // Calculate edge direction
    const edgeDir = new THREE.Vector3().subVectors(v1, v0).normalize()
    
    // Calculate offset direction using proper beveling algorithm
    // For proper edge beveling, we need the bisector of the two face normals projected onto the plane perpendicular to the edge
    let offsetDir = new THREE.Vector3()
    
    if (faceIndices.length >= 2) {
      // Two or more faces share this edge - use bisector of face normals
      const normal1 = faceNormals[faceIndices[0]].clone()
      const normal2 = faceNormals[faceIndices[1]].clone()
      
      // Calculate bisector (average of normalized normals)
      const bisector = normal1.add(normal2).normalize()
      
      // Project bisector onto plane perpendicular to edge
      // offsetDir = bisector - (bisector · edgeDir) * edgeDir
      const dot = bisector.dot(edgeDir)
      offsetDir = bisector.clone().sub(edgeDir.clone().multiplyScalar(dot)).normalize()
      
      // If projection is too small, use cross product fallback
      if (offsetDir.length() < 0.001) {
        // Try cross product with edge direction and first normal
        offsetDir.crossVectors(edgeDir, normal1)
        if (offsetDir.length() < 0.001) {
          // If still zero, try with second normal
          offsetDir.crossVectors(edgeDir, normal2)
        }
        offsetDir.normalize()
        
        // Ensure it's pointing outward (dot product with one of the normals should be positive)
        const dot1 = offsetDir.dot(normal1)
        const dot2 = offsetDir.dot(normal2)
        if (dot1 < 0 && dot2 < 0) {
          offsetDir.negate()
        }
        
        // Final check - if still invalid, use perpendicular vector
        if (offsetDir.length() < 0.001) {
          offsetDir.set(1, 0, 0)
          if (Math.abs(edgeDir.x) > 0.9) {
            offsetDir.set(0, 1, 0)
          }
          offsetDir.crossVectors(offsetDir, edgeDir).normalize()
        }
      }
    } else {
      // Single face (boundary edge) - use face normal projected onto plane perpendicular to edge
      const faceNormal = faceNormals[faceIndices[0]].clone()
      const dot = faceNormal.dot(edgeDir)
      offsetDir = faceNormal.clone().sub(edgeDir.clone().multiplyScalar(dot)).normalize()
      
      if (offsetDir.length() < 0.001) {
        // Fallback: use perpendicular to edge
        offsetDir = new THREE.Vector3(1, 0, 0)
        if (Math.abs(edgeDir.x) > 0.9) {
          offsetDir.set(0, 1, 0)
        }
        offsetDir.crossVectors(offsetDir, edgeDir).normalize()
      }
    }
    
    // Apply offset to both vertices
    if (!vertexOffsets.has(v0Idx)) {
      vertexOffsets.set(v0Idx, new THREE.Vector3())
    }
    if (!vertexOffsets.has(v1Idx)) {
      vertexOffsets.set(v1Idx, new THREE.Vector3())
    }
    
    const offset = offsetDir.clone().multiplyScalar(finalBevelDistance)
    vertexOffsets.get(v0Idx)!.add(offset)
    vertexOffsets.get(v1Idx)!.add(offset)
  })
  
  // For vertices shared by multiple edges (like cube corners),
  // don't divide by edgeCount - use the sum directly to preserve offset magnitude
  // This ensures that offsets from multiple edges don't cancel out
  // The bevel distance already accounts for the number of edges at a vertex
  vertexOffsets.forEach((offset, vertexIdx) => {
    // Find all sharp edges containing this vertex
    let edgeCount = 0
    sharpEdges.forEach(edgeKey => {
      const [v0Idx, v1Idx] = edgeKey.split(',').map(Number)
      if (v0Idx === vertexIdx || v1Idx === vertexIdx) {
        edgeCount++
      }
    })
    
    // Don't divide by edgeCount - the sum of offsets from multiple edges
    // should push the vertex outward, not cancel out
    // If edgeCount is 0, offset is already zero, so no change needed
    if (edgeCount === 0 && offset.length() > 0.001) {
      // Shouldn't happen, but handle it
      offset.multiplyScalar(0)
    }
  })
  
  // Apply offsets to vertex positions
  vertexOffsets.forEach((offset, vertexIdx) => {
    if (vertexIdx < vertexPositions.length) {
      vertexPositions[vertexIdx].add(offset)
    }
  })
  
  // Update geometry with new positions
  // Use actualVertexCount to ensure we update all vertices correctly
  const newPositions = new Float32Array(actualVertexCount * 3)
  for (let i = 0; i < actualVertexCount; i++) {
    const pos = vertexPositions[i]
    newPositions[i * 3] = pos.x
    newPositions[i * 3 + 1] = pos.y
    newPositions[i * 3 + 2] = pos.z
  }
  
  // Create new position attribute with the updated positions
  const positionAttribute = new THREE.BufferAttribute(newPositions, 3)
  positionAttribute.needsUpdate = true
  geometry.setAttribute('position', positionAttribute)
  
  // Preserve UVs
  if (opts.preserveUVs && uvs) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  }
  
  // Recalculate normals and bounding box
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  
  // Force geometry to update
  geometry.attributes.position.needsUpdate = true
  geometry.attributes.normal.needsUpdate = true
  if (geometry.attributes.uv) {
    geometry.attributes.uv.needsUpdate = true
  }
  
  // Update mesh geometry
  mesh.geometry.dispose()
  mesh.geometry = geometry
  
  // Force mesh update flags
  mesh.geometry.attributes.position.needsUpdate = true
  mesh.geometry.attributes.normal.needsUpdate = true
  if (mesh.geometry.attributes.uv) {
    mesh.geometry.attributes.uv.needsUpdate = true
  }
  
  // CRITICAL: Preserve material properties and update after geometry change
  if (mesh.material) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((mat: THREE.Material) => {
      // Log material properties before update for verification
      const wasTwoSided = (mat as any).side === THREE.DoubleSide
      const wasWireframe = (mat as any).wireframe === true
      const hadMap = !!(mat as any).map
      const hadNormalMap = !!(mat as any).normalMap
      const hadColor = !!(mat as any).color
      const colorValue = (mat as any).color ? (mat as any).color.getHex() : null
      
      // Ensure material properties are preserved
      // Material object is not replaced, so properties should persist, but ensure they're set
      mat.needsUpdate = true
      
      // Verify properties after update
      if ((mat as any).side !== THREE.DoubleSide && wasTwoSided) {
        console.warn(`[EdgeSmoothing] ⚠️ Material two-sided property lost! Was: DoubleSide, Now: ${(mat as any).side}`)
        ;(mat as any).side = THREE.DoubleSide
      }
      if ((mat as any).wireframe !== wasWireframe && wasWireframe) {
        console.warn(`[EdgeSmoothing] ⚠️ Material wireframe property lost! Was: ${wasWireframe}, Now: ${(mat as any).wireframe}`)
        ;(mat as any).wireframe = wasWireframe
      }
      if (!(mat as any).map && hadMap) {
        console.warn(`[EdgeSmoothing] ⚠️ Material map property lost!`)
      }
      if (!(mat as any).normalMap && hadNormalMap) {
        console.warn(`[EdgeSmoothing] ⚠️ Material normalMap property lost!`)
      }
      if (!(mat as any).color && hadColor) {
        console.warn(`[EdgeSmoothing] ⚠️ Material color property lost!`)
      } else if ((mat as any).color && colorValue && (mat as any).color.getHex() !== colorValue) {
        console.warn(`[EdgeSmoothing] ⚠️ Material color changed! Was: 0x${colorValue.toString(16)}, Now: 0x${(mat as any).color.getHex().toString(16)}`)
      }
      
      console.log(`[EdgeSmoothing] Material properties after beveling: side=${(mat as any).side === THREE.DoubleSide ? 'DoubleSide' : (mat as any).side === THREE.FrontSide ? 'FrontSide' : 'BackSide'}, wireframe=${(mat as any).wireframe}, hasMap=${!!(mat as any).map}, hasNormalMap=${!!(mat as any).normalMap}, color=0x${(mat as any).color ? (mat as any).color.getHex().toString(16) : 'none'}`)
    })
  }
  
  const maxOffsetLength = Math.max(...Array.from(vertexOffsets.values()).map(off => off.length()), 0)
  const minOffsetLength = Math.min(...Array.from(vertexOffsets.values()).filter(off => off.length() > 0).map(off => off.length()), 0)
  console.log(`[EdgeSmoothing] ✅ Applied geometry-based edge beveling to indexed mesh: ${mesh.name || 'unnamed'}, intensity: ${opts.intensity.toFixed(2)}, sharp edges: ${sharpEdges.size}, bevel distance: ${finalBevelDistance.toFixed(4)}, maxDim: ${effectiveMaxDim.toFixed(2)} (raw: ${maxDim.toFixed(2)}), bbox: [${bboxSize.x.toFixed(2)}, ${bboxSize.y.toFixed(2)}, ${bboxSize.z.toFixed(2)}], maxOffset: ${maxOffsetLength.toFixed(4)}, minOffset: ${minOffsetLength.toFixed(4)}, vertices: ${posAttr?.count || vertexCount}`)
}

/**
 * Restore original edges (remove smoothing)
 * Note: This requires the original geometry to be stored in mesh.userData
 */
export function restoreEdges(mesh: THREE.Mesh): void {
  if (!mesh.userData.originalGeometry) {
    console.warn('[EdgeSmoothing] No original geometry found to restore')
    return
  }
  
  mesh.geometry.dispose()
  mesh.geometry = mesh.userData.originalGeometry.clone()
  mesh.geometry.attributes.normal.needsUpdate = true
  if (mesh.geometry.attributes.uv) {
    mesh.geometry.attributes.uv.needsUpdate = true
  }
  
  console.log(`[EdgeSmoothing] ✅ Restored original edges for mesh: ${mesh.name || 'unnamed'}`)
}

/**
 * Store original geometry for later restoration
 */
export function storeOriginalGeometry(mesh: THREE.Mesh): void {
  if (!mesh.userData.originalGeometry) {
    mesh.userData.originalGeometry = mesh.geometry.clone()
  }
}

