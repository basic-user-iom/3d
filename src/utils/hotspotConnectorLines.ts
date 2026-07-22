import * as THREE from 'three'

/** Minimal hotspot fields needed to sync connector line endpoints. */
export type HotspotConnectorSource = {
  id: string
  position: { x: number; y: number; z: number }
  targetObjectId?: string
  targetEndpointPosition?: { x: number; y: number; z: number }
}

/** Build an O(1) lookup map keyed by hotspot id. */
export function indexHotspotsById<T extends { id: string }>(hotspots: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (let i = 0; i < hotspots.length; i++) {
    const hotspot = hotspots[i]
    map.set(hotspot.id, hotspot)
  }
  return map
}

/**
 * Write connector endpoints into a line buffer only when values actually change.
 * Avoids Vector3 allocations and skips GPU uploads for static geometry.
 * Returns true when the position attribute was marked dirty.
 */
export function updateHotspotConnectorLineGeometry(
  line: THREE.Line,
  endpoint: { x: number; y: number; z: number },
  marker: { x: number; y: number; z: number }
): boolean {
  const geometry = line.geometry as THREE.BufferGeometry
  const positions = geometry.attributes.position as THREE.BufferAttribute | undefined
  if (!positions || positions.count < 2) return false

  const arr = positions.array as ArrayLike<number>
  if (
    arr[0] === endpoint.x &&
    arr[1] === endpoint.y &&
    arr[2] === endpoint.z &&
    arr[3] === marker.x &&
    arr[4] === marker.y &&
    arr[5] === marker.z
  ) {
    return false
  }

  positions.setXYZ(0, endpoint.x, endpoint.y, endpoint.z)
  positions.setXYZ(1, marker.x, marker.y, marker.z)
  positions.needsUpdate = true
  return true
}

/**
 * Sync all connector lines from an id-indexed hotspot map.
 * Cost is O(lines), not O(lines × hotspots). Returns how many buffers were uploaded.
 */
export function syncHotspotConnectorLines(
  lines: Map<string, THREE.Line>,
  hotspotsById: Map<string, HotspotConnectorSource>
): number {
  let uploads = 0
  for (const [hotspotId, line] of lines) {
    const hotspot = hotspotsById.get(hotspotId)
    if (!hotspot?.targetObjectId || !hotspot.targetEndpointPosition) continue
    if (
      updateHotspotConnectorLineGeometry(
        line,
        hotspot.targetEndpointPosition,
        hotspot.position
      )
    ) {
      uploads++
    }
  }
  return uploads
}
