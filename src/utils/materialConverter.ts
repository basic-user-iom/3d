// @ts-nocheck

import * as THREE from 'three'
import { MATERIAL_DEFAULTS } from '../viewer/utils/materialDefaults'

/**
 * Convert MeshBasicMaterial to MeshStandardMaterial
 * Preserves all important properties like color, maps, transparency, etc.
 */
export function convertBasicToStandard(material: THREE.MeshBasicMaterial): THREE.MeshStandardMaterial {
  const newMaterial = new THREE.MeshStandardMaterial({
    color: material.color.clone(),
    map: material.map,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    visible: material.visible,
    name: material.name ? `${material.name} (converted)` : 'Converted Material',
    flatShading: false // CRITICAL: Ensure smooth shading for converted materials
  })

  // Copy any additional properties that might exist
  if (material.alphaMap) newMaterial.alphaMap = material.alphaMap
  if (material.aoMap) newMaterial.aoMap = material.aoMap
  if (material.emissive) newMaterial.emissive = material.emissive.clone()
  if (material.emissiveMap) newMaterial.emissiveMap = material.emissiveMap
  if (material.lightMap) newMaterial.lightMap = material.lightMap
  if (material.wireframe) newMaterial.wireframe = material.wireframe

  // CRITICAL: Preserve HDR environment map if it exists
  // MeshBasicMaterial doesn't have envMap property, but if HDR was applied to the scene,
  // the converted MeshStandardMaterial should receive it. We'll preserve any envMap
  // that might have been set on the material (though unlikely for MeshBasicMaterial)
  const anyMat = material as any
  if (anyMat.envMap) {
    newMaterial.envMap = anyMat.envMap
  }
  if (typeof anyMat.envMapIntensity === 'number') {
    newMaterial.envMapIntensity = anyMat.envMapIntensity
  }

  // Set reasonable defaults for PBR properties
  // IMPROVED: Use material defaults constants
  newMaterial.metalness = MATERIAL_DEFAULTS.metalness
  newMaterial.roughness = 0.7 // Slightly less than default for converted materials

  return newMaterial
}

/**
 * Convert all MeshBasicMaterial instances in a scene to MeshStandardMaterial
 * Returns statistics about the conversion
 */
export interface MaterialConversionStats {
  totalConverted: number
  meshesUpdated: number
  errors: string[]
}

export function convertSceneBasicMaterials(
  scene: THREE.Scene,
  options?: {
    skipSystemObjects?: boolean
    preserveOriginal?: boolean
  }
): MaterialConversionStats {
  const stats: MaterialConversionStats = {
    totalConverted: 0,
    meshesUpdated: 0,
    errors: []
  }

  const skipSystemObjects = options?.skipSystemObjects ?? true

  scene.traverse((object) => {
    // Skip system objects if requested
    if (skipSystemObjects) {
      // CRITICAL: Check userData flags first (most reliable)
      const meshName = (object.name || '').toLowerCase()
      if (
        object.userData.isShadowPlane ||
        meshName === 'shadow plane' ||
        object.userData.isGridHelper ||
        object.userData.isAxesHelper ||
        object.userData.isLightGizmo ||
        object.userData.isLightHelper ||
        object.userData.isGroundedSkybox ||
        object.userData.isDynamicSky ||
        object.userData.isSun ||
        object.userData.isMoon ||
        (object as any).isSystemObject ||
        (object.userData && object.userData.isSystemObject)
      ) {
        return
      }
      
      // Also check object type names (fallback)
      const objType = object.constructor?.name || ''
      if (
        objType.includes('Controls') ||
        objType.includes('Helper') ||
        objType.includes('Gizmo') ||
        object instanceof THREE.Light ||
        object instanceof THREE.Camera
      ) {
        return
      }
    }

    if (object instanceof THREE.Mesh && object.material) {
      try {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        const newMaterials: THREE.Material[] = []
        let hasConverted = false

        materials.forEach((mat: THREE.Material) => {
          if (mat instanceof THREE.MeshBasicMaterial) {
            try {
              const converted = convertBasicToStandard(mat)
              newMaterials.push(converted)
              stats.totalConverted++
              hasConverted = true

              // CRITICAL: After conversion, check if material is transparent and configure it for shadow passing
              // This ensures converted transparent materials have depthWrite = false and castShadow = false
              const anyMat = converted as any
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
              const hasTransmission = transmission > 0
              const transparentFlag = anyMat.transparent === true
              
              // Check if converted material is transparent (same logic as useViewer.ts)
              const materialName = (converted.name || '').toLowerCase()
              const isGlassLike = materialName.includes('glass') || 
                                 materialName.includes('window') || 
                                 materialName.includes('windshield') ||
                                 materialName.includes('transparent') ||
                                 materialName.includes('transmission')
              
              const isTransparent = transparentFlag && opacity < 1.0 || 
                                   hasTransmission || 
                                   isGlassLike ||
                                   (converted instanceof THREE.MeshPhysicalMaterial && hasTransmission)
              
              if (isTransparent) {
                // Configure converted transparent material for shadow passing
                // Set castShadow = false and depthWrite = false to allow shadows through
                if (object instanceof THREE.Mesh) {
                  object.castShadow = false
                  object.receiveShadow = true
                }
                converted.depthWrite = false
                converted.transparent = true
                
                // Mark as configured for transparent shadow passing
                if (!converted.userData) {
                  converted.userData = {}
                }
                converted.userData.transparentShadowConfigured = true
              }

              // Dispose the old material if not preserving
              if (!options?.preserveOriginal) {
                // Dispose textures from old material
                if (mat.map) mat.map.dispose()
                if (mat.alphaMap) mat.alphaMap.dispose()
                if (mat.aoMap) mat.aoMap.dispose()
                if (mat.emissiveMap) mat.emissiveMap.dispose()
                if (mat.lightMap) mat.lightMap.dispose()
                mat.dispose()
              }
            } catch (error) {
              stats.errors.push(`Failed to convert material on mesh "${object.name || 'unnamed'}": ${error}`)
              newMaterials.push(mat) // Keep original if conversion fails
            }
          } else {
            newMaterials.push(mat)
          }
        })

        if (hasConverted) {
          object.material = Array.isArray(object.material) ? newMaterials : newMaterials[0]
          object.material.needsUpdate = true
          stats.meshesUpdated++
        }
      } catch (error) {
        stats.errors.push(`Error processing mesh "${object.name || 'unnamed'}": ${error}`)
      }
    }
  })

  return stats
}


