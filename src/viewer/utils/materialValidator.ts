// @ts-nocheck

import * as THREE from 'three'

/**
 * Material Validator
 * 
 * Validates material properties and ensures they're properly configured
 * to prevent rendering artifacts and ensure correct behavior
 */

export interface MaterialValidationResult {
  isValid: boolean
  issues: string[]
  warnings: string[]
  suggestions: string[]
}

/**
 * Validate a material and return issues/warnings
 */
export function validateMaterial(
  material: THREE.Material,
  scene?: THREE.Scene
): MaterialValidationResult {
  const result: MaterialValidationResult = {
    isValid: true,
    issues: [],
    warnings: [],
    suggestions: []
  }

  if (!material) {
    result.isValid = false
    result.issues.push('Material is null or undefined')
    return result
  }

  // Check material type
  const matType = material.type || 'Unknown'
  
  // Validate PBR materials
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    // Check metallic materials have envMap
    if (material.metalness !== undefined && material.metalness > 0.3) {
      if (!material.envMap) {
        result.warnings.push(`Metallic material (metalness: ${material.metalness.toFixed(2)}) missing envMap - reflections may not work correctly`)
        if (scene?.environment) {
          result.suggestions.push('Apply scene.environment as envMap to enable reflections')
        }
      } else {
        // Check envMapIntensity
        if (material.envMapIntensity !== undefined) {
          if (material.envMapIntensity === 0) {
            result.warnings.push('envMapIntensity is 0 - reflections are disabled')
            result.suggestions.push('Set envMapIntensity to 1.0 or higher for visible reflections')
          } else if (material.envMapIntensity < 0.5 && material.metalness > 0.5) {
            result.warnings.push(`Low envMapIntensity (${material.envMapIntensity.toFixed(2)}) for metallic material - reflections may be too dim`)
          }
        }
      }
    }

    // Check roughness/metalness ranges
    if (material.roughness !== undefined) {
      if (material.roughness < 0 || material.roughness > 1) {
        result.issues.push(`Roughness out of range: ${material.roughness} (should be 0-1)`)
        result.isValid = false
      }
    }
    if (material.metalness !== undefined) {
      if (material.metalness < 0 || material.metalness > 1) {
        result.issues.push(`Metalness out of range: ${material.metalness} (should be 0-1)`)
        result.isValid = false
      }
    }

    // Check texture maps
    const textureMaps = [
      { prop: 'map', name: 'Base Color' },
      { prop: 'normalMap', name: 'Normal' },
      { prop: 'roughnessMap', name: 'Roughness' },
      { prop: 'metalnessMap', name: 'Metalness' },
      { prop: 'aoMap', name: 'Ambient Occlusion' },
      { prop: 'emissiveMap', name: 'Emissive' }
    ]

    textureMaps.forEach(({ prop, name }) => {
      const texture = (material as any)[prop] as THREE.Texture | undefined
      if (texture) {
        // Check if texture is valid
        if (!texture.image) {
          result.warnings.push(`${name} texture map exists but has no image data`)
        } else if (texture.image instanceof HTMLImageElement) {
          if (texture.image.naturalWidth === 0 || texture.image.naturalHeight === 0) {
            result.warnings.push(`${name} texture map image has zero dimensions`)
          }
        }

        // Check texture filtering
        if (texture.minFilter === THREE.NearestFilter || texture.minFilter === THREE.NearestMipmapNearestFilter) {
          result.warnings.push(`${name} texture using NearestFilter - may cause aliasing/striping artifacts`)
          result.suggestions.push('Use LinearMipmapLinearFilter for smoother textures')
        }

        // Check mipmaps
        if (texture.generateMipmaps === false && texture.minFilter !== THREE.NearestFilter) {
          result.warnings.push(`${name} texture has mipmaps disabled but minFilter requires mipmaps`)
        }
      }
    })

    // Check flatShading
    if (material.flatShading === true) {
      result.warnings.push('flatShading is enabled - surfaces may appear faceted/polygonal')
      result.suggestions.push('Set flatShading to false for smooth surfaces')
    }
  }

  // Check transparent materials
  if (material.transparent) {
    if (material.opacity === undefined || material.opacity < 0 || material.opacity > 1) {
      result.issues.push(`Invalid opacity for transparent material: ${material.opacity}`)
      result.isValid = false
    }

    // Transparent materials should have depthWrite = false for proper blending
    if (material.depthWrite === true) {
      result.warnings.push('Transparent material has depthWrite = true - may cause rendering artifacts')
      result.suggestions.push('Set depthWrite to false for transparent materials')
    }
  }

  // Check if material needs update
  if (material.needsUpdate === false && (
    (material as any).envMap !== scene?.environment ||
    (material as any).envMapIntensity !== undefined
  )) {
    result.warnings.push('Material properties changed but needsUpdate is false - changes may not be visible')
    result.suggestions.push('Set material.needsUpdate = true after modifying properties')
  }

  return result
}

