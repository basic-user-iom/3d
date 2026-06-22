import * as THREE from 'three'
import { convertSceneBasicMaterials } from './materialConverter'

/**
 * Auto-fix common shadow issues in the scene
 */
export interface ShadowFixResult {
  fixesApplied: string[]
  materialsConverted: number
  meshesFixed: number
  errors: string[]
}

/**
 * Automatically fix shadow issues in the scene
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
    // Fix 1: Convert MeshBasicMaterial to MeshStandardMaterial
    const conversionStats = convertSceneBasicMaterials(scene, {
      skipSystemObjects: true,
      preserveOriginal: false
    })

    if (conversionStats.totalConverted > 0) {
      result.fixesApplied.push(`Converted ${conversionStats.totalConverted} MeshBasicMaterial(s) to MeshStandardMaterial`)
      result.materialsConverted = conversionStats.totalConverted
      result.errors.push(...conversionStats.errors)
    }

    // Fix 2: Ensure shadows are enabled on renderer
    if (!renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true
      result.fixesApplied.push('Enabled shadow map on renderer')
    }

    // Fix 3: Ensure at least one light casts shadows
    let shadowCastingLightFound = false
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight || obj instanceof THREE.PointLight) {
        if (obj.castShadow) {
          shadowCastingLightFound = true
        }
      }
    })

    if (!shadowCastingLightFound) {
      // Find the first directional light and enable shadows
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && !obj.castShadow) {
          obj.castShadow = true
          obj.shadow.mapSize.width = 2048
          obj.shadow.mapSize.height = 2048
          // CRITICAL: Use very small near plane to capture interior surfaces (like car interiors)
          // 0.001 allows the shadow camera to see very close surfaces
          obj.shadow.camera.near = 0.001
          obj.shadow.camera.far = 1000
          result.fixesApplied.push('Enabled shadow casting on directional light')
        }
      })
    }

    // Fix 4: Ensure at least some meshes cast shadows
    let shadowCastingMeshCount = 0
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isShadowPlane && !obj.userData.isGridHelper) {
        const objType = obj.constructor?.name || ''
        if (!objType.includes('Helper') && !objType.includes('Control')) {
          const material = Array.isArray(obj.material) ? obj.material[0] : obj.material
          // Only enable castShadow if material supports it
          if (material instanceof THREE.MeshStandardMaterial || 
              material instanceof THREE.MeshPhysicalMaterial ||
              material instanceof THREE.MeshPhongMaterial ||
              material instanceof THREE.MeshLambertMaterial) {
            if (!obj.castShadow) {
              obj.castShadow = true
              shadowCastingMeshCount++
            }
            // Also enable receiveShadow
            if (!obj.receiveShadow) {
              obj.receiveShadow = true
            }
          }
        }
      }
    })

    if (shadowCastingMeshCount > 0) {
      result.fixesApplied.push(`Enabled shadow casting/receiving on ${shadowCastingMeshCount} mesh(es)`)
      result.meshesFixed = shadowCastingMeshCount
    }

    // Fix 5: Update shadow camera bounds for all lights
    scene.traverse((obj) => {
      if ((obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) && obj.castShadow && obj.shadow) {
        try {
          // Calculate scene bounds
          const box = new THREE.Box3()
          let hasObjects = false
          scene.traverse((child) => {
            if (child instanceof THREE.Mesh && !child.userData.isShadowPlane && !child.userData.isGridHelper) {
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
              // Set reasonable shadow camera bounds
              const shadowCamera = obj.shadow.camera as THREE.OrthographicCamera
              const shadowSize = maxDim * 1.5 // 1.5x scene size for safety margin
              shadowCamera.left = -shadowSize
              shadowCamera.right = shadowSize
              shadowCamera.top = shadowSize
              shadowCamera.bottom = -shadowSize
              // CRITICAL: Use very small near plane to capture interior surfaces (like car interiors)
              // 0.001 allows the shadow camera to see very close surfaces
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

  } catch (error) {
    result.errors.push(`Auto-fix failed: ${error}`)
  }

  return result
}


