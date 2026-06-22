/**
 * Geometry Repair Utilities
 * Functions to fix common geometry issues like degenerate triangles
 */

import * as THREE from 'three'

export interface GeometryRepairResult {
  trianglesRemoved: number
  trianglesRemaining: number
  success: boolean
  error?: string
}

/**
 * Remove degenerate triangles from a geometry
 * 
 * Degenerate triangles include:
 * 1. Triangles with duplicate vertex indices (i0 === i1 || i1 === i2 || i0 === i2)
 * 2. Triangles with zero or near-zero area (collinear vertices)
 * 3. Triangles with out-of-bounds indices
 * 
 * Note: We remove rather than "fix" degenerate triangles because:
 * - Fixing duplicate vertices would require merging vertices, which is complex and might break other geometry
 * - Fixing zero-area triangles would require perturbing vertices, which changes the geometry
 * - Removing is safer and more predictable for downstream processing (like mesh simplification)
 * 
 * @param geometry - The geometry to repair
 * @param meshName - Optional mesh name for logging
 * @param minAreaEpsilon - Minimum triangle area threshold (default: 1e-10)
 * @returns A new geometry with degenerate triangles removed, or null if repair failed
 */
export function removeDegenerateTriangles(
  geometry: THREE.BufferGeometry,
  meshName?: string,
  minAreaEpsilon: number = 1e-10
): { geometry: THREE.BufferGeometry; result: GeometryRepairResult } | null {
  try {
    if (!geometry.index || !geometry.attributes.position) {
      return null
    }

    const originalIndices = geometry.index.array
    const originalIndexCount = originalIndices.length
    const vertexCount = geometry.attributes.position.count
    const positionArray = geometry.attributes.position.array

    if (originalIndexCount < 3) {
      return null
    }

    const originalTriangleCount = originalIndexCount / 3

    // Collect valid (non-degenerate) triangles
    const validIndices: number[] = []
    let degenerateCount = 0
    let duplicateVertexCount = 0
    let zeroAreaCount = 0
    let outOfBoundsCount = 0

    for (let i = 0; i < originalIndexCount; i += 3) {
      const i0 = originalIndices[i]
      const i1 = originalIndices[i + 1]
      const i2 = originalIndices[i + 2]

      // Check if indices are within bounds first
      if (i0 < 0 || i0 >= vertexCount || i1 < 0 || i1 >= vertexCount || i2 < 0 || i2 >= vertexCount) {
        degenerateCount++
        outOfBoundsCount++
        continue // Skip invalid indices
      }

      // Check if triangle is degenerate (has duplicate vertices)
      if (i0 === i1 || i1 === i2 || i0 === i2) {
        degenerateCount++
        duplicateVertexCount++
        continue // Skip this triangle
      }

      // Check for zero-area triangles (collinear vertices)
      // This uses the same logic as isTriangleDegenerate but inline for performance
      const x0 = positionArray[i0 * 3]
      const y0 = positionArray[i0 * 3 + 1]
      const z0 = positionArray[i0 * 3 + 2]

      const x1 = positionArray[i1 * 3]
      const y1 = positionArray[i1 * 3 + 1]
      const z1 = positionArray[i1 * 3 + 2]

      const x2 = positionArray[i2 * 3]
      const y2 = positionArray[i2 * 3 + 1]
      const z2 = positionArray[i2 * 3 + 2]

      // Calculate triangle area using cross product
      const v0x = x1 - x0
      const v0y = y1 - y0
      const v0z = z1 - z0

      const v1x = x2 - x0
      const v1y = y2 - y0
      const v1z = z2 - z0

      // Cross product: v0 × v1
      const crossX = v0y * v1z - v0z * v1y
      const crossY = v0z * v1x - v0x * v1z
      const crossZ = v0x * v1y - v0y * v1x

      // Area = 0.5 * |cross product|
      const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)

      if (area < minAreaEpsilon) {
        degenerateCount++
        zeroAreaCount++
        continue // Skip zero-area triangle
      }

      // Triangle is valid - add it
      validIndices.push(i0, i1, i2)
    }

    const validTriangleCount = validIndices.length / 3

    // If we removed all triangles, return null
    if (validTriangleCount < 1) {
      return null
    }

    // Create new geometry with cleaned indices
    const cleanedGeometry = geometry.clone()
    cleanedGeometry.setIndex(validIndices)

    // Recompute bounds
    cleanedGeometry.computeBoundingSphere()
    cleanedGeometry.computeBoundingBox()

    const result: GeometryRepairResult = {
      trianglesRemoved: degenerateCount,
      trianglesRemaining: validTriangleCount,
      success: true
    }

    if (degenerateCount > 0) {
      const breakdown: string[] = []
      if (duplicateVertexCount > 0) breakdown.push(`${duplicateVertexCount} duplicate-vertex`)
      if (zeroAreaCount > 0) breakdown.push(`${zeroAreaCount} zero-area`)
      if (outOfBoundsCount > 0) breakdown.push(`${outOfBoundsCount} out-of-bounds`)
      
      console.log(
        `[GeometryRepair] Removed ${degenerateCount} degenerate triangle(s) from "${meshName || 'unnamed'}" (${validTriangleCount} remaining)` +
        (breakdown.length > 0 ? ` - Breakdown: ${breakdown.join(', ')}` : '')
      )
    }

    return { geometry: cleanedGeometry, result }
  } catch (error: any) {
    console.warn(`[GeometryRepair] Failed to repair geometry for "${meshName || 'unnamed'}":`, error)
    return null
  }
}

