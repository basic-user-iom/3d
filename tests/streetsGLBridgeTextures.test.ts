import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import {
  StreetsGLBridge,
  STREETS_GL_MAX_MESH_PARTS,
  STREETS_GL_MAX_TEXTURE_SIZE
} from '../src/utils/streetsGLBridge'
import {
  STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES,
  STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS,
  STREETS_GL_BRIDGE_MAX_TOTAL_TEXTURE_BYTES,
  validateExternalObjectGeometry
} from '../src/utils/streetsGLBridgeSecurity'

type CanvasRecord = { width: number; height: number; mime?: string; quality?: number }

/**
 * Minimal canvas stub so textureToDataURL / serializeTextureForBridge can run in Node/vitest.
 * Tracks last encode size/mime for quality assertions.
 */
function installCanvasStub(records: CanvasRecord[] = []) {
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
    toDataURL(type?: string, quality?: number) {
      records.push({ width: this.width, height: this.height, mime: type, quality })
      // Valid tiny base64 payload so dataUrlToArrayBuffer succeeds.
      return `data:${type || 'image/png'};base64,U1RVQg==`
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

/** Build a valid-looking JPEG data URL whose decoded byte length ≈ targetBytes. */
function oversizedJpegDataUrl(targetBytes: number, type = 'image/jpeg'): string {
  const b64Len = Math.ceil(targetBytes / 3) * 4
  return `data:${type};base64,` + 'A'.repeat(b64Len)
}

describe('StreetsGLBridge texture serialization quality', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('caps long-edge at STREETS_GL_MAX_TEXTURE_SIZE (4k) and prefers JPEG for opaque maps', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)

    // Undersized buffer is fine — stub putImageData never samples full texels.
    const tex = new THREE.DataTexture(new Uint8Array(4), 8192, 8192)
    tex.needsUpdate = true
    const serialized = StreetsGLBridge.serializeTextureForBridge(tex)
    expect(serialized).toBeTruthy()
    expect(serialized!.mime).toBe('image/jpeg')
    expect(serialized!.bytes).toBeInstanceOf(ArrayBuffer)
    expect(STREETS_GL_MAX_TEXTURE_SIZE).toBe(4096)
    expect(records.length).toBeGreaterThan(0)
    const last = records[records.length - 1]
    expect(Math.max(last.width, last.height)).toBe(STREETS_GL_MAX_TEXTURE_SIZE)
    expect(last.mime).toBe('image/jpeg')
  })

  it('uses PNG when forcePng is set (transparent materials)', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const tex = new THREE.DataTexture(new Uint8Array(4), 64, 64)
    tex.needsUpdate = true
    const serialized = StreetsGLBridge.serializeTextureForBridge(tex, STREETS_GL_MAX_TEXTURE_SIZE, {
      forcePng: true
    })
    expect(serialized!.mime).toBe('image/png')
    expect(records[records.length - 1].mime).toBe('image/png')
  })

  it('prefers binary bytes over data-URL for bridge parts (avoids base64 bloat)', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const tex = new THREE.DataTexture(new Uint8Array(4), 1024, 1024)
    tex.needsUpdate = true
    const root = new THREE.Group()
    root.add(makeTexturedMesh('wall', tex, [0, 0, 1, 0, 1, 1, 0, 1]))
    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(1)
    expect(parts[0].baseColorTextureBytes).toBeInstanceOf(ArrayBuffer)
    expect(parts[0].baseColorTextureMime).toBe('image/jpeg')
    expect((parts[0].baseColorTextureBytes as ArrayBuffer).byteLength).toBeGreaterThan(0)
  })

  it('downscales further when compressed bytes would exceed SEC texture byte budget', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    // Override toDataURL to emit oversized payloads until canvas is small enough
    const doc = (globalThis as any).document
    const origCreate = doc.createElement.bind(doc)
    doc.createElement = (tag: string) => {
      const canvas = origCreate(tag)
      if (tag === 'canvas') {
        canvas.toDataURL = (type?: string, quality?: number) => {
          records.push({ width: canvas.width, height: canvas.height, mime: type, quality })
          const edge = Math.max(canvas.width, canvas.height)
          if (edge > 512) {
            // Base64 length ≈ 4/3 of bytes; exceed MAX_TEXTURE_BYTES after decode.
            return oversizedJpegDataUrl(STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES + 1024, type || 'image/jpeg')
          }
          return `data:${type || 'image/jpeg'};base64,T0s=`
        }
      }
      return canvas
    }

    const tex = new THREE.DataTexture(new Uint8Array(4), 4096, 4096)
    tex.needsUpdate = true
    const serialized = StreetsGLBridge.serializeTextureForBridge(tex, 4096)
    expect(serialized).toBeTruthy()
    expect(serialized!.bytes!.byteLength).toBeLessThanOrEqual(STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES)
    expect(records.some((r) => Math.max(r.width, r.height) <= 512)).toBe(true)
  })

  it('quality-backoff before edge downscale when JPEG is over per-texture budget', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const doc = (globalThis as any).document
    const origCreate = doc.createElement.bind(doc)
    doc.createElement = (tag: string) => {
      const canvas = origCreate(tag)
      if (tag === 'canvas') {
        canvas.toDataURL = (type?: string, quality?: number) => {
          records.push({ width: canvas.width, height: canvas.height, mime: type, quality })
          const q = typeof quality === 'number' ? quality : 1
          // High quality overflows; lower quality fits at full edge.
          if (q > 0.7) {
            return oversizedJpegDataUrl(STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES + 2048, type || 'image/jpeg')
          }
          return `data:${type || 'image/jpeg'};base64,T0s=`
        }
      }
      return canvas
    }

    const tex = new THREE.DataTexture(new Uint8Array(4), 4096, 4096)
    tex.needsUpdate = true
    const serialized = StreetsGLBridge.serializeTextureForBridge(tex, 4096)
    expect(serialized).toBeTruthy()
    expect(Math.max(serialized!.width, serialized!.height)).toBe(4096)
    expect(records.some((r) => typeof r.quality === 'number' && r.quality <= 0.7)).toBe(true)
    expect(records.every((r) => Math.max(r.width, r.height) === 4096)).toBe(true)
  })

  it('omits oversized data URLs when binary bytes fit (legacy char budget)', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const doc = (globalThis as any).document
    const origCreate = doc.createElement.bind(doc)
    doc.createElement = (tag: string) => {
      const canvas = origCreate(tag)
      if (tag === 'canvas') {
        canvas.toDataURL = (type?: string) => {
          records.push({ width: canvas.width, height: canvas.height, mime: type })
          // Decodes to a few KB (under byte budget) but string exceeds data-URL char cap.
          const b64 =
            'A'.repeat(STREETS_GL_BRIDGE_MAX_TEXTURE_DATA_URL_CHARS + 16)
          return `data:${type || 'image/jpeg'};base64,${b64}`
        }
      }
      return canvas
    }

    const tex = new THREE.DataTexture(new Uint8Array(4), 2048, 2048)
    tex.needsUpdate = true
    const serialized = StreetsGLBridge.serializeTextureForBridge(tex, 2048)
    expect(serialized).toBeTruthy()
    expect(serialized!.bytes).toBeInstanceOf(ArrayBuffer)
    expect(serialized!.dataUrl).toBeUndefined()
  })

  it('textureToDataURL never returns a string over the SEC char budget', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const doc = (globalThis as any).document
    const origCreate = doc.createElement.bind(doc)
    doc.createElement = (tag: string) => {
      const canvas = origCreate(tag)
      if (tag === 'canvas') {
        canvas.toDataURL = (type?: string) => {
          records.push({ width: canvas.width, height: canvas.height, mime: type })
          // Bytes fit per-texture budget (~3MB) but base64 string exceeds char cap.
          return oversizedJpegDataUrl(3_000_000, type || 'image/jpeg')
        }
      }
      return canvas
    }

    const tex = new THREE.DataTexture(new Uint8Array(4), 4096, 4096)
    tex.needsUpdate = true
    const dataUrl = StreetsGLBridge.textureToDataURL(tex, 4096)
    expect(dataUrl).toBeUndefined()

    const payload = StreetsGLBridge.fromThreeJSObject(
      (() => {
        const root = new THREE.Group()
        root.add(makeTexturedMesh('tower', tex, [0, 0, 1, 0, 1, 1, 0, 1]))
        return root
      })(),
      'meshy-tower'
    )
    // Must not poison metadata with a rebuilt oversized data URL (the d3ede81 reject).
    expect(payload.metadata?.baseColorTextureDataUrl).toBeUndefined()
    expect(payload.parts?.[0]?.baseColorTextureBytes).toBeInstanceOf(ArrayBuffer)
    const validation = validateExternalObjectGeometry(payload)
    expect(validation.ok).toBe(true)
  })

  it('auto-reduces largest textures when aggregate payload exceeds total budget', () => {
    const records: CanvasRecord[] = []
    installCanvasStub(records)
    const doc = (globalThis as any).document
    const origCreate = doc.createElement.bind(doc)
    doc.createElement = (tag: string) => {
      const canvas = origCreate(tag)
      if (tag === 'canvas') {
        canvas.toDataURL = (type?: string) => {
          records.push({ width: canvas.width, height: canvas.height, mime: type })
          const edge = Math.max(canvas.width, canvas.height)
          // Each 4k map is ~7MB (under per-texture 8MB) but two exceed 12MB total.
          // Half edge drops to ~2MB so aggregate fits after reducing the largest.
          if (edge >= 4096) {
            return oversizedJpegDataUrl(7_000_000, type || 'image/jpeg')
          }
          if (edge >= 2048) {
            return oversizedJpegDataUrl(2_000_000, type || 'image/jpeg')
          }
          return `data:${type || 'image/jpeg'};base64,T0s=`
        }
      }
      return canvas
    }

    const texA = new THREE.DataTexture(new Uint8Array(4), 8192, 8192)
    texA.needsUpdate = true
    const texB = new THREE.DataTexture(new Uint8Array(4), 4096, 4096)
    texB.needsUpdate = true
    const root = new THREE.Group()
    root.add(makeTexturedMesh('body', texA, [0, 0, 1, 0, 1, 1, 0, 1]))
    root.add(makeTexturedMesh('detail', texB, [0, 0, 1, 0, 1, 1, 0, 1]))

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(2)
    const total = parts.reduce(
      (sum, p) => sum + ((p.baseColorTextureBytes as ArrayBuffer | undefined)?.byteLength || 0),
      0
    )
    expect(total).toBeLessThanOrEqual(STREETS_GL_BRIDGE_MAX_TOTAL_TEXTURE_BYTES)
    expect(records.some((r) => Math.max(r.width, r.height) <= 2048)).toBe(true)

    const payload = StreetsGLBridge.fromThreeJSObject(root, 'meshy-8k-4k')
    expect(validateExternalObjectGeometry(payload).ok).toBe(true)
  })

  it('validateExternalObjectGeometry accepts binary textures under byte budget', () => {
    const bytes = new ArrayBuffer(1024)
    const ok = validateExternalObjectGeometry({
      id: 'tex-bin',
      parts: [
        {
          geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
          baseColorTextureBytes: bytes,
          baseColorTextureMime: 'image/jpeg'
        }
      ]
    })
    expect(ok.ok).toBe(true)

    const tooBig = validateExternalObjectGeometry({
      id: 'tex-bin-big',
      parts: [
        {
          geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
          baseColorTextureBytes: new ArrayBuffer(STREETS_GL_BRIDGE_MAX_TEXTURE_BYTES + 1)
        }
      ]
    })
    expect(tooBig.ok).toBe(false)
    expect(tooBig.error).toMatch(/texture payload/i)
  })

  it('validateExternalObjectGeometry rejects absolute oversize aggregate cleanly', () => {
    const half = Math.floor(STREETS_GL_BRIDGE_MAX_TOTAL_TEXTURE_BYTES / 2) + 100_000
    const rejected = validateExternalObjectGeometry({
      id: 'agg-big',
      parts: [
        {
          geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
          baseColorTextureBytes: new ArrayBuffer(half)
        },
        {
          geometry: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
          baseColorTextureBytes: new ArrayBuffer(half)
        }
      ]
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/texture payload/i)
  })
})

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
    expect(
      parts.filter((p) => !!p.baseColorTextureDataUrl || !!p.baseColorTextureBytes).length
    ).toBeGreaterThanOrEqual(1)

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

  it('multi-material mesh with geometry.groups keeps per-texture UVs after force reduce path', () => {
    // Two materials on one BufferGeometry with groups — the bug that scrambled UVs
    // when simplify rewrote indices but left stale group ranges.
    const positions = new Float32Array([
      // tri A
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // tri B
      2, 0, 0, 3, 0, 0, 2, 1, 0
    ])
    const uvs = new Float32Array([
      0, 0, 0.4, 0, 0.2, 0.4,
      0.6, 0.6, 1, 0.6, 0.8, 1
    ])
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geom.setIndex([0, 1, 2, 3, 4, 5])
    geom.addGroup(0, 3, 0)
    geom.addGroup(3, 3, 1)

    const texA = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
    texA.needsUpdate = true
    const texB = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1)
    texB.needsUpdate = true

    const mesh = new THREE.Mesh(geom, [
      new THREE.MeshStandardMaterial({ map: texA }),
      new THREE.MeshStandardMaterial({ map: texB })
    ])
    const root = new THREE.Group()
    root.add(mesh)

    const parts = StreetsGLBridge.extractMeshPartsFromThreeJS(root)
    expect(parts.length).toBe(2)
    for (const part of parts) {
      const vc = Math.floor((part.geometry.positions?.length || 0) / 3)
      expect((part.geometry.uvs as Float32Array).length).toBe(vc * 2)
      const partUvs = part.geometry.uvs as Float32Array
      // Each part should carry its own UV region (not all zeros)
      expect(partUvs.some((v) => Math.abs(v) > 1e-6)).toBe(true)
    }
  })
})
