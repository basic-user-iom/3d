import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import {
  createPointCloudMaterial,
  applyPointCloudRenderMode
} from '../src/viewer/pointCloud/pointCloudRendering'

function makePointCloud(size = 0.02): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0], 3))
  const points = new THREE.Points(geometry, createPointCloudMaterial('points', { hasVertexColors: true, size }))
  points.userData.isPointCloud = true
  points.userData.pointCloudBaseSize = size
  points.userData.pointCloudHasVertexColors = true
  return points
}

describe('createPointCloudMaterial', () => {
  test('points mode is opaque and writes depth', () => {
    const mat = createPointCloudMaterial('points', { hasVertexColors: true, size: 0.01 })
    expect(mat).toBeInstanceOf(THREE.PointsMaterial)
    expect(mat.transparent).toBe(false)
    expect(mat.depthWrite).toBe(true)
    expect(mat.vertexColors).toBe(true)
  })

  test('gaussian mode is transparent, skips depth write, and injects a falloff shader', () => {
    const mat = createPointCloudMaterial('gaussian', { hasVertexColors: true, size: 0.01 })
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
    expect(typeof mat.onBeforeCompile).toBe('function')

    // Verify the shader patch actually rewrites the points fragment shader.
    const shader = { fragmentShader: 'void main() {\n#include <color_fragment>\n}' } as any
    mat.onBeforeCompile(shader, {} as any)
    expect(shader.fragmentShader).toContain('gl_PointCoord')
    expect(shader.fragmentShader).toContain('discard')
  })
})

describe('applyPointCloudRenderMode', () => {
  test('swaps point cloud materials to the requested mode and scales size', () => {
    const root = new THREE.Group()
    const points = makePointCloud(0.02)
    root.add(points)

    const updated = applyPointCloudRenderMode(root, 'gaussian', 3)

    expect(updated).toBe(1)
    expect(points.userData.pointCloudRenderMode).toBe('gaussian')
    const mat = points.material as THREE.PointsMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.size).toBeCloseTo(0.06, 5) // baseSize (0.02) * scale (3)
  })

  test('ignores meshes and non point-cloud objects', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    mesh.userData.isModel = true
    root.add(mesh)

    const updated = applyPointCloudRenderMode(root, 'gaussian', 1)
    expect(updated).toBe(0)
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
  })
})