/**
 * Check if a triangle is degenerate (has duplicate vertices or zero area)
 * 
 * @param i0 - First vertex index
 * @param i1 - Second vertex index
 * @param i2 - Third vertex index
 * @param positions - Position array (xyz per vertex)
 * @param epsilon - Minimum area threshold (default: 1e-10)
 * @returns true if triangle is degenerate
 */
export function isTriangleDegenerate(
  i0: number,
  i1: number,
  i2: number,
  positions: Float32Array | number[],
  epsilon: number = 1e-10
): boolean {
  // Check for duplicate vertices
  if (i0 === i1 || i1 === i2 || i0 === i2) {
    return true
  }

  // Check for zero area (collinear vertices)
  const x0 = positions[i0 * 3]
  const y0 = positions[i0 * 3 + 1]
  const z0 = positions[i0 * 3 + 2]

  const x1 = positions[i1 * 3]
  const y1 = positions[i1 * 3 + 1]
  const z1 = positions[i1 * 3 + 2]

  const x2 = positions[i2 * 3]
  const y2 = positions[i2 * 3 + 1]
  const z2 = positions[i2 * 3 + 2]

  // Calculate triangle area using cross product
  const v0x = x1 - x0
  const v0y = y1 - y0
  const v0z = z1 - z0

  const v1x = x2 - x0
  const v1y = y2 - y0
  const v1z = z2 - z0

  // Cross product: v0 × v1
  const crossX = v0y * v1z - v0z * v1y
  const crossY = v0z * v1x - v0x * v1z
  const crossZ = v0x * v1y - v0y * v1x

  // Area = 0.5 * |cross product|
  const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)

  return area < epsilon
}

/**
 * Merge vertices that are very close together (within epsilon distance)
 * This helps fix geometry issues where vertices should be shared but aren't
 * 
 * @param geometry - The geometry to repair
 * @param meshName - Optional mesh name for logging
 * @param epsilon - Maximum distance for merging vertices (default: 1e-6)
 * @returns Repaired geometry with merged vertices, or null if repair failed
 */
