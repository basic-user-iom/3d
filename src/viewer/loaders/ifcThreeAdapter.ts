/**
 * Isolated web-ifc → Three.js geometry adapter.
 *
 * Replaces the abandoned `web-ifc-three` package (peer three@^0.149.0) with a
 * thin converter that targets the project's Three.js version directly.
 * Geometry streaming/conversion follows ThatOpen's maintained web-ifc viewer example.
 */

import * as THREE from 'three'
import type { Color, FlatMesh, IfcAPI, PlacedGeometry } from 'web-ifc'

export interface IfcAdapterLoadResult {
  /** Root group containing opaque/transparent IFC meshes. */
  root: THREE.Group
  meshCount: number
  totalVertices: number
}

export interface IfcGeometrySource {
  GetGeometry(modelID: number, geometryExpressID: number): {
    GetVertexData(): number
    GetVertexDataSize(): number
    GetIndexData(): number
    GetIndexDataSize(): number
    delete(): void
  }
  GetVertexArray(ptr: number, size: number): Float32Array
  GetIndexArray(ptr: number, size: number): Uint32Array
  StreamAllMeshes(
    modelID: number,
    meshCallback: (mesh: FlatMesh, index: number, total: number) => void
  ): void
}

/** Convert interleaved web-ifc vertex data (pos+normal) into a BufferGeometry. */
export function ifcGeometryToBuffer(
  color: Color,
  vertexData: Float32Array,
  indexData: Uint32Array
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertexCount = vertexData.length / 6
  const posFloats = new Float32Array(vertexCount * 3)
  const normFloats = new Float32Array(vertexCount * 3)
  const colorFloats = new Float32Array(vertexCount * 3)

  for (let i = 0; i < vertexData.length; i += 6) {
    const dst = (i / 6) * 3
    posFloats[dst] = vertexData[i]
    posFloats[dst + 1] = vertexData[i + 1]
    posFloats[dst + 2] = vertexData[i + 2]
    normFloats[dst] = vertexData[i + 3]
    normFloats[dst + 1] = vertexData[i + 4]
    normFloats[dst + 2] = vertexData[i + 5]
    colorFloats[dst] = color.x
    colorFloats[dst + 1] = color.y
    colorFloats[dst + 2] = color.z
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(posFloats, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normFloats, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colorFloats, 3))
  geometry.setIndex(new THREE.BufferAttribute(indexData, 1))
  return geometry
}

export function createIfcMeshMaterial(color: Color, cache: Map<string, THREE.MeshPhongMaterial>): THREE.MeshPhongMaterial {
  const colID = `${color.x},${color.y},${color.z},${color.w}`
  const existing = cache.get(colID)
  if (existing) return existing

  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(color.x, color.y, color.z),
    side: THREE.DoubleSide,
    vertexColors: true,
    fog: false
  })
  material.transparent = color.w !== 1
  if (material.transparent) {
    material.opacity = color.w
    material.depthWrite = false
  }
  cache.set(colID, material)
  return material
}

function placedGeometryToMesh(
  ifcAPI: IfcGeometrySource,
  modelID: number,
  placedGeometry: PlacedGeometry,
  materialCache: Map<string, THREE.MeshPhongMaterial>
): THREE.Mesh {
  const geometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID)
  try {
    const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
    const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
    const bufferGeometry = ifcGeometryToBuffer(placedGeometry.color, verts, indices)
    const material = createIfcMeshMaterial(placedGeometry.color, materialCache)
    const mesh = new THREE.Mesh(bufferGeometry, material)
    mesh.matrix.fromArray(placedGeometry.flatTransformation)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrixWorld(true)
    return mesh
  } finally {
    geometry.delete()
  }
}

/**
 * Stream all IFC meshes for a model into a Three.js group.
 * Caller owns closing the model via IfcAPI.CloseModel after this returns.
 */
export function buildThreeGroupFromIfcModel(
  ifcAPI: IfcGeometrySource,
  modelID: number
): IfcAdapterLoadResult {
  const root = new THREE.Group()
  root.name = 'IFCModel'
  const materialCache = new Map<string, THREE.MeshPhongMaterial>()
  let meshCount = 0
  let totalVertices = 0

  ifcAPI.StreamAllMeshes(modelID, (flatMesh: FlatMesh) => {
    const placedGeometries = flatMesh.geometries
    const expressID = flatMesh.expressID

    for (let i = 0; i < placedGeometries.size(); i++) {
      const placedGeometry = placedGeometries.get(i)
      const mesh = placedGeometryToMesh(ifcAPI, modelID, placedGeometry, materialCache)
      mesh.userData.expressID = expressID
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.visible = true

      const position = mesh.geometry.getAttribute('position')
      if (position) totalVertices += position.count

      root.add(mesh)
      meshCount++
    }

    flatMesh.delete()
  })

  return { root, meshCount, totalVertices }
}

/** Convenience typed alias for callers that pass a real IfcAPI instance. */
export type IfcApiLike = Pick<
  IfcAPI,
  'GetGeometry' | 'GetVertexArray' | 'GetIndexArray' | 'StreamAllMeshes'
>
