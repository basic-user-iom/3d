import * as THREE from 'three'
import { resolveGroundProjectionActive } from '../viewer/utils/hdrGroundShadowCatcher'
import { isLightVisualOrControl } from '../viewer/utils/lightGizmos'
import { useAppStore } from '../store/useAppStore'

/**
 * Auto-fix common shadow issues in the scene
 */
export interface ShadowFixResult {
  fixesApplied: string[]
  materialsConverted: number
  meshesFixed: number
  errors: string[]
}

function isEligibleShadowMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  if (!(obj instanceof THREE.Mesh)) return false
  if (obj.userData.isShadowPlane || obj.userData.isGridHelper || obj.userData.isAxesHelper) {
    return false
  }
  if (isLightVisualOrControl(obj)) return false
  const objType = obj.constructor?.name || obj.type || ''
  if (objType.includes('Helper') || objType.includes('Control') || objType.includes('Gizmo')) {
    return false
  }
  return true
}

/**
 * Automatically fix shadow issues in the scene.
 *
 * Intentionally does NOT convert MeshBasicMaterial → MeshStandardMaterial.
 * That conversion was a false-positive hammer on Pagani unlit materials and on
 * light-gizmo child meshes (spot cones / point spheres), which then cast weird
 * shadows when a light was selected.
 */
export function autoFixShadowIssues(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): ShadowFixResult {
  const result: ShadowFixResult = {
    fixesApplied: [],
    materialsConverted: 0,
    meshesFixed: 0,
    errors: []
  }

  try {
    // Fix 1: Ensure shadows are enabled on renderer
    if (!renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true
      result.fixesApplied.push('Enabled shadow map on renderer')
    }

    // Fix 2: Ensure at least one light casts shadows
    let shadowCastingLightFound = false
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight || obj instanceof THREE.PointLight) {
        if (obj.castShadow) {
          shadowCastingLightFound = true
        }
      }
    })

    if (!shadowCastingLightFound) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && !obj.castShadow) {
          obj.castShadow = true
          obj.shadow.mapSize.width = 2048
          obj.shadow.mapSize.height = 2048
          obj.shadow.camera.near = 0.001
          obj.shadow.camera.far = 1000
          result.fixesApplied.push('Enabled shadow casting on directional light')
        }
      })
    }

    // Fix 3: Ensure PBR meshes cast/receive shadows (never touch helpers/gizmos/controls)
    let shadowCastingMeshCount = 0
    scene.traverse((obj) => {
      if (!isEligibleShadowMesh(obj)) return

      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material
      if (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial ||
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshLambertMaterial
      ) {
        if (!obj.castShadow) {
          obj.castShadow = true
          shadowCastingMeshCount++
        }
        if (!obj.receiveShadow) {
          obj.receiveShadow = true
        }
      }
    })

    if (shadowCastingMeshCount > 0) {
      result.fixesApplied.push(`Enabled shadow casting/receiving on ${shadowCastingMeshCount} mesh(es)`)
      result.meshesFixed = shadowCastingMeshCount
    }

    // Fix 4: Update shadow camera bounds for all lights
    // Skip when HDR ground projection is active — shadowManager owns frustum + far plane tuning.
    const store = useAppStore.getState()
    const skipShadowCameraReset =
      store.hdrEnabled &&
      store.shadowsEnabled &&
      resolveGroundProjectionActive(store.hdrGroundProjectionEnabled, scene)

    if (!skipShadowCameraReset) {
      scene.traverse((obj) => {
        if ((obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) && obj.castShadow && obj.shadow) {
          try {
            const box = new THREE.Box3()
            let hasObjects = false
            scene.traverse((child) => {
              if (
                child instanceof THREE.Mesh &&
                !child.userData.isShadowPlane &&
                !child.userData.isGridHelper &&
                !isLightVisualOrControl(child)
              ) {
                box.expandByObject(child)
                hasObjects = true
              }
            })

            if (hasObjects) {
              const size = box.getSize(new THREE.Vector3())
              const center = box.getCenter(new THREE.Vector3())
              const maxDim = Math.max(size.x, size.y, size.z)
              const minDim = Math.min(size.x, size.y, size.z)

              if (obj instanceof THREE.DirectionalLight) {
                const shadowCamera = obj.shadow.camera as THREE.OrthographicCamera
                const shadowSize = maxDim * 1.5
                shadowCamera.left = -shadowSize
                shadowCamera.right = shadowSize
                shadowCamera.top = shadowSize
                shadowCamera.bottom = -shadowSize
                shadowCamera.near = minDim < 1.0 ? 0.0005 : 0.001
                shadowCamera.far = maxDim * 3
                shadowCamera.position.copy(center)
                shadowCamera.position.add(new THREE.Vector3(0, maxDim, 0))
                shadowCamera.lookAt(center)
                shadowCamera.updateProjectionMatrix()
                obj.shadow.needsUpdate = true
              }
            }
          } catch (error) {
            result.errors.push(`Failed to update shadow camera for light: ${error}`)
          }
        }
      })
    } else {
      result.fixesApplied.push('Skipped shadow camera reset (HDR ground projection active)')
    }

  } catch (error) {
    result.errors.push(`Auto-fix failed: ${error}`)
  }

  return result
}