export function mergeCloseVertices(
  geometry: THREE.BufferGeometry,
  meshName?: string,
  epsilon: number = 1e-6
): { geometry: THREE.BufferGeometry; verticesMerged: number } | null {
  try {
    if (!geometry.attributes.position) {
      return null
    }

    const positionAttr = geometry.attributes.position
    const vertexCount = positionAttr.count
    const positions = positionAttr.array as Float32Array

    // Build a spatial hash to find close vertices efficiently
    // For simplicity, we'll use a grid-based approach
    const cellSize = epsilon * 10 // Larger cells for faster lookup
    const cellMap = new Map<string, number[]>() // cell key -> array of vertex indices

    // First pass: group vertices by spatial cell
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]

      const cellX = Math.floor(x / cellSize)
      const cellY = Math.floor(y / cellSize)
      const cellZ = Math.floor(z / cellSize)
      const cellKey = `${cellX},${cellY},${cellZ}`

      if (!cellMap.has(cellKey)) {
        cellMap.set(cellKey, [])
      }
      cellMap.get(cellKey)!.push(i)
    }

    // Second pass: merge vertices within epsilon distance
    const vertexMap = new Map<number, number>() // old index -> new index
    const newPositions: number[] = []
    let verticesMerged = 0

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const z = positions[i * 3 + 2]

      // Check if there's already a vertex at this position (within epsilon)
      let merged = false
      let targetNewIdx: number | undefined

      // Check nearby cells for close vertices
      const cellX = Math.floor(x / cellSize)
      const cellY = Math.floor(y / cellSize)
      const cellZ = Math.floor(z / cellSize)

      // Check current cell and adjacent cells
      for (let dx = -1; dx <= 1 && !merged; dx++) {
        for (let dy = -1; dy <= 1 && !merged; dy++) {
          for (let dz = -1; dz <= 1 && !merged; dz++) {
            const checkCellKey = `${cellX + dx},${cellY + dy},${cellZ + dz}`
            const cellVertices = cellMap.get(checkCellKey)
            if (!cellVertices) continue

            for (const otherIdx of cellVertices) {
              if (otherIdx >= i) continue // Only check already processed vertices
              if (!vertexMap.has(otherIdx)) continue

              const otherNewIdx = vertexMap.get(otherIdx)!
              const otherX = newPositions[otherNewIdx * 3]
              const otherY = newPositions[otherNewIdx * 3 + 1]
              const otherZ = newPositions[otherNewIdx * 3 + 2]

              const dist = Math.sqrt(
                (x - otherX) * (x - otherX) +
                (y - otherY) * (y - otherY) +
                (z - otherZ) * (z - otherZ)
              )

              if (dist < epsilon) {
                // Merge with this vertex
                vertexMap.set(i, otherNewIdx)
                verticesMerged++
                merged = true
                break
              }
            }
          }
        }
      }

      if (!merged) {
        // New unique vertex
        const newIdx = newPositions.length / 3
        newPositions.push(x, y, z)
        vertexMap.set(i, newIdx)
      }
    }

    if (verticesMerged === 0) {
      // No vertices merged, return original geometry
      return { geometry: geometry.clone(), verticesMerged: 0 }
    }

    // Remap indices
    if (geometry.index) {
      const oldIndices = geometry.index.array
      const newIndices: number[] = []
      for (let i = 0; i < oldIndices.length; i++) {
        const oldIdx = oldIndices[i]
        const newIdx = vertexMap.get(oldIdx) ?? oldIdx
        newIndices.push(newIdx)
      }

      // Create new geometry
      const newGeometry = geometry.clone()
      newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3))
      newGeometry.setIndex(newIndices)

      // Copy other attributes if they exist
      for (const attrName in geometry.attributes) {
        if (attrName !== 'position') {
          const attr = geometry.attributes[attrName]
          // Remap attribute values
          const newAttrArray = new Float32Array((newPositions.length / 3) * attr.itemSize)
          for (let i = 0; i < vertexCount; i++) {
            const newIdx = vertexMap.get(i)!
            if (newIdx < newPositions.length / 3) {
              for (let j = 0; j < attr.itemSize; j++) {
                newAttrArray[newIdx * attr.itemSize + j] = attr.array[i * attr.itemSize + j]
              }
            }
          }
          newGeometry.setAttribute(attrName, new THREE.BufferAttribute(newAttrArray, attr.itemSize))
        }
      }

      // Recompute bounds and normals
      newGeometry.computeBoundingSphere()
      newGeometry.computeBoundingBox()
      newGeometry.computeVertexNormals()

      if (verticesMerged > 0) {
        console.log(`[GeometryRepair] Merged ${verticesMerged} close vertex(es) in "${meshName || 'unnamed'}"`)
      }

      return { geometry: newGeometry, verticesMerged }
    } else {
      // Non-indexed geometry - we'd need to rebuild it, which is complex
      // For now, just return the original
      return { geometry: geometry.clone(), verticesMerged: 0 }
    }
  } catch (error: any) {
    console.warn(`[GeometryRepair] Failed to merge close vertices for "${meshName || 'unnamed'}":`, error)
    return null
  }
}

/**
 * Check if geometry has non-manifold topology that would prevent MeshoptSimplifier from working
 * MeshoptSimplifier requires manifold geometry (each edge shared by exactly 2 triangles)
 * 
 * @param geometry - The geometry to check
 * @param meshName - Optional mesh name for logging
 * @returns true if geometry appears to be non-manifold (will likely fail MeshoptSimplifier), false if likely manifold
 */
export function isNonManifoldGeometry(
  geometry: THREE.BufferGeometry,
  meshName?: string
): { isNonManifold: boolean; nonManifoldEdgeCount: number; totalEdges: number; nonManifoldRatio: number } {
  try {
    if (!geometry.index || !geometry.attributes.position) {
      return { isNonManifold: true, nonManifoldEdgeCount: 0, totalEdges: 0, nonManifoldRatio: 1.0 }
    }

    const indices = geometry.index.array
    const triangleCount = indices.length / 3

    if (triangleCount < 3) {
      return { isNonManifold: true, nonManifoldEdgeCount: 0, totalEdges: 0, nonManifoldRatio: 1.0 }
    }

    // Count edges and how many triangles share each edge
    const edgeMap = new Map<string, number>() // edge key -> count

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      // Create edge keys (always use smaller index first for consistency)
      const edge1 = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`
      const edge2 = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`
      const edge3 = i2 < i0 ? `${i2}-${i0}` : `${i0}-${i2}`

      edgeMap.set(edge1, (edgeMap.get(edge1) || 0) + 1)
      edgeMap.set(edge2, (edgeMap.get(edge2) || 0) + 1)
      edgeMap.set(edge3, (edgeMap.get(edge3) || 0) + 1)
    }

    // Count non-manifold edges (shared by >2 triangles)
    let nonManifoldEdgeCount = 0
    for (const count of edgeMap.values()) {
      if (count > 2) {
        nonManifoldEdgeCount++
      }
    }

    const totalEdges = edgeMap.size
    const nonManifoldRatio = totalEdges > 0 ? nonManifoldEdgeCount / totalEdges : 0

    // Consider geometry non-manifold if ANY edges are non-manifold (>2 triangles sharing an edge)
    // MeshoptSimplifier is extremely sensitive to non-manifold topology and will fail even with a single non-manifold edge
    // We use a very strict threshold (any non-manifold edges) because MeshoptSimplifier requires perfect manifold geometry
    const isNonManifold = nonManifoldEdgeCount > 0

    return { isNonManifold, nonManifoldEdgeCount, totalEdges, nonManifoldRatio }
  } catch (error: any) {
    console.warn(`[GeometryRepair] Failed to check non-manifold geometry for "${meshName || 'unnamed'}":`, error)
    // If we can't check, assume it might be non-manifold to be safe
    return { isNonManifold: true, nonManifoldEdgeCount: 0, totalEdges: 0, nonManifoldRatio: 1.0 }
  }
}

