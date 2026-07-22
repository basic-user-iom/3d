import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  StreetsGLBridge,
  STREETS_GL_MAX_VERTICES
} from '../src/utils/streetsGLBridge'
import { validateExternalObjectGeometry } from '../src/utils/streetsGLBridgeSecurity'
import { forceReduceToTriangleBudget, simpleDecimation } from '../src/utils/geometryRepair'

function makeIframe(): HTMLIFrameElement {
  const postMessage = vi.fn()
  return {
    src: 'http://localhost:8081/?sgb=0123456789abcdef0123456789abcdef&parent=http%3A%2F%2Flocalhost%3A3000',
    contentWindow: { postMessage }
  } as unknown as HTMLIFrameElement
}

function makeDenseSphere(segments = 64): THREE.Object3D {
  const root = new THREE.Group()
  root.name = 'dense-test'
  const geom = new THREE.SphereGeometry(1, segments, segments)
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x888888 }))
  mesh.name = 'mesh_0'
  root.add(mesh)
  return root
}

describe('StreetsGLBridge vertex budget + simplify', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(handler)
      },
      removeEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
        listeners.get(type)?.delete(handler)
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('extractMeshPartsFromThreeJS keeps expanded geometry under the SEC-5 vertex budget', () => {
    // High-segment sphere expands well over the budget without simplification
    // (expanded verts ≈ tris × 3 after material-part extraction).
    const root = makeDenseSphere(320)
    let sourceTris = 0
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const g = mesh.geometry
      sourceTris += g.index
        ? Math.floor(g.index.count / 3)
        : Math.floor(g.attributes.position.count / 3)
    })
    expect(sourceTris * 3).toBeGreaterThan(STREETS_GL_MAX_VERTICES)

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    const totalVerts = parts.reduce(
      (sum, p) => sum + Math.floor((p.geometry.positions?.length || 0) / 3),
      0
    )
    expect(parts.length).toBeGreaterThan(0)
    expect(totalVerts).toBeGreaterThan(0)
    expect(totalVerts).toBeLessThanOrEqual(STREETS_GL_MAX_VERTICES)

    const obj = StreetsGLBridge.fromThreeJSObject(root, 'budget-ok')
    const validation = validateExternalObjectGeometry(
      StreetsGLBridge.ensureGeometrySerializable(obj)
    )
    expect(validation.ok).toBe(true)
    expect(validation.vertexCount).toBeLessThanOrEqual(STREETS_GL_MAX_VERTICES)
  })

  it('addObject fails immediately on over-budget geometry (no OBJECT_ADDED timeout hang)', async () => {
    const iframe = makeIframe()
    const bridge = new StreetsGLBridge(iframe)
    ;(bridge as any).bridgeReady = true

    const overBudget = {
      id: 'too-big',
      type: 'custom' as const,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      geometry: {
        positions: new Float32Array((STREETS_GL_MAX_VERTICES + 10) * 3)
      },
      metadata: { name: 'OverBudget' }
    }

    const result = await bridge.addObject(overBudget)
    expect(result.success).toBe(false)
    expect(result.queued).toBe(false)
    expect(iframe.contentWindow!.postMessage).not.toHaveBeenCalled()

    bridge.dispose()
  })

  it('bridgeProxy simpleDecimation reduces when normal mode would skip/fail validation', () => {
    // Non-manifold-ish fan: many triangles sharing edges unevenly after aggressive cut.
    const positions: number[] = []
    const indices: number[] = []
    // Create a flat disk of triangles (open boundary → high boundary-edge ratio after cut)
    const rings = 24
    positions.push(0, 0, 0)
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2
      positions.push(Math.cos(a), 0, Math.sin(a))
      indices.push(0, 1 + i, 1 + ((i + 1) % rings))
    }
    // Extra fine detail ring (tiny tris) to trip fine-detail skip in normal mode
    const base = positions.length / 3
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2
      positions.push(Math.cos(a) * 1.01, 0, Math.sin(a) * 1.01)
      indices.push(1 + i, base + i, base + ((i + 1) % rings))
      indices.push(1 + i, base + ((i + 1) % rings), 1 + ((i + 1) % rings))
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()

    const target = Math.max(4, Math.floor(indices.length / 3 / 4))
    const proxy = simpleDecimation(geom, target, 'disk', { bridgeProxy: true })
    expect(proxy).not.toBeNull()
    expect(proxy!.index!.count / 3).toBeLessThanOrEqual(target + 1)

    const forced = forceReduceToTriangleBudget(geom, target, 'disk')
    expect(forced).not.toBeNull()
    expect(forced!.index!.count / 3).toBeLessThanOrEqual(target)
  })

  it('reducePartsToVertexBudget thins oversized expanded parts', () => {
    const triCount = Math.floor(STREETS_GL_MAX_VERTICES / 3) + 5000
    const positions = new Float32Array(triCount * 9)
    const indices = new Uint32Array(triCount * 3)
    for (let t = 0; t < triCount; t++) {
      const base = t * 3
      // Spread triangles so area sort has signal
      const x = (t % 100) * 0.1
      const z = Math.floor(t / 100) * 0.1
      const scale = 1 + (t % 7) * 0.2
      positions[base * 3] = x
      positions[base * 3 + 1] = 0
      positions[base * 3 + 2] = z
      positions[(base + 1) * 3] = x + scale
      positions[(base + 1) * 3 + 1] = 0
      positions[(base + 1) * 3 + 2] = z
      positions[(base + 2) * 3] = x
      positions[(base + 2) * 3 + 1] = 0
      positions[(base + 2) * 3 + 2] = z + scale
      indices[t * 3] = base
      indices[t * 3 + 1] = base + 1
      indices[t * 3 + 2] = base + 2
    }

    const parts = [
      {
        geometry: {
          positions,
          normals: new Float32Array(positions.length),
          uvs: new Float32Array((positions.length / 3) * 2),
          indices
        },
        color: { r: 1, g: 1, b: 1 }
      }
    ]

    const before = Math.floor(positions.length / 3)
    expect(before).toBeGreaterThan(STREETS_GL_MAX_VERTICES)

    const reduced = StreetsGLBridge.reducePartsToVertexBudget(parts)
    const after = reduced.reduce(
      (sum, p) => sum + Math.floor((p.geometry.positions?.length || 0) / 3),
      0
    )
    expect(after).toBeLessThanOrEqual(STREETS_GL_MAX_VERTICES)
    expect(after).toBeGreaterThan(0)
  })
})
