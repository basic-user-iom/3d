import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import * as THREE from 'three'
import {
  StreetsGLBridge,
  STREETS_GL_MAX_MESH_PARTS
} from '../src/utils/streetsGLBridge'

/**
 * Minimal canvas stub so textureToDataURL can run in Node/vitest.
 */
function installCanvasStub() {
  class FakeCanvas {
    width = 0
    height = 0
    getContext() {
      return {
        clearRect: () => {},
        translate: () => {},
        scale: () => {},
        drawImage: () => {},
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4)
        }),
        putImageData: () => {}
      }
    }
    toDataURL(type?: string) {
      return `data:${type || 'image/png'};base64,STUB`
    }
  }
  vi.stubGlobal(
    'document',
    {
      createElement: (tag: string) => {
        if (tag === 'canvas') return new FakeCanvas()
        return {}
      }
    } as any
  )
}

function makeTexturedMesh(
  name: string,
  texture: THREE.Texture,
  uvs: number[]
): THREE.Mesh {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3)
  )
  geom.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex([0, 1, 2, 0, 2, 3])
  const mat = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = name
  return mesh
}

function makeSolidMesh(name: string, color: number): THREE.Mesh {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshStandardMaterial({ color })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = name
  return mesh
}

describe('StreetsGLBridge multi-material texture parts', () => {
  beforeAll(() => {
    installCanvasStub()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('splits meshes with different textures into separate parts (not one scrambled map)', () => {
    const texA = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
    texA.needsUpdate = true
    const texB = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1)
    texB.needsUpdate = true

    const root = new THREE.Group()
    root.add(makeTexturedMesh('wall', texA, [0, 0, 1, 0, 1, 1, 0, 1]))
    root.add(makeTexturedMesh('roof', texB, [0, 0, 2, 0, 2, 2, 0, 2]))

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(2)
    // DataTextures serialize via canvas stub in this environment
    expect(parts.filter((p) => !!p.baseColorTextureDataUrl).length).toBeGreaterThanOrEqual(1)

    // Each part keeps its own UV layout
    const uvLens = parts.map((p) => (p.geometry.uvs as Float32Array).length)
    expect(uvLens.every((n) => n > 0)).toBe(true)
  })

  it('merges meshes that share the same texture.uuid (valid shared atlas UVs)', () => {
    const shared = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    shared.needsUpdate = true

    const root = new THREE.Group()
    root.add(makeTexturedMesh('a', shared, [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5]))
    root.add(makeTexturedMesh('b', shared, [0.5, 0.5, 1, 0.5, 1, 1, 0.5, 1]))

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(1)
    // Two quads × 6 expanded verts × 2 components
    expect((parts[0].geometry.uvs as Float32Array).length).toBe(24)
  })

  it('fromThreeJSObject exposes parts on the payload for Streets GL', () => {
    const texA = new THREE.DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
    texA.needsUpdate = true
    const texB = new THREE.DataTexture(new Uint8Array([40, 50, 60, 255]), 1, 1)
    texB.needsUpdate = true

    const root = new THREE.Group()
    root.add(makeTexturedMesh('m1', texA, [0, 0, 1, 0, 1, 1, 0, 1]))
    root.add(makeTexturedMesh('m2', texB, [0, 0, 1, 0, 1, 1, 0, 1]))
    root.add(makeSolidMesh('trim', 0x334455))

    const payload = StreetsGLBridge.fromThreeJSObject(root, 'building-1')
    expect(payload.parts?.length).toBeGreaterThanOrEqual(2)
    expect(payload.metadata?.parts?.length).toBe(payload.parts?.length)
    expect(payload.geometry).toBeTruthy()
  })

  it('caps extreme material counts (Lumion-style) to STREETS_GL_MAX_MESH_PARTS', () => {
    const root = new THREE.Group()
    for (let i = 0; i < STREETS_GL_MAX_MESH_PARTS + 12; i++) {
      const tex = new THREE.DataTexture(new Uint8Array([i, i, i, 255]), 1, 1)
      tex.needsUpdate = true
      root.add(makeTexturedMesh(`mat-${i}`, tex, [0, 0, 1, 0, 1, 1, 0, 1]))
    }
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(STREETS_GL_MAX_MESH_PARTS)
    spy.mockRestore()
  })

  it('ensureGeometrySerializable preserves part geometries as TypedArrays', () => {
    const tex = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
    tex.needsUpdate = true
    const root = new THREE.Group()
    root.add(makeTexturedMesh('only', tex, [0, 0, 1, 0, 1, 1, 0, 1]))
    const payload = StreetsGLBridge.fromThreeJSObject(root, 'car')
    const serial = StreetsGLBridge.ensureGeometrySerializable(payload)
    expect(serial.parts?.[0].geometry.positions).toBeInstanceOf(Float32Array)
    expect(serial.parts?.[0].geometry.uvs).toBeInstanceOf(Float32Array)
    expect(serial.parts?.[0].geometry.indices).toBeInstanceOf(Uint32Array)
  })
})