/**
 * Validate simplified geometry for holes and non-manifold edges
 * This checks if simplification created disconnected components or holes
 *
 * @param originalGeometry - The original geometry before simplification
 * @param simplifiedGeometry - The simplified geometry to validate
 * @param meshName - Optional mesh name for logging
 * @returns true if geometry appears valid (no obvious holes), false if holes detected
 */
export function validateSimplifiedGeometry(
  originalGeometry: THREE.BufferGeometry,
  simplifiedGeometry: THREE.BufferGeometry,
  meshName?: string
): boolean {
  try {
    if (!originalGeometry.index || !simplifiedGeometry.index) {
      return false
    }

    const originalIndices = originalGeometry.index.array
    const simplifiedIndices = simplifiedGeometry.index.array
    const originalTriangleCount = originalIndices.length / 3
    const simplifiedTriangleCount = simplifiedIndices.length / 3

    // Check 1: Simplified geometry should have fewer triangles than original
    if (simplifiedTriangleCount >= originalTriangleCount) {
      console.debug(`[GeometryValidation] Simplified geometry has same or more triangles than original for "${meshName || 'unnamed'}"`)
      return false
    }

    // Check 2: Check for edge connectivity - count edges and see if there are unconnected edges
    // A valid mesh should have most edges shared by exactly 2 triangles
    const edgeMap = new Map<string, number>() // edge key -> count

    // Count edges in simplified geometry
    for (let i = 0; i < simplifiedIndices.length; i += 3) {
      const i0 = simplifiedIndices[i]
      const i1 = simplifiedIndices[i + 1]
      const i2 = simplifiedIndices[i + 2]

      // Create edge keys (always use smaller index first for consistency)
      const edge1 = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`
      const edge2 = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`
      const edge3 = i2 < i0 ? `${i2}-${i0}` : `${i0}-${i2}`

      edgeMap.set(edge1, (edgeMap.get(edge1) || 0) + 1)
      edgeMap.set(edge2, (edgeMap.get(edge2) || 0) + 1)
      edgeMap.set(edge3, (edgeMap.get(edge3) || 0) + 1)
    }

    // Count boundary edges (edges shared by only 1 triangle) and non-manifold edges (shared by >2 triangles)
    let boundaryEdges = 0
    let nonManifoldEdges = 0
    let manifoldEdges = 0

    for (const count of edgeMap.values()) {
      if (count === 1) {
        boundaryEdges++
      } else if (count === 2) {
        manifoldEdges++
      } else {
        nonManifoldEdges++
      }
    }

    // Check 3: If there are too many boundary edges relative to the mesh size, it might indicate holes
    // For a closed mesh, boundary edges should be minimal (only at mesh boundaries)
    // For an open mesh, some boundary edges are expected, but too many might indicate holes
    const totalEdges = edgeMap.size
    const boundaryEdgeRatio = totalEdges > 0 ? boundaryEdges / totalEdges : 0

    // Make validation less strict: only reject if boundary edge ratio is very high (>50%) AND reduction is aggressive (<50%)
    // This allows open meshes and meshes with legitimate boundaries to pass validation
    if (boundaryEdgeRatio > 0.5 && simplifiedTriangleCount < originalTriangleCount * 0.5) {
      console.debug(`[GeometryValidation] High boundary edge ratio (${(boundaryEdgeRatio * 100).toFixed(1)}%) for "${meshName || 'unnamed'}" - possible holes detected`)
      return false
    }

    // Check 4: Non-manifold edges indicate problematic topology
    if (nonManifoldEdges > simplifiedTriangleCount * 0.1) {
      console.debug(`[GeometryValidation] Too many non-manifold edges (${nonManifoldEdges}) for "${meshName || 'unnamed'}" - invalid topology`)
      return false
    }

    // Check 5: Check if the simplified geometry has a reasonable triangle count
    // Only reject if reduction is very aggressive (<30% remaining) AND boundary edges are high
    // With our conservative reduction factors (95%/90%), this check should rarely trigger
    const reductionRatio = simplifiedTriangleCount / originalTriangleCount
    if (reductionRatio < 0.3 && boundaryEdgeRatio > 0.4) {
      console.debug(`[GeometryValidation] Aggressive simplification (${(reductionRatio * 100).toFixed(1)}% remaining) with high boundary edges for "${meshName || 'unnamed'}" - possible holes`)
      return false
    }

    // Validation passed - geometry appears valid
    return true
  } catch (error: any) {
    console.warn(`[GeometryValidation] Failed to validate simplified geometry for "${meshName || 'unnamed'}":`, error)
    return false
  }
}

