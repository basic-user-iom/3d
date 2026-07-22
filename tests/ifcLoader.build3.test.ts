/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { Color, FlatMesh, PlacedGeometry } from 'web-ifc'

import {
  buildThreeGroupFromIfcModel,
  createIfcMeshMaterial,
  ifcGeometryToBuffer,
  type IfcGeometrySource
} from '../src/viewer/loaders/ifcThreeAdapter'

function makeColor(r = 1, g = 0, b = 0, a = 1): Color {
  return { x: r, y: g, z: b, w: a }
}

function makeTriangleVertexData(): Float32Array {
  // Interleaved: pos(x,y,z) + normal(nx,ny,nz) per vertex
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1
  ])
}

describe('ifcThreeAdapter (BUILD-3)', () => {
  it('converts interleaved IFC vertex data into BufferGeometry attributes', () => {
    const geometry = ifcGeometryToBuffer(makeColor(0.2, 0.4, 0.6), makeTriangleVertexData(), new Uint32Array([0, 1, 2]))

    expect(geometry.getAttribute('position').count).toBe(3)
    expect(geometry.getAttribute('normal').count).toBe(3)
    expect(geometry.getAttribute('color').count).toBe(3)
    expect(geometry.getIndex()?.count).toBe(3)

    const color = geometry.getAttribute('color')
    expect(color.getX(0)).toBeCloseTo(0.2)
    expect(color.getY(0)).toBeCloseTo(0.4)
    expect(color.getZ(0)).toBeCloseTo(0.6)

    geometry.dispose()
  })

  it('caches materials by RGBA and marks transparent colors', () => {
    const cache = new Map<string, THREE.MeshPhongMaterial>()
    const opaque = createIfcMeshMaterial(makeColor(1, 0, 0, 1), cache)
    const opaqueAgain = createIfcMeshMaterial(makeColor(1, 0, 0, 1), cache)
    const transparent = createIfcMeshMaterial(makeColor(0, 1, 0, 0.4), cache)

    expect(opaqueAgain).toBe(opaque)
    expect(cache.size).toBe(2)
    expect(opaque.transparent).toBe(false)
    expect(transparent.transparent).toBe(true)
    expect(transparent.opacity).toBeCloseTo(0.4)
    expect(transparent.fog).toBe(false)

    opaque.dispose()
    transparent.dispose()
  })

  it('streams placed geometries into a Three group and deletes WASM geometry handles', () => {
    const deletedGeometryIds: number[] = []
    const deletedMeshes: number[] = []

    const placed: PlacedGeometry = {
      color: makeColor(0.5, 0.5, 0.5, 1),
      geometryExpressID: 42,
      flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]
    }

    const flatMesh: FlatMesh = {
      expressID: 7,
      geometries: {
        size: () => 1,
        get: () => placed,
        [Symbol.iterator]: function* () {
          yield placed
        }
      },
      delete: () => {
        deletedMeshes.push(7)
      }
    }

    const api: IfcGeometrySource = {
      GetGeometry: (_modelID, geometryExpressID) => ({
        GetVertexData: () => 0,
        GetVertexDataSize: () => 18,
        GetIndexData: () => 0,
        GetIndexDataSize: () => 3,
        delete: () => {
          deletedGeometryIds.push(geometryExpressID)
        }
      }),
      GetVertexArray: () => makeTriangleVertexData(),
      GetIndexArray: () => new Uint32Array([0, 1, 2]),
      StreamAllMeshes: (_modelID, callback) => {
        callback(flatMesh, 0, 1)
      }
    }

    const { root, meshCount, totalVertices } = buildThreeGroupFromIfcModel(api, 1)

    expect(meshCount).toBe(1)
    expect(totalVertices).toBe(3)
    expect(root.children).toHaveLength(1)
    expect(deletedGeometryIds).toEqual([42])
    expect(deletedMeshes).toEqual([7])

    const mesh = root.children[0] as THREE.Mesh
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(mesh.userData.expressID).toBe(7)
    expect(mesh.castShadow).toBe(true)
    expect(mesh.matrixAutoUpdate).toBe(false)
    expect(mesh.position.x).toBe(0) // transform lives on matrix, not position
    expect(mesh.matrix.elements[12]).toBeCloseTo(2)
    expect(mesh.matrix.elements[13]).toBeCloseTo(3)
    expect(mesh.matrix.elements[14]).toBeCloseTo(4)

    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
})

describe('loadIFC with mocked web-ifc (BUILD-3)', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('web-ifc')
    vi.restoreAllMocks()
  })

  it('loads ArrayBuffer IFC into a scene group and closes the WASM model', async () => {
    const closeModel = vi.fn()
    const init = vi.fn(async () => undefined)
    const setWasmPath = vi.fn()
    const openModel = vi.fn(() => 3)

    const placed: PlacedGeometry = {
      color: makeColor(1, 1, 1, 1),
      geometryExpressID: 9,
      flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }

    vi.doMock('web-ifc', () => ({
      IfcAPI: class {
        SetWasmPath = setWasmPath
        Init = init
        OpenModel = openModel
        CloseModel = closeModel
        GetGeometry = () => ({
          GetVertexData: () => 0,
          GetVertexDataSize: () => 18,
          GetIndexData: () => 0,
          GetIndexDataSize: () => 3,
          delete: vi.fn()
        })
        GetVertexArray = () => makeTriangleVertexData()
        GetIndexArray = () => new Uint32Array([0, 1, 2])
        StreamAllMeshes = (_modelID: number, callback: (mesh: FlatMesh, index: number, total: number) => void) => {
          callback(
            {
              expressID: 11,
              geometries: {
                size: () => 1,
                get: () => placed,
                [Symbol.iterator]: function* () {
                  yield placed
                }
              },
              delete: vi.fn()
            },
            0,
            1
          )
        }
      }
    }))

    const { loadIFC } = await import('../src/viewer/loaders/ifcLoader')
    const bytes = new TextEncoder().encode('ISO-10303-21;HEADER;ENDSEC;DATA;ENDSEC;').buffer

    const model = await loadIFC(bytes)

    expect(init).toHaveBeenCalledOnce()
    expect(setWasmPath).toHaveBeenCalled()
    expect(openModel).toHaveBeenCalledOnce()
    expect(closeModel).toHaveBeenCalledWith(3)
    expect(model.userData?.format).toBe('ifc')
    expect(model.scene).toBeInstanceOf(THREE.Group)
    expect(model.scene.children.length).toBeGreaterThan(0)
    expect(model.scene.userData.format).toBe('ifc')

    let meshCount = 0
    model.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++
    })
    expect(meshCount).toBe(1)
  })

  it('marks Revit download URLs so Streets GL hiding is skipped', async () => {
    vi.doMock('web-ifc', () => ({
      IfcAPI: class {
        SetWasmPath = vi.fn()
        Init = vi.fn(async () => undefined)
        OpenModel = vi.fn(() => 1)
        CloseModel = vi.fn()
        GetGeometry = () => ({
          GetVertexData: () => 0,
          GetVertexDataSize: () => 18,
          GetIndexData: () => 0,
          GetIndexDataSize: () => 3,
          delete: vi.fn()
        })
        GetVertexArray = () => makeTriangleVertexData()
        GetIndexArray = () => new Uint32Array([0, 1, 2])
        StreamAllMeshes = (_modelID: number, callback: (mesh: FlatMesh) => void) => {
          callback({
            expressID: 1,
            geometries: {
              size: () => 1,
              get: () => ({
                color: makeColor(),
                geometryExpressID: 1,
                flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
              }),
              [Symbol.iterator]: function* () {
                yield {
                  color: makeColor(),
                  geometryExpressID: 1,
                  flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
                }
              }
            },
            delete: vi.fn()
          })
        }
      }
    }))

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => new ArrayBuffer(8)
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { loadIFC } = await import('../src/viewer/loaders/ifcLoader')
    const model = await loadIFC('https://example.com/api/revit/download/model.ifc')

    expect(fetchMock).toHaveBeenCalled()
    expect(model.scene.userData.isRevitModel).toBe(true)
    expect(model.scene.userData.excludeFromStreetsGLHiding).toBe(true)
  })
})
