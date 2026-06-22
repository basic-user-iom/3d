import * as THREE from 'three'

export type PointCloudRenderMode = 'points' | 'gaussian'

export interface PointCloudMaterialOptions {
  hasVertexColors: boolean
  /** World-space point size (already includes any user scale factor). */
  size: number
}

/**
 * Builds the material used to render a point cloud.
 *
 * - `points`   : classic opaque square dots (THREE.PointsMaterial defaults).
 * - `gaussian` : a Gaussian-splat-style projection. Each point is drawn as a
 *   soft, round sprite with an exponential alpha falloff and additive-friendly
 *   blending, approximating surface/EWA splatting. This is NOT true 3D Gaussian
 *   Splatting (a plain XYZ+RGB cloud lacks per-point covariance/SH data), but it
 *   gives the soft, surface-like look people expect from a splat render.
 */
export function createPointCloudMaterial(
  mode: PointCloudRenderMode,
  options: PointCloudMaterialOptions
): THREE.PointsMaterial {
  const { hasVertexColors, size } = options

  const material = new THREE.PointsMaterial({
    color: hasVertexColors ? 0xffffff : 0xcccccc,
    vertexColors: hasVertexColors,
    size,
    sizeAttenuation: true,
    fog: false
  })

  if (mode === 'gaussian') {
    material.transparent = true
    material.depthWrite = false
    material.depthTest = true

    // Inject a circular Gaussian falloff into the points fragment shader while
    // keeping Three's built-in point sizing, vertex colors and fog handling.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 _gsCoord = gl_PointCoord - vec2(0.5);
          float _gsR2 = dot(_gsCoord, _gsCoord);
          if (_gsR2 > 0.25) discard;
          // exp(-r^2 * 8) -> 1.0 at center, ~0.135 at the disc edge.
          diffuseColor.a *= exp(-_gsR2 * 8.0);
        }`
      )
    }
    material.needsUpdate = true
  }

  return material
}

/**
 * Swaps the material on every point cloud in the given subtree to match the
 * requested render mode and size scale. Disposes the materials it replaces.
 */
export function applyPointCloudRenderMode(
  root: THREE.Object3D | null | undefined,
  mode: PointCloudRenderMode,
  sizeScale = 1
): number {
  if (!root || typeof root.traverse !== 'function') {
    return 0
  }

  let updated = 0
  root.traverse((obj) => {
    const points = obj as THREE.Points
    if (!(points as any).isPoints || obj.userData?.isPointCloud !== true) {
      return
    }

    const baseSize =
      typeof obj.userData.pointCloudBaseSize === 'number'
        ? obj.userData.pointCloudBaseSize
        : (points.material as THREE.PointsMaterial)?.size ?? 0.01
    const hasVertexColors =
      typeof obj.userData.pointCloudHasVertexColors === 'boolean'
        ? obj.userData.pointCloudHasVertexColors
        : !!points.geometry?.getAttribute('color')

    const previous = points.material as THREE.Material | THREE.Material[] | undefined

    points.material = createPointCloudMaterial(mode, {
      hasVertexColors,
      size: Math.max(baseSize * sizeScale, 1e-5)
    })
    obj.userData.pointCloudRenderMode = mode
    updated += 1

    const oldMaterials = Array.isArray(previous) ? previous : previous ? [previous] : []
    oldMaterials.forEach((mat) => {
      if (mat && typeof (mat as any).dispose === 'function') {
        ;(mat as any).dispose()
      }
    })
  })

  return updated
}