/**
 * Comprehensive geometry repair: removes degenerate triangles and merges close vertices
 * This is a more aggressive repair that can help with problematic geometry
 *
 * @param geometry - The geometry to repair
 * @param meshName - Optional mesh name for logging
 * @param mergeVertices - Whether to merge close vertices (default: true)
 * @param mergeEpsilon - Maximum distance for merging vertices (default: 1e-6)
 * @returns Repaired geometry or null if repair failed
 */
export function repairGeometry(
  geometry: THREE.BufferGeometry,
  meshName?: string,
  mergeVertices: boolean = true,
  mergeEpsilon: number = 1e-6
): THREE.BufferGeometry | null {
  // Step 1: Remove degenerate triangles
  const degenerateRepair = removeDegenerateTriangles(geometry, meshName)
  if (!degenerateRepair) {
    return null
  }

  let workingGeometry = degenerateRepair.geometry

  // Step 2: Merge close vertices if requested
  if (mergeVertices) {
    const mergeResult = mergeCloseVertices(workingGeometry, meshName, mergeEpsilon)
    if (mergeResult && mergeResult.verticesMerged > 0) {
      workingGeometry = mergeResult.geometry
    }
  }

  // Step 3: Ensure geometry is properly indexed
  if (!workingGeometry.index) {
    // Geometry is not indexed - try to create an index
    // This is a simple approach: just create sequential indices
    const positionAttr = workingGeometry.attributes.position
    const vertexCount = positionAttr.count
    const indices: number[] = []
    for (let i = 0; i < vertexCount; i++) {
      indices.push(i)
    }
    workingGeometry.setIndex(indices)
  }

  // Step 4: Recompute normals and bounds
  workingGeometry.computeVertexNormals()
  workingGeometry.computeBoundingSphere()
  workingGeometry.computeBoundingBox()

  return workingGeometry
}

/**
 * Simple manual decimation algorithm that removes triangles by area.
 * This is a fallback for when MeshoptSimplifier fails due to non-manifold geometry.
 * 
 * Algorithm:
 * 1. Calculate area for each triangle
 * 2. Sort triangles by area (smallest first)
 * 3. Remove smallest triangles until target count is reached
 * 4. More tolerant of non-manifold geometry than MeshoptSimplifier
 * 
 * @param geometry - The geometry to simplify
 * @param targetTriangleCount - Target number of triangles
 * @param meshName - Optional mesh name for logging
 * @param isHighRatioMesh - If true, use more lenient fine detail thresholds (for meshes with high triangle-to-vertex ratio)
 * @returns Simplified geometry or null if simplification fails
 */
