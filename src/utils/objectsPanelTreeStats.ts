import * as THREE from 'three'

/** Per-object subtree totals (self + descendants). */
export type ObjectSubtreeStats = {
  triangles: number
  size: number
}

const TEXTURE_PROPS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap'
] as const

/** Immutable geometry triangle/vertex footprint (shared across instances). */
const geometryStatsCache = new WeakMap<THREE.BufferGeometry, ObjectSubtreeStats>()
/** Immutable texture byte estimate. */
const textureSizeCache = new WeakMap<THREE.Texture, number>()

/** Test/diagnostics: how many times a geometry was fully measured (cache miss). */
let geometryCacheMisses = 0

export function getGeometryCacheMissCount(): number {
  return geometryCacheMisses
}

export function resetGeometryCacheMissCount(): void {
  geometryCacheMisses = 0
}

function estimateTextureBytes(tex: THREE.Texture): number {
  const cached = textureSizeCache.get(tex)
  if (cached !== undefined) return cached

  let bytes = 0
  const img = tex.image as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number } | undefined
  if (img) {
    const width = img.width || img.naturalWidth || 0
    const height = img.height || img.naturalHeight || 0
    if (width > 0 && height > 0) {
      // Rough RGBA estimate
      bytes = width * height * 4
    }
  }
  textureSizeCache.set(tex, bytes)
  return bytes
}

/**
 * Local mesh contribution only (no children). Geometry/texture sizes are cached
 * so shared resources are measured once across rebuilds.
 */
export function getLocalMeshStats(mesh: THREE.Mesh): ObjectSubtreeStats {
  const geom = mesh.geometry
  if (!geom) return { triangles: 0, size: 0 }

  let geomStats = geometryStatsCache.get(geom)
  if (!geomStats) {
    geometryCacheMisses++
    let triangles = 0
    let size = 0

    if (geom.index) {
      triangles = geom.index.count / 3
      size += geom.index.count * 4
    } else if (geom.attributes.position) {
      triangles = geom.attributes.position.count / 3
    }

    if (geom.attributes.position) {
      size += geom.attributes.position.count * 3 * 4
    }
    if (geom.attributes.normal) {
      size += geom.attributes.normal.count * 3 * 4
    }
    if (geom.attributes.uv) {
      size += geom.attributes.uv.count * 2 * 4
    }

    geomStats = { triangles, size }
    geometryStatsCache.set(geom, geomStats)
  }

  let textureSize = 0
  if (mesh.material) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      for (const prop of TEXTURE_PROPS) {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[prop]
        if (tex) textureSize += estimateTextureBytes(tex)
      }
    }
  }

  return {
    triangles: geomStats.triangles,
    size: geomStats.size + textureSize
  }
}

/**
 * Single bottom-up pass over `root` (and descendants). Each object is visited once;
 * parent totals = local mesh + sum of children. Replaces the old per-node recursive
 * aggregation that re-walked every subtree (O(n²) on deep hierarchies).
 *
 * Optional `onVisit` is for tests / instrumentation.
 */
export function computeSubtreeStatsMap(
  root: THREE.Object3D,
  onVisit?: (obj: THREE.Object3D) => void
): Map<number, ObjectSubtreeStats> {
  const map = new Map<number, ObjectSubtreeStats>()

  const visit = (obj: THREE.Object3D): ObjectSubtreeStats => {
    onVisit?.(obj)

    let triangles = 0
    let size = 0

    if (obj instanceof THREE.Mesh) {
      const local = getLocalMeshStats(obj)
      triangles += local.triangles
      size += local.size
    }

    for (let i = 0; i < obj.children.length; i++) {
      const childStats = visit(obj.children[i])
      triangles += childStats.triangles
      size += childStats.size
    }

    const stats = { triangles, size }
    map.set(obj.id, stats)
    return stats
  }

  visit(root)
  return map
}

/**
 * Convenience: stats for one object including its full Three.js subtree.
 * Uses one bottom-up pass (not a nested re-aggregation per ancestor).
 */
export function getObjectSubtreeStats(obj: THREE.Object3D): ObjectSubtreeStats {
  return computeSubtreeStatsMap(obj).get(obj.id) ?? { triangles: 0, size: 0 }
}
