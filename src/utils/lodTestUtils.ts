/**
 * LOD (Level of Detail) Test Utilities
 * 
 * Provides functions for testing and generating LOD levels for 3D models.
 * Extracted from App.tsx to improve code organization.
 */

import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer'
import { removeDegenerateTriangles, validateSimplifiedGeometry, isNonManifoldGeometry, simpleDecimation } from './geometryRepair'

export interface LODTestResult {
  enabled: boolean
  totalTriangles: number
  meshCount: number
  lodSuccessCount?: number
  lodErrorCount?: number
  lodMeshes?: number
  eligibleMeshes?: number
  errors?: Array<{ mesh: string; error: string }>
  error?: string
}

/**
 * Helper function to create simplified geometry using MeshoptSimplifier
 */
function createSimplifiedGeometry(geometry: any, reductionFactor: number, meshName?: string): any {
  try {
    if (!geometry.index || !geometry.attributes.position) {
      console.warn(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Missing index or position attribute`)
      return null
    }
    
    let originalIndices = geometry.index.array
    let originalIndexCount = originalIndices.length
    
    if (originalIndexCount < 3) {
      console.warn(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Too few indices (${originalIndexCount})`)
      return null
    }
    
    // Get position attributes
    let positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!positionAttribute) {
      console.warn(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": No position attribute`)
      return null
    }
    
    let vertexCount = positionAttribute.count
    let positionArray = positionAttribute.array
    const positionArrayLength = positionArray.length
    
    // Validate position array length (should be vertexCount * 3 for xyz)
    if (positionArrayLength !== vertexCount * 3) {
      console.warn(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Invalid position array length (expected ${vertexCount * 3}, got ${positionArrayLength})`)
      return null
    }
    
    // Validate indices - check for out-of-bounds indices
    const indicesArray = Array.from(originalIndices) as number[]
    const maxIndex = Math.max(...indicesArray)
    const minIndex = Math.min(...indicesArray)
    
    if (minIndex < 0 || maxIndex >= vertexCount) {
      console.warn(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Invalid indices (range: ${minIndex}-${maxIndex}, vertexCount: ${vertexCount})`)
      return null
    }
    
    let originalTriangleCount = originalIndexCount / 3
    
    // Check for degenerate triangles and repair if needed
    // IMPORTANT: For LOD generation, we ONLY remove degenerate triangles, NOT merge vertices
    // Vertex merging can break mesh topology and create holes, so we skip it for LOD
    let degenerateCount = 0
    for (let i = 0; i < originalIndexCount; i += 3) {
      const i0 = originalIndices[i]
      const i1 = originalIndices[i + 1]
      const i2 = originalIndices[i + 2]
      if (i0 === i1 || i1 === i2 || i0 === i2) {
        degenerateCount++
      }
    }
    
    // Always attempt to repair degenerate triangles, regardless of count
    // This gives meshes a chance to be fixed even if they have many degenerate triangles
    // We'll only skip if repair fails or leaves too few triangles
    let geometryRepaired = false
    if (degenerateCount > 0) {
      // Log degenerate triangle count before repair
      const degeneratePercent = Math.round(degenerateCount / originalTriangleCount * 100)
      if (degeneratePercent > 50) {
        console.debug(`[LOD Test] ⚠️ "${meshName || 'unnamed'}" has many degenerate triangles (${degenerateCount}/${originalTriangleCount}, ${degeneratePercent}%) - attempting repair`)
      } else if (degenerateCount > 0) {
        console.debug(`[LOD Test] ℹ️ "${meshName || 'unnamed'}" has ${degenerateCount} degenerate triangles (${degeneratePercent}%) - attempting repair`)
      }
      
      // Use removeDegenerateTriangles to fix geometry
      const degenerateRepair = removeDegenerateTriangles(geometry, meshName)
      if (degenerateRepair && degenerateRepair.geometry) {
        const repairedGeometry = degenerateRepair.geometry
        const repairedTriangleCount = repairedGeometry.index ? repairedGeometry.index.count / 3 : 0
        
        // Validate repaired geometry - ensure it still has valid indices and positions
        if (repairedGeometry.index && repairedGeometry.index.count >= 3 && 
            repairedGeometry.attributes.position && repairedGeometry.attributes.position.count > 0) {
          
          // Skip if repair removed too many triangles (>90% removed)
          // This indicates the geometry was too broken to be useful
          const trianglesRemovedPercent = Math.round((degenerateCount / originalTriangleCount) * 100)
          if (trianglesRemovedPercent > 90) {
            console.debug(`[LOD Test] ❌ Skipping "${meshName || 'unnamed'}": Repair removed too many triangles (${trianglesRemovedPercent}% removed, only ${repairedTriangleCount} remaining)`)
            return null
          }
          
          // Skip if repair left too few triangles (<10 triangles)
          if (repairedTriangleCount < 10) {
            console.debug(`[LOD Test] ❌ Skipping "${meshName || 'unnamed'}": Too few triangles after repair (${repairedTriangleCount} remaining)`)
            return null
          }
          
          geometry = repairedGeometry
          geometryRepaired = true
          // Update indices and position array for repaired geometry
          originalIndices = geometry.index!.array
          positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute
          positionArray = positionAttribute.array
          vertexCount = positionAttribute.count
          originalIndexCount = originalIndices.length
          originalTriangleCount = originalIndexCount / 3
          console.debug(`[LOD Test] ✅ Repaired "${meshName || 'unnamed'}": Removed ${degenerateCount} degenerate triangle(s), ${originalTriangleCount} remaining`)
        } else {
          // Repaired geometry is invalid - skip simplification
          console.debug(`[LOD Test] ❌ Skipping "${meshName || 'unnamed'}": Repaired geometry is invalid (missing index or position data)`)
          return null
        }
      } else {
        // Repair failed - skip simplification
        console.debug(`[LOD Test] ❌ Skipping "${meshName || 'unnamed'}": Failed to remove degenerate triangles (${degenerateCount} degenerate triangles detected)`)
        return null
      }
    }
    
    const targetTriangleCount = Math.max(3, Math.floor(originalTriangleCount * reductionFactor))
    
    if (targetTriangleCount >= originalTriangleCount || targetTriangleCount < 3) {
      console.debug(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Invalid target triangle count (original: ${originalTriangleCount}, target: ${targetTriangleCount})`)
      return null
    }
    
    // Check for non-manifold geometry before attempting simplification
    // MeshoptSimplifier requires manifold geometry and will fail with "Assertion failed" for non-manifold meshes
    const { isNonManifold, nonManifoldEdgeCount, totalEdges, nonManifoldRatio } = isNonManifoldGeometry(geometry, meshName)
    if (isNonManifold) {
      console.log(`[LOD Test] ❌ Skipping "${meshName || 'unnamed'}": Non-manifold geometry detected (${nonManifoldEdgeCount}/${totalEdges} edges, ${(nonManifoldRatio * 100).toFixed(1)}% non-manifold). MeshoptSimplifier requires manifold geometry.`)
      return null
    }
    
    // Check for suspicious triangle-to-vertex ratio
    // High ratios (>1.2) often indicate overlapping triangles or problematic topology
    // that MeshoptSimplifier may not handle, but we'll still try it first
    const triangleToVertexRatio = originalTriangleCount / vertexCount
    const hasHighRatio = triangleToVertexRatio > 1.2
    
    // Log simplification attempt
    if (hasHighRatio) {
      console.log(`[LOD Test] ⚠️ "${meshName || 'unnamed'}" has high triangle-to-vertex ratio (${triangleToVertexRatio.toFixed(2)}: ${originalTriangleCount} triangles, ${vertexCount} vertices). Will try MeshoptSimplifier first, then fallback if needed.`)
    } else {
      console.log(`[LOD Test] 🔧 Attempting to simplify "${meshName || 'unnamed'}": ${originalTriangleCount} → ${targetTriangleCount} triangles (${((1 - reductionFactor) * 100).toFixed(1)}% reduction)`)
    }
    
    // Convert to typed arrays for meshoptimizer
    const indices = new Uint32Array(originalIndices)
    const positions = new Float32Array(positionArray)
    
    // Try MeshoptSimplifier first (even for high-ratio meshes, as it might work)
    // Wrap in try-catch to catch assertion errors specifically
    let simplified: Uint32Array | null = null
    let usedFallback = false
    
    try {
      // MeshoptSimplifier.simplify returns [Uint32Array, number] tuple
      // The second element is the error metric, we only need the indices
      const simplifyResult = MeshoptSimplifier.simplify(
        indices,
        positions,
        3, // position stride
        targetTriangleCount * 3, // target index count (triangles * 3)
        0.01 // error threshold
      )
      simplified = Array.isArray(simplifyResult) ? simplifyResult[0] : simplifyResult as Uint32Array
    } catch (simplifyError: any) {
      // MeshoptSimplifier can fail for meshes with non-manifold geometry, invalid topology, or stack overflow
      // Try fallback simple decimation algorithm that's more tolerant of problematic geometry
      const errorMsg = simplifyError?.message || String(simplifyError)
      const isStackOverflow = errorMsg.includes('Maximum call stack size exceeded') || 
                             errorMsg.includes('stack') ||
                             errorMsg.includes('Stack')
      
      console.log(`[LOD Test] ⚠️ MeshoptSimplifier failed for "${meshName || 'unnamed'}" (${isStackOverflow ? 'stack overflow' : 'non-manifold/invalid topology'}), trying fallback decimation...`)
      usedFallback = true
    }
    
    // If MeshoptSimplifier failed or returned invalid result, try fallback
    // For high-ratio meshes, use a more lenient fine detail threshold
    if (!simplified || simplified.length < 3) {
      const fallbackGeometry = simpleDecimation(geometry, targetTriangleCount, meshName, hasHighRatio)
      if (fallbackGeometry) {
        console.log(`[LOD Test] ✅ Fallback decimation succeeded for "${meshName || 'unnamed'}"`)
        simplified = new Uint32Array(fallbackGeometry.index!.array)
        usedFallback = true
      } else {
        console.log(`[LOD Test] ❌ Both MeshoptSimplifier and fallback decimation failed for "${meshName || 'unnamed'}"`)
        return null
      }
    }
    
    if (!simplified || simplified.length < 3) {
      console.debug(`[LOD Test] Skipping simplification for "${meshName || 'unnamed'}": Result too small (${simplified?.length || 0} indices)`)
      return null
    }
    
    // Create new geometry with simplified indices
    const simplifiedGeometry = geometry.clone()
    simplifiedGeometry.setIndex(new THREE.BufferAttribute(simplified, 1))
    
    // Recompute normals and bounds
    simplifiedGeometry.computeVertexNormals()
    simplifiedGeometry.computeBoundingSphere()
    simplifiedGeometry.computeBoundingBox()
    
    // CRITICAL: Validate simplified geometry to detect holes
    // This prevents using broken geometry that would create visible holes
    if (!validateSimplifiedGeometry(geometry, simplifiedGeometry, meshName)) {
      console.debug(`[LOD Test] Skipping simplified geometry for "${meshName || 'unnamed'}": Validation failed (possible holes detected)`)
      return null
    }
    
    return simplifiedGeometry
  } catch (e: any) {
    // Catch any other unexpected errors (shouldn't happen, but safety net)
    const errorMsg = e?.message || String(e)
    const isStackOverflow = errorMsg.includes('Maximum call stack size exceeded') || 
                           errorMsg.includes('stack') ||
                           errorMsg.includes('Stack')
    
    // Log as debug since these are expected for problematic geometry
    console.debug(`[LOD Test] Failed to simplify geometry for "${meshName || 'unnamed'}" (${isStackOverflow ? 'stack overflow' : 'unexpected error'}):`, errorMsg)
    return null
  }
}

/**
 * Test LOD generation for a scene
 * 
 * @param scene The Three.js scene to test
 * @returns Promise resolving to LOD test results
 */
export async function testLODGeneration(scene: THREE.Scene): Promise<LODTestResult> {
  console.log('[LOD Test] ===========================================')
  console.log('[LOD Test] Starting LOD generation test...')
  console.log('[LOD Test] ===========================================')
  
  if (!scene) {
    console.error('[LOD Test] ❌ Viewer scene not available')
    return { enabled: false, totalTriangles: 0, meshCount: 0, error: 'Scene not available' }
  }
  
  try {
    // Count meshes and triangles
    console.log('[LOD Test] Step 1: Counting meshes and triangles...')
    let meshCount = 0
    let totalTriangles = 0
    const meshInfo: Array<{ name: string; triangles: number; hasIndex: boolean; hasPosition: boolean }> = []
    
    scene.traverse((obj: any) => {
      if (obj instanceof THREE.Mesh && obj.geometry && !obj.userData.isShadowPlane) {
        meshCount++
        const geometry = obj.geometry
        const positionAttr = geometry.attributes.position
        
        if (positionAttr && geometry.index) {
          const triangleCount = geometry.index.count / 3
          totalTriangles += triangleCount
          
          meshInfo.push({
            name: obj.name || 'unnamed',
            triangles: triangleCount,
            hasIndex: !!geometry.index,
            hasPosition: !!positionAttr
          })
        } else {
          meshInfo.push({
            name: obj.name || 'unnamed',
            triangles: 0,
            hasIndex: !!geometry.index,
            hasPosition: !!positionAttr
          })
        }
      }
    })
    
    console.log(`[LOD Test] ✅ Total meshes: ${meshCount}`)
    console.log(`[LOD Test] ✅ Total triangles: ~${Math.round(totalTriangles / 1000)}K`)
    
    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const enableLOD = totalTriangles > 500000
    console.log(`[LOD Test] LOD threshold (500K): ${enableLOD ? '✅ ENABLED' : '❌ DISABLED'}`)
    
    if (!enableLOD) {
      console.log('[LOD Test] Model does not meet LOD threshold (500K triangles)')
      return { enabled: false, totalTriangles, meshCount }
    }
    
    console.log('[LOD Test] Step 2: Finding meshes eligible for LOD...')
    
    // First, collect all eligible meshes
    const eligibleMeshes: Array<{ mesh: any; geometry: any; material: any; triangleCount: number }> = []
    scene.traverse((obj: any) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.material && !obj.userData.isShadowPlane) {
        const geometry = obj.geometry
        const positionAttr = geometry.attributes.position
        
        if (positionAttr && geometry.index) {
          const triangleCount = geometry.index.count / 3
          
          if (triangleCount > 1000) {
            eligibleMeshes.push({
              mesh: obj,
              geometry: geometry,
              material: obj.material,
              triangleCount: triangleCount
            })
          }
        }
      }
    })
    
    console.log(`[LOD Test] ✅ Found ${eligibleMeshes.length} mesh(es) eligible for LOD (>1000 triangles)`)
    
    if (eligibleMeshes.length === 0) {
      console.log('[LOD Test] No meshes eligible for LOD generation')
      return { enabled: false, totalTriangles, meshCount, eligibleMeshes: 0 }
    }
    
    console.log('[LOD Test] Step 3: Generating LOD levels (this may take a moment for large models)...')
    
    // Increased distances to make LOD transitions happen further away
    // This gives more visual leeway for any minor imperfections in simplified meshes
    const LOD_DISTANCES = { high: 100, medium: 300, low: 600 }
    const lodMeshes: Array<{ name: string; originalTriangles: number; lod: any }> = []
    let lodSuccessCount = 0
    let lodErrorCount = 0
    const errors: Array<{ mesh: string; error: string }> = []
    
    // Process meshes with progress updates
    for (let i = 0; i < eligibleMeshes.length; i++) {
      const { mesh, geometry, material, triangleCount } = eligibleMeshes[i]
      
      // Show progress every 10 meshes or for first/last
      if (i === 0 || i === eligibleMeshes.length - 1 || (i + 1) % 10 === 0) {
        console.log(`[LOD Test]   Processing mesh ${i + 1}/${eligibleMeshes.length}: "${mesh.name || 'unnamed'}" (${Math.round(triangleCount / 1000)}K triangles)`)
      }
      
      try {
        const originalMesh = mesh
        const originalGeometry = geometry
        const originalMaterial = material
        const meshName = mesh.name || 'unnamed'
        
        // Use VERY conservative reduction factors to prevent holes
        // Medium LOD: Keep 95% of triangles (5% reduction) - minimal reduction to prevent holes
        const mediumGeometry = createSimplifiedGeometry(originalGeometry, 0.95, meshName)
        // Low LOD: Keep 90% of triangles (10% reduction) - minimal reduction to prevent holes
        const lowGeometry = createSimplifiedGeometry(originalGeometry, 0.9, meshName)
        
        if (mediumGeometry && lowGeometry) {
          const lod = new THREE.LOD()
          
          const highMesh = new THREE.Mesh(originalGeometry, originalMaterial)
          lod.addLevel(highMesh, 0)
          
          const mediumMesh = new THREE.Mesh(mediumGeometry, originalMaterial)
          lod.addLevel(mediumMesh, LOD_DISTANCES.high)
          
          const lowMesh = new THREE.Mesh(lowGeometry, originalMaterial)
          lod.addLevel(lowMesh, LOD_DISTANCES.medium)
          
          lod.position.copy(originalMesh.position)
          lod.rotation.copy(originalMesh.rotation)
          lod.scale.copy(originalMesh.scale)
          lod.userData = Object.assign({}, originalMesh.userData)
          lod.userData.hasLOD = true
          lod.userData.originalTriangleCount = triangleCount
          
          if (originalMesh.parent) {
            originalMesh.parent.add(lod)
            originalMesh.parent.remove(originalMesh)
            originalMesh.geometry.dispose()
            if (!Array.isArray(originalMesh.material)) {
              originalMesh.material.dispose()
            }
          }
          
          lodMeshes.push({
            name: mesh.name || 'unnamed',
            originalTriangles: triangleCount,
            lod: lod
          })
          
          lodSuccessCount++
          
          // Allow UI to update every 5 meshes
          if ((i + 1) % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        } else {
          lodErrorCount++
          const errorMsg = 'Failed to create simplified geometries'
          errors.push({ mesh: mesh.name || 'unnamed', error: errorMsg })
        }
      } catch (e: any) {
        lodErrorCount++
        const errorMsg = e?.message || String(e)
        errors.push({ mesh: mesh.name || 'unnamed', error: errorMsg })
        console.error(`[LOD Test]     ❌ Error creating LOD for "${mesh.name || 'unnamed'}":`, e)
      }
    }
    
    console.log(`[LOD Test] ✅ LOD generation complete:`)
    console.log(`[LOD Test]   - Successfully created LOD for ${lodSuccessCount} mesh(es)`)
    console.log(`[LOD Test]   - Skipped ${lodErrorCount} mesh(es) (non-manifold geometry or invalid topology - this is expected and doesn't affect rendering)`)
    
    if (lodMeshes.length > 0) {
      const totalLODTriangles = lodMeshes.reduce((sum, item) => sum + item.originalTriangles, 0)
      console.log(`[LOD Test]   - Total triangles in LOD meshes: ~${Math.round(totalLODTriangles / 1000)}K`)
      console.log(`[LOD Test]   - LOD distances: High (0-50), Medium (50-150), Low (150-300) units`)
    }
    
    if (errors.length > 0) {
      console.warn(`[LOD Test] ⚠️ Errors encountered:`)
      errors.forEach((err, i) => {
        console.warn(`[LOD Test]   ${i + 1}. "${err.mesh}": ${err.error}`)
      })
    }
    
    const sortedMeshes = meshInfo
      .filter(m => m.triangles > 0)
      .sort((a, b) => b.triangles - a.triangles)
      .slice(0, 10)
    
    if (sortedMeshes.length > 0) {
      console.log(`[LOD Test] Top 10 meshes by triangle count:`)
      sortedMeshes.forEach((mesh, i) => {
        console.log(`[LOD Test]   ${i + 1}. "${mesh.name}": ~${Math.round(mesh.triangles / 1000)}K triangles`)
      })
    }
    
    console.log('[LOD Test] ===========================================')
    console.log('[LOD Test] ✅ Test completed!')
    console.log('[LOD Test] ===========================================')
    
    return {
      enabled: true,
      totalTriangles,
      meshCount,
      lodSuccessCount,
      lodErrorCount,
      lodMeshes: lodMeshes.length,
      errors
    }
  } catch (error: any) {
    console.error('[LOD Test] ❌ Fatal error during LOD test:', error)
    console.error('[LOD Test] Error details:', error?.message || String(error))
    console.error('[LOD Test] Stack:', error?.stack)
    return {
      enabled: false,
      error: error?.message || String(error),
      totalTriangles: 0,
      meshCount: 0
    }
  }
}