export function simpleDecimation(
  geometry: THREE.BufferGeometry,
  targetTriangleCount: number,
  meshName?: string,
  isHighRatioMesh: boolean = false
): THREE.BufferGeometry | null {
  try {
    if (!geometry.index || !geometry.attributes.position) {
      return null
    }

    const indices = geometry.index.array
    const positions = geometry.attributes.position.array
    const originalTriangleCount = indices.length / 3

    if (targetTriangleCount >= originalTriangleCount || targetTriangleCount < 3) {
      return null
    }

    // Calculate area for each triangle
    interface TriangleInfo {
      index: number // Index in the triangle array (i / 3)
      area: number
      i0: number
      i1: number
      i2: number
    }

    const triangles: TriangleInfo[] = []
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      // Skip degenerate triangles
      if (i0 === i1 || i1 === i2 || i0 === i2) {
        continue
      }

      // Calculate triangle area using cross product
      const x0 = positions[i0 * 3]
      const y0 = positions[i0 * 3 + 1]
      const z0 = positions[i0 * 3 + 2]

      const x1 = positions[i1 * 3]
      const y1 = positions[i1 * 3 + 1]
      const z1 = positions[i1 * 3 + 2]

      const x2 = positions[i2 * 3]
      const y2 = positions[i2 * 3 + 1]
      const z2 = positions[i2 * 3 + 2]

      // Vectors from v0 to v1 and v0 to v2
      const v0x = x1 - x0
      const v0y = y1 - y0
      const v0z = z1 - z0

      const v1x = x2 - x0
      const v1y = y2 - y0
      const v1z = z2 - z0

      // Cross product: v0 × v1
      const crossX = v0y * v1z - v0z * v1y
      const crossY = v0z * v1x - v0x * v1z
      const crossZ = v0x * v1y - v0y * v1x

      // Area = 0.5 * |cross product|
      const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)

      triangles.push({
        index: i / 3,
        area,
        i0,
        i1,
        i2
      })
    }

    if (triangles.length <= targetTriangleCount) {
      // Already at or below target, return original
      return geometry.clone()
    }

    // Check if mesh has many small triangles (indicating fine details like headlight internals, badges, etc.)
    // Calculate median area to detect if mesh has fine details
    const areas = triangles.map(t => t.area).sort((a, b) => a - b)
    const medianArea = areas[Math.floor(areas.length / 2)]
    const smallTriangleThreshold = medianArea * 0.1 // Triangles smaller than 10% of median are considered "fine detail"
    const smallTriangleCount = areas.filter(a => a < smallTriangleThreshold).length
    const fineDetailRatio = smallTriangleCount / triangles.length

    // For high-ratio meshes, use more lenient thresholds (they often have complex topology that still benefits from simplification)
    // For normal meshes, be more conservative to preserve fine details
    const skipThreshold = isHighRatioMesh ? 0.4 : 0.25 // Higher threshold for high-ratio meshes
    const detailPreservationThreshold = isHighRatioMesh ? 0.3 : 0.2 // Higher threshold for high-ratio meshes

    // If mesh has too many fine details, skip simplification to preserve details
    // Use more lenient threshold for high-ratio meshes
    if (fineDetailRatio > skipThreshold) {
      console.log(`[SimpleDecimation] ⚠️ "${meshName || 'unnamed'}" has too many fine details (${(fineDetailRatio * 100).toFixed(1)}% small triangles). Skipping simplification to preserve headlight internals, badges, mirrors, and other details.`)
      return null // Skip simplification to preserve fine details
    }

    // If mesh has significant fine detail, use a smarter preservation strategy
    // Instead of removing by area alone, we'll preserve a mix of small and large triangles
    let trianglesToKeep: TriangleInfo[]
    
    if (fineDetailRatio > detailPreservationThreshold) {
      // Mesh has fine details - preserve them by using a mixed strategy
      console.log(`[SimpleDecimation] ⚠️ "${meshName || 'unnamed'}" has fine details (${(fineDetailRatio * 100).toFixed(1)}% small triangles). Using detail-preserving decimation...`)
      
      // Strategy: Keep a mix of triangles
      // 1. Keep all triangles above a certain size threshold (main structure)
      // 2. Keep a proportional sample of small triangles (fine details)
      const largeTriangleThreshold = medianArea * 2 // Triangles larger than 2x median
      const largeTriangles = triangles.filter(t => t.area >= largeTriangleThreshold)
      const smallTriangles = triangles.filter(t => t.area < smallTriangleThreshold)
      const mediumTriangles = triangles.filter(t => t.area >= smallTriangleThreshold && t.area < largeTriangleThreshold)
      
      // Calculate how many we need to keep
      const largeToKeep = Math.min(largeTriangles.length, Math.floor(targetTriangleCount * 0.6)) // Keep 60% large
      const smallToKeep = Math.min(smallTriangles.length, Math.floor(targetTriangleCount * 0.3)) // Keep 30% small
      const mediumToKeep = Math.min(mediumTriangles.length, targetTriangleCount - largeToKeep - smallToKeep) // Rest from medium
      
      // Sort each category
      largeTriangles.sort((a, b) => b.area - a.area) // Largest first
      smallTriangles.sort((a, b) => b.area - a.area) // Largest small triangles first (preserve bigger small details)
      mediumTriangles.sort((a, b) => b.area - a.area) // Largest first
      
      // Combine: keep largest large, largest small, and largest medium
      trianglesToKeep = [
        ...largeTriangles.slice(0, largeToKeep),
        ...smallTriangles.slice(0, smallToKeep),
        ...mediumTriangles.slice(0, mediumToKeep)
      ]
      
      // If we still need more, fill with remaining largest triangles
      if (trianglesToKeep.length < targetTriangleCount) {
        const keptIndices = new Set(trianglesToKeep.map(t => t.index))
        const remaining = triangles.filter(t => !keptIndices.has(t.index))
        remaining.sort((a, b) => b.area - a.area)
        trianglesToKeep.push(...remaining.slice(0, targetTriangleCount - trianglesToKeep.length))
      }
    } else {
      // No significant fine details - safe to remove by area
      triangles.sort((a, b) => a.area - b.area)
      // Keep the largest triangles (remove the smallest ones)
      trianglesToKeep = triangles.slice(triangles.length - targetTriangleCount)
    }

    // Build new index array
    const newIndices: number[] = []
    for (const tri of trianglesToKeep) {
      newIndices.push(tri.i0, tri.i1, tri.i2)
    }

    // Create new geometry with simplified indices
    const simplifiedGeometry = geometry.clone()
    simplifiedGeometry.setIndex(newIndices)

    // Recompute normals and bounds
    simplifiedGeometry.computeVertexNormals()
    simplifiedGeometry.computeBoundingSphere()
    simplifiedGeometry.computeBoundingBox()

    // Validate the simplified geometry to ensure we didn't create holes
    // Use a more lenient validation for fallback decimation since it's already a fallback
    const isValid = validateSimplifiedGeometry(geometry, simplifiedGeometry, meshName)
    if (!isValid) {
      console.warn(`[SimpleDecimation] ⚠️ Simplified geometry failed validation for "${meshName || 'unnamed'}" - possible holes detected. Returning null.`)
      return null
    }

    const finalTriangleCount = newIndices.length / 3
    const reductionPercent = ((1 - finalTriangleCount / originalTriangleCount) * 100).toFixed(1)
    console.log(`[SimpleDecimation] ✅ Simplified "${meshName || 'unnamed'}": ${originalTriangleCount} → ${finalTriangleCount} triangles (${reductionPercent}% reduction)`)

    return simplifiedGeometry
  } catch (error: any) {
    console.warn(`[SimpleDecimation] Failed to simplify geometry for "${meshName || 'unnamed'}":`, error)
    return null
  }
}