/**
 * Validate all materials in a scene
 */
export function validateSceneMaterials(scene: THREE.Scene): {
  totalMaterials: number
  validMaterials: number
  invalidMaterials: number
  allIssues: string[]
  allWarnings: string[]
  allSuggestions: string[]
  materialResults: Map<THREE.Material, MaterialValidationResult>
} {
  const materialResults = new Map<THREE.Material, MaterialValidationResult>()
  const allIssues: string[] = []
  const allWarnings: string[] = []
  const allSuggestions: string[] = []
  let validMaterials = 0
  let invalidMaterials = 0

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        if (!materialResults.has(material)) {
          const result = validateMaterial(material, scene)
          materialResults.set(material, result)

          if (result.isValid) {
            validMaterials++
          } else {
            invalidMaterials++
          }

          allIssues.push(...result.issues.map(issue => `${material.name || 'Unnamed'}: ${issue}`))
          allWarnings.push(...result.warnings.map(warning => `${material.name || 'Unnamed'}: ${warning}`))
          allSuggestions.push(...result.suggestions.map(suggestion => `${material.name || 'Unnamed'}: ${suggestion}`))
        }
      })
    }
  })

  return {
    totalMaterials: materialResults.size,
    validMaterials,
    invalidMaterials,
    allIssues,
    allWarnings,
    allSuggestions,
    materialResults
  }
}

/**
 * Auto-fix common material issues
 */
export function autoFixMaterial(material: THREE.Material, scene?: THREE.Scene): {
  fixed: boolean
  changes: string[]
} {
  const changes: string[] = []
  let fixed = false

  if (!material) return { fixed: false, changes: [] }

  // Fix PBR materials
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    // Fix metallic materials without envMap
    if (material.metalness !== undefined && material.metalness > 0.3 && !material.envMap && scene?.environment) {
      material.envMap = scene.environment
      material.envMapIntensity = material.envMapIntensity || 1.0
      material.needsUpdate = true
      changes.push('Applied scene.environment as envMap for metallic material')
      fixed = true
    }

    // Fix envMapIntensity
    if (material.envMap && material.envMapIntensity === 0) {
      material.envMapIntensity = 1.0
      material.needsUpdate = true
      changes.push('Set envMapIntensity to 1.0')
      fixed = true
    }

    // Fix flatShading
    if (material.flatShading === true) {
      material.flatShading = false
      material.needsUpdate = true
      changes.push('Disabled flatShading for smooth surfaces')
      fixed = true
    }

    // Fix texture filtering
    const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
    textureMaps.forEach(prop => {
      const texture = (material as any)[prop] as THREE.Texture | undefined
      if (texture && (texture.minFilter === THREE.NearestFilter || texture.minFilter === THREE.NearestMipmapNearestFilter)) {
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true
        texture.needsUpdate = true
        changes.push(`Fixed ${prop} texture filtering`)
        fixed = true
      }
    })
  }

  // Fix transparent materials
  if (material.transparent && material.depthWrite === true) {
    material.depthWrite = false
    material.needsUpdate = true
    changes.push('Set depthWrite to false for transparent material')
    fixed = true
  }

  return { fixed, changes }
}
























































