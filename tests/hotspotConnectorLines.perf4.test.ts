import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  indexHotspotsById,
  syncHotspotConnectorLines,
  updateHotspotConnectorLineGeometry,
  type HotspotConnectorSource
} from '../src/utils/hotspotConnectorLines'

function makeLine(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(a.x, a.y, a.z),
    new THREE.Vector3(b.x, b.y, b.z)
  ])
  return new THREE.Line(geometry, new THREE.LineBasicMaterial())
}

function makeHotspot(
  id: string,
  marker: { x: number; y: number; z: number },
  endpoint: { x: number; y: number; z: number }
): HotspotConnectorSource {
  return {
    id,
    position: marker,
    targetObjectId: `obj-${id}`,
    targetEndpointPosition: endpoint
  }
}

describe('PERF-4 hotspot connector lines', () => {
  it('indexes hotspots by id in linear time (O(H) map, O(1) lookup)', () => {
    const hotspots = Array.from({ length: 200 }, (_, i) =>
      makeHotspot(`h-${i}`, { x: i, y: 0, z: 0 }, { x: i, y: 1, z: 0 })
    )

    const byId = indexHotspotsById(hotspots)
    expect(byId.size).toBe(200)
    expect(byId.get('h-0')).toBe(hotspots[0])
    expect(byId.get('h-199')).toBe(hotspots[199])
    expect(byId.get('missing')).toBeUndefined()
  })

  it('does not mark buffers dirty when connector endpoints are unchanged', () => {
    const endpoint = { x: 1, y: 2, z: 3 }
    const marker = { x: 4, y: 5, z: 6 }
    const line = makeLine(endpoint, marker)
    const positions = line.geometry.attributes.position as THREE.BufferAttribute
    const versionBefore = positions.version

    const changed = updateHotspotConnectorLineGeometry(line, endpoint, marker)
    expect(changed).toBe(false)
    // Three.js needsUpdate is write-only; version bumps only on real uploads.
    expect(positions.version).toBe(versionBefore)
  })

  it('uploads only when endpoints actually change', () => {
    const line = makeLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })
    const positions = line.geometry.attributes.position as THREE.BufferAttribute
    const versionBefore = positions.version

    const changed = updateHotspotConnectorLineGeometry(
      line,
      { x: 2, y: 3, z: 4 },
      { x: 5, y: 6, z: 7 }
    )
    expect(changed).toBe(true)
    expect(positions.version).toBeGreaterThan(versionBefore)

    const arr = positions.array as Float32Array
    expect(Array.from(arr.slice(0, 6))).toEqual([2, 3, 4, 5, 6, 7])
  })

  it('sync scales with connector count using id index (not hotspots squared)', () => {
    const hotspots: HotspotConnectorSource[] = []
    const lines = new Map<string, THREE.Line>()

    // Many hotspots, few connectors — O(H²) find would thrash; map lookup stays linear in lines.
    for (let i = 0; i < 500; i++) {
      hotspots.push(
        makeHotspot(`h-${i}`, { x: i, y: 0, z: 0 }, { x: i, y: 1, z: 0 })
      )
    }
    for (let i = 0; i < 20; i++) {
      const id = `h-${i}`
      lines.set(
        id,
        makeLine({ x: i, y: 1, z: 0 }, { x: i, y: 0, z: 0 })
      )
    }

    const byId = indexHotspotsById(hotspots)

    // First sync: geometry already matches → zero uploads (static scene).
    expect(syncHotspotConnectorLines(lines, byId)).toBe(0)

    // Move one connector only → single upload.
    hotspots[3] = makeHotspot(
      'h-3',
      { x: 30, y: 0, z: 0 },
      { x: 30, y: 2, z: 0 }
    )
    const byIdAfter = indexHotspotsById(hotspots)
    expect(syncHotspotConnectorLines(lines, byIdAfter)).toBe(1)

    // Re-sync unchanged → still zero uploads.
    expect(syncHotspotConnectorLines(lines, byIdAfter)).toBe(0)
  })
})
