/**
 * LOD with BVH Acceleration Manager
 * Enhances LOD system with BVH-based frustum culling and spatial queries
 * Based on: https://threejs.org/examples/#webgl_batch_lod_bvh
 */

import * as THREE from 'three'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

// Extend BufferGeometry prototype with BVH methods
// This is the correct way to use three-mesh-bvh
if (!(THREE.BufferGeometry.prototype as any).computeBoundsTree) {
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
  THREE.Mesh.prototype.raycast = acceleratedRaycast
}

/**
 * Build BVH for a geometry to accelerate raycasting and frustum culling
 */
export function buildGeometryBVH(geometry: THREE.BufferGeometry): void {
  try {
    // Use three-mesh-bvh to accelerate geometry
    // This adds a boundsTree property to the geometry for fast spatial queries
    if (!(geometry as any).boundsTree) {
      geometry.computeBoundsTree()
      console.log('[LOD BVH] Built BVH for geometry')
    }
  } catch (error) {
    console.warn('[LOD BVH] Failed to build BVH for geometry:', error)
  }
}

/**
 * Build BVH for all LOD geometries in a LOD object
 */
export function buildLODBVH(lod: THREE.LOD): void {
  try {
    lod.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        buildGeometryBVH(child.geometry)
      }
    })
    console.log('[LOD BVH] Built BVH for LOD object with', lod.children.length, 'levels')
  } catch (error) {
    console.warn('[LOD BVH] Failed to build BVH for LOD:', error)
  }
}

/** Minimum vertex count before building a pick BVH on a regular mesh. */
export const HEAVY_MESH_VERTEX_THRESHOLD = 50_000

/**
 * Build BVH for heavy non-LOD meshes to accelerate raycasting/picking.
 */
export function buildSceneMeshBVH(
  scene: THREE.Scene,
  vertexThreshold: number = HEAVY_MESH_VERTEX_THRESHOLD
): number {
  let meshCount = 0
  try {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.LOD || !obj.geometry) {
        return
      }

      const position = obj.geometry.attributes.position
      if (!position || position.count < vertexThreshold) {
        return
      }

      buildGeometryBVH(obj.geometry)
      meshCount++
    })

    if (meshCount > 0) {
      console.log(`[LOD BVH] Built BVH for ${meshCount} heavy mesh(es)`)
    }
    return meshCount
  } catch (error) {
    console.error('[LOD BVH] Failed to build scene mesh BVH:', error)
    return 0
  }
}

/**
 * Build BVH for LOD objects and heavy meshes in a scene.
 */
export function buildScenePickBVH(scene: THREE.Scene): { lodCount: number; meshCount: number } {
  return {
    lodCount: buildSceneLODBVH(scene),
    meshCount: buildSceneMeshBVH(scene)
  }
}

/**
 * Build BVH for all LOD objects in a scene
 * This should be called after LOD generation is complete
 */
export function buildSceneLODBVH(scene: THREE.Scene): number {
  let lodCount = 0
  try {
    scene.traverse((obj) => {
      if (obj instanceof THREE.LOD && obj.userData.hasLOD) {
        buildLODBVH(obj)
        lodCount++
      }
    })
    if (lodCount > 0) {
      console.log(`[LOD BVH] ✅ Built BVH for ${lodCount} LOD object(s)`)
    }
    return lodCount
  } catch (error) {
    console.error('[LOD BVH] Failed to build scene BVH:', error)
    return 0
  }
}

/**
 * Optimize LOD distance calculations using BVH
 * This can be used to dynamically adjust LOD distances based on scene complexity
 */
export function optimizeLODDistances(
  lod: THREE.LOD,
  camera: THREE.Camera,
  baseDistances: { high: number; medium: number; low: number }
): { high: number; medium: number; low: number } {
  // For now, return base distances
  // Future: Use BVH to calculate optimal distances based on scene density
  return baseDistances
}

