import * as THREE from 'three'
import { disposeSplatOverlay } from '../loaders/disposeSplatOverlay'

const TEXTURE_PROPERTIES = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
  'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
  'specularIntensityMap', 'specularColorMap', 'envMap', 'envMapIntensity'
]

function disposeMaterialTextures(material: THREE.Material): void {
  TEXTURE_PROPERTIES.forEach((prop) => {
    const texture = (material as any)[prop] as THREE.Texture | undefined
    if (texture instanceof THREE.Texture) {
      try {
        texture.dispose()
        ;(material as any)[prop] = null
      } catch {
        // Ignore disposal errors
      }
    }
  })

  Object.keys(material).forEach((key) => {
    const value = (material as any)[key]
    if (value instanceof THREE.Texture) {
      try {
        value.dispose()
        ;(material as any)[key] = null
      } catch {
        // Ignore disposal errors
      }
    }
  })
}

function disposeMeshResources(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry as THREE.BufferGeometry & {
    boundsTree?: unknown
    disposeBoundsTree?: () => void
  }

  if (geometry?.boundsTree && typeof geometry.disposeBoundsTree === 'function') {
    try {
      geometry.disposeBoundsTree()
    } catch {
      // Ignore BVH disposal errors
    }
  }

  if (geometry) {
    try {
      geometry.dispose()
    } catch {
      // Ignore geometry disposal errors
    }
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  materials.forEach((material) => {
    if (!(material instanceof THREE.Material)) return
    disposeMaterialTextures(material)
    try {
      material.dispose()
    } catch {
      // Ignore material disposal errors
    }
  })
}

/**
 * Dispose GPU resources held by an object subtree (geometries, materials, textures).
 */
export function disposeObject3DSubtree(root: THREE.Object3D): void {
  disposeSplatOverlay(root)
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      disposeMeshResources(child)
    }
  })
}
