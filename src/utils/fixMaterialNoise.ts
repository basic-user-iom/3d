/**
 * Auto-fix material properties that cause white noise/speckle artifacts
 */

import * as THREE from 'three'

export interface MaterialFixResult {
  materialsFixed: number
  fixesApplied: string[]
  errors: string[]
}

/**
 * Fix materials with problematic roughness/metalness/envMapIntensity settings
 * that cause white speckle artifacts
 */
export function fixMaterialNoise(
  scene: THREE.Scene,
  options?: {
    minRoughness?: number
    maxMetalness?: number
    maxEnvMapIntensity?: number
    fixLowRoughnessHighMetalness?: boolean
    fixHighEnvMapIntensity?: boolean
  }
): MaterialFixResult {
  const result: MaterialFixResult = {
    materialsFixed: 0,
    fixesApplied: [],
    errors: []
  }

  const minRoughness = options?.minRoughness ?? 0.2
  const maxMetalness = options?.maxMetalness ?? 0.5
  const maxEnvMapIntensity = options?.maxEnvMapIntensity ?? 2.0
  const fixLowRoughnessHighMetalness = options?.fixLowRoughnessHighMetalness ?? true
  const fixHighEnvMapIntensity = options?.fixHighEnvMapIntensity ?? true

  try {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat, matIndex) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            let materialFixed = false
            const fixes: string[] = []

            const roughness = mat.roughness ?? 1.0
            const metalness = mat.metalness ?? 0.0
            const envMapIntensity = mat.envMapIntensity ?? 1.0

            // Fix: Low roughness + high metalness (causes bright specular highlights = white speckles)
            if (fixLowRoughnessHighMetalness && roughness < minRoughness && metalness > maxMetalness) {
              const oldRoughness = roughness
              const oldMetalness = metalness

              // Increase roughness to minimum (reduces specular highlights)
              mat.roughness = Math.max(roughness, minRoughness)
              
              // Reduce metalness if it's too high (reduces mirror-like reflections)
              if (metalness > maxMetalness) {
                mat.metalness = Math.min(metalness, maxMetalness)
              }

              fixes.push(
                `Roughness: ${oldRoughness.toFixed(3)} → ${mat.roughness.toFixed(3)}, Metalness: ${oldMetalness.toFixed(3)} → ${mat.metalness.toFixed(3)}`
              )
              materialFixed = true
            }

            // Fix: High environment map intensity (causes bright reflections = white speckles)
            if (fixHighEnvMapIntensity && envMapIntensity > maxEnvMapIntensity) {
              const oldIntensity = envMapIntensity
              mat.envMapIntensity = Math.min(envMapIntensity, maxEnvMapIntensity)
              fixes.push(`EnvMapIntensity: ${oldIntensity.toFixed(2)} → ${mat.envMapIntensity.toFixed(2)}`)
              materialFixed = true
            }

            if (materialFixed) {
              result.materialsFixed++
              const objName = obj.name || 'Unnamed Mesh'
              const matName = mat.name || 'Unnamed Material'
              result.fixesApplied.push(`${objName}/${matName}: ${fixes.join(', ')}`)
              
              // Mark material as needing update
              mat.needsUpdate = true
            }
          }
        })
      }
    })

    if (result.materialsFixed > 0) {
      result.fixesApplied.unshift(`Fixed ${result.materialsFixed} material(s) to eliminate white noise artifacts`)
    }
  } catch (error) {
    result.errors.push(`Error fixing materials: ${error instanceof Error ? error.message : String(error)}`)
  }

  return result
}


























