import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import { loadPLY } from '../src/viewer/loaders/plyLoader'

function toArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

const POINT_CLOUD_PLY = [
  'ply',
  'format ascii 1.0',
  'comment Created by CloudCompare',
  'element vertex 3',
  'property float x',
  'property float y',
  'property float z',
  'property uchar red',
  'property uchar green',
  'property uchar blue',
  'end_header',
  '0 0 0 255 0 0',
  '1 0 0 0 255 0',
  '0 1 0 0 0 255',
  ''
].join('\n')

const MESH_PLY = [
  'ply',
  'format ascii 1.0',
  'element vertex 3',
  'property float x',
  'property float y',
  'property float z',
  'element face 1',
  'property list uchar int vertex_indices',
  'end_header',
  '0 0 0',
  '1 0 0',
  '0 1 0',
  '3 0 1 2',
  ''
].join('\n')

describe('loadPLY point cloud handling', () => {
  test('renders a face-less PLY as a colored point cloud, not a mesh', async () => {
    const model = await loadPLY(toArrayBuffer(POINT_CLOUD_PLY))

    expect(model.userData?.isPointCloud).toBe(true)

    const child = model.scene.children[0]
    expect(child).toBeInstanceOf(THREE.Points)
    expect(child).not.toBeInstanceOf(THREE.Mesh)

    const material = (child as THREE.Points).material as THREE.PointsMaterial
    expect(material).toBeInstanceOf(THREE.PointsMaterial)
    expect(material.vertexColors).toBe(true)
    expect(material.size).toBeGreaterThan(0)
  })

  test('still renders a PLY with faces as a mesh', async () => {
    const model = await loadPLY(toArrayBuffer(MESH_PLY))

    expect(model.userData?.isPointCloud).toBe(false)

    const child = model.scene.children[0]
    expect(child).toBeInstanceOf(THREE.Mesh)
    expect(child).not.toBeInstanceOf(THREE.Points)
  })
})