/**
 * Fix face orientation using a conservative approach that only fixes clearly problematic faces
 * This fixes artifacts caused by faces being wound in the wrong direction
 * 
 * The function uses multiple strategies:
 * 1. Checks if geometry already has valid normals (if so, assumes orientation is correct)
 * 2. Uses adjacent face checking to determine correct orientation
 * 3. Only flips faces that are clearly inconsistent with their neighbors
 * 
 * @param geometry - The geometry to fix
 * @param meshName - Optional mesh name for logging
 * @returns The geometry with fixed face orientation (may be the same geometry if no fixes were needed)
 */
export function fixFaceOrientation(
  geometry: THREE.BufferGeometry,
  meshName?: string
): THREE.BufferGeometry {
  try {
    if (!geometry.index || !geometry.attributes.position) {
      return geometry
    }

    const indices = geometry.index.array
    const indexCount = indices.length
    const positionAttr = geometry.attributes.position
    const positions = positionAttr.array

    if (indexCount < 3) {
      return geometry
    }

    // Check if geometry already has valid normals
    // If normals exist and are valid, assume face orientation is correct
    if (geometry.attributes.normal) {
      const normalAttr = geometry.attributes.normal
      let hasValidNormals = false
      let zeroNormalCount = 0
      
      // Check if normals are valid (not all zeros)
      for (let i = 0; i < normalAttr.count; i++) {
        const nx = normalAttr.getX(i)
        const ny = normalAttr.getY(i)
        const nz = normalAttr.getZ(i)
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (length < 0.001) {
          zeroNormalCount++
        }
      }
      
      // If less than 10% of normals are zero, assume they're valid
      if (zeroNormalCount / normalAttr.count < 0.1) {
        hasValidNormals = true
      }
      
      if (hasValidNormals) {
        console.log(`[FixFaceOrientation] ℹ️ "${meshName || 'unnamed'}" already has valid normals - skipping face orientation fix`)
        return geometry
      }
    }

    // Build adjacency map: for each edge, track which faces share it
    const edgeToFaces = new Map<string, number[]>()
    const faceNormals: THREE.Vector3[] = []
    
    // First pass: calculate all face normals and build edge map
    for (let i = 0; i < indexCount; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      const v0 = new THREE.Vector3(
        positions[i0 * 3],
        positions[i0 * 3 + 1],
        positions[i0 * 3 + 2]
      )
      const v1 = new THREE.Vector3(
        positions[i1 * 3],
        positions[i1 * 3 + 1],
        positions[i1 * 3 + 2]
      )
      const v2 = new THREE.Vector3(
        positions[i2 * 3],
        positions[i2 * 3 + 1],
        positions[i2 * 3 + 2]
      )

      // Calculate face normal
      const edge1 = new THREE.Vector3().subVectors(v1, v0)
      const edge2 = new THREE.Vector3().subVectors(v2, v0)
      const normal = new THREE.Vector3().crossVectors(edge1, edge2)
      const length = normal.length()
      if (length > 0.0001) {
        normal.normalize()
      }
      faceNormals.push(normal.clone())

      // Add edges to adjacency map (use sorted vertex indices for edge key)
      const faceIndex = i / 3
      const addEdge = (a: number, b: number) => {
        const edgeKey = a < b ? `${a},${b}` : `${b},${a}`
        if (!edgeToFaces.has(edgeKey)) {
          edgeToFaces.set(edgeKey, [])
        }
        edgeToFaces.get(edgeKey)!.push(faceIndex)
      }
      addEdge(i0, i1)
      addEdge(i1, i2)
      addEdge(i2, i0)
    }

    // Second pass: determine which faces need flipping based on neighbor consistency
    let facesFlipped = 0
    let facesChecked = 0
    const needsFlip = new Array<boolean>(indexCount / 3).fill(false)
    const newIndices = new Array(indexCount)

    for (let i = 0; i < indexCount; i += 3) {
      const faceIndex = i / 3
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      facesChecked++
      const currentNormal = faceNormals[faceIndex]

      // Find adjacent faces
      const adjacentFaces: number[] = []
      const addAdjacentFaces = (a: number, b: number) => {
        const edgeKey = a < b ? `${a},${b}` : `${b},${a}`
        const faces = edgeToFaces.get(edgeKey) || []
        faces.forEach(fIdx => {
          if (fIdx !== faceIndex && !adjacentFaces.includes(fIdx)) {
            adjacentFaces.push(fIdx)
          }
        })
      }
      addAdjacentFaces(i0, i1)
      addAdjacentFaces(i1, i2)
      addAdjacentFaces(i2, i0)

      // Check consistency with adjacent faces
      // If most adjacent faces have normals pointing in similar direction, this face should too
      if (adjacentFaces.length > 0) {
        let consistentCount = 0
        let inconsistentCount = 0

        for (const adjFaceIdx of adjacentFaces) {
          const adjNormal = faceNormals[adjFaceIdx]
          const dot = currentNormal.dot(adjNormal)
          
          // If normals are similar (dot product > 0.3), they're consistent
          // If normals are opposite (dot product < -0.3), they're inconsistent
          if (dot > 0.3) {
            consistentCount++
          } else if (dot < -0.3) {
            inconsistentCount++
          }
        }

        // Only flip if significantly more inconsistent than consistent
        // This is conservative - only fix clearly wrong faces
        if (inconsistentCount > consistentCount * 1.5 && inconsistentCount >= 2) {
          needsFlip[faceIndex] = true
          facesFlipped++
        }
      } else {
        // Isolated face - use bounding box method as fallback (but be conservative)
        geometry.computeBoundingBox()
        const bbox = geometry.boundingBox
        if (bbox) {
          const center = new THREE.Vector3()
          bbox.getCenter(center)
          
          const v0 = new THREE.Vector3(
            positions[i0 * 3],
            positions[i0 * 3 + 1],
            positions[i0 * 3 + 2]
          )
          const v1 = new THREE.Vector3(
            positions[i1 * 3],
            positions[i1 * 3 + 1],
            positions[i1 * 3 + 2]
          )
          const v2 = new THREE.Vector3(
            positions[i2 * 3],
            positions[i2 * 3 + 1],
            positions[i2 * 3 + 2]
          )
          
          const faceCenter = new THREE.Vector3()
            .add(v0)
            .add(v1)
            .add(v2)
            .multiplyScalar(1 / 3)
          
          const toCenter = new THREE.Vector3().subVectors(center, faceCenter)
          toCenter.normalize()
          
          // Only flip if strongly pointing inward (very conservative threshold)
          const dotProduct = currentNormal.dot(toCenter)
          if (dotProduct > 0.7) { // Very high threshold - only clearly wrong faces
            needsFlip[faceIndex] = true
            facesFlipped++
          }
        }
      }

      // Apply flip if needed
      if (needsFlip[faceIndex]) {
        newIndices[i] = i0
        newIndices[i + 1] = i2
        newIndices[i + 2] = i1
      } else {
        newIndices[i] = i0
        newIndices[i + 1] = i1
        newIndices[i + 2] = i2
      }
    }

    // Only create new geometry if we actually flipped any faces
    if (facesFlipped > 0) {
      const fixedGeometry = geometry.clone()
      fixedGeometry.setIndex(newIndices)
      
      // Recompute normals after fixing face orientation
      fixedGeometry.computeVertexNormals()
      fixedGeometry.computeBoundingSphere()
      fixedGeometry.computeBoundingBox()

      const flipPercent = ((facesFlipped / facesChecked) * 100).toFixed(1)
      console.log(`[FixFaceOrientation] ✅ Fixed "${meshName || 'unnamed'}": Flipped ${facesFlipped}/${facesChecked} faces (${flipPercent}% were inconsistent)`)
      
      return fixedGeometry
    }

    return geometry
  } catch (error: any) {
    console.warn(`[FixFaceOrientation] Failed to fix face orientation for "${meshName || 'unnamed'}":`, error)
    return geometry
  }
}

