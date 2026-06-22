/**
 * Utility functions for handling transparent materials (glass/windows)
 * Allows manual configuration if auto-detection fails
 */

import * as THREE from 'three'

export interface TransparentMaterialConfig {
  meshName?: string
  materialName?: string
  castShadow?: boolean
  depthWrite?: boolean
  receiveShadow?: boolean
  transparent?: boolean
}

/**
 * Manually configure a material as transparent to allow shadows to pass through
 */
export function configureMaterialAsTransparent(
  mesh: THREE.Mesh,
  material: THREE.Material,
  config?: TransparentMaterialConfig
): void {
  // CRITICAL: Never modify shadow plane - it must always receive shadows
  // Check both userData flag and mesh name as double protection
  const meshName = (mesh.name || '').toLowerCase()
  if (mesh.userData.isShadowPlane || meshName === 'shadow plane') {
    console.warn('[TransparentMaterialHelper] Attempted to configure shadow plane as transparent - skipping to preserve shadows')
    return
  }
  
  const anyMat = material as any
  const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
  const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0

  // Configure mesh
  if (config?.castShadow !== undefined) {
    mesh.castShadow = config.castShadow
  } else {
    // Default: disable shadow casting for transparent materials
    mesh.castShadow = false
  }

  if (config?.receiveShadow !== undefined) {
    mesh.receiveShadow = config.receiveShadow
  } else {
    // Default: enable shadow receiving for transparent materials
    mesh.receiveShadow = true
  }

  // Configure material
  if (config?.depthWrite !== undefined) {
    material.depthWrite = config.depthWrite
  } else {
    // Default: disable depth writing for transparent materials
    material.depthWrite = false
  }

  if (config?.transparent !== undefined) {
    material.transparent = config.transparent
  } else {
    // Default: enable transparency if not already enabled
    if (!material.transparent && (opacity < 1.0 || transmission > 0)) {
      material.transparent = true
    }
  }

  // Ensure depthTest is enabled for proper depth sorting
  if (material.depthTest !== true) {
    material.depthTest = true
  }

  // Mark material as configured for transparent shadow passing
  // CRITICAL: This prevents other code from overriding our depthWrite = false setting
  if (!material.userData) {
    material.userData = {}
  }
  material.userData.transparentShadowConfigured = true

  // IMPROVED: Reduced logging - only log when there are issues or when first configuring
  // Use a flag to track if we've logged configuration for this material
  const logKey = `${mesh.name || 'unnamed'}_${material.name || material.type}`
  const hasLogged = (window as any).__transparentMaterialLogs || new Set<string>()
  if (!hasLogged.has(logKey)) {
    hasLogged.add(logKey)
    ;(window as any).__transparentMaterialLogs = hasLogged
    // Only log if material was incorrectly configured before (force mode) or if it's a new configuration
    console.debug(
      `[TransparentMaterialHelper] Configured material "${material.name || material.type}" on mesh "${mesh.name || 'unnamed'}": ` +
      `castShadow=${mesh.castShadow}, depthWrite=${material.depthWrite}, receiveShadow=${mesh.receiveShadow}, transparent=${material.transparent}`
    )
  }
}

/**
 * Find and configure all transparent materials in the scene
 */
export function configureAllTransparentMaterials(
  scene: THREE.Scene,
  options?: {
    force?: boolean // Force configuration even if already configured
    logResults?: boolean // Log results to console
  }
): {
  configured: number
  skipped: number
  errors: string[]
} {
  const result = {
    configured: 0,
    skipped: 0,
    errors: [] as string[]
  }

  const { force = false, logResults = true } = options || {}

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Skip helpers, shadow plane, HDR objects, and other system objects
      // CRITICAL: Also check mesh name to ensure shadow plane is never modified
      const meshName = (obj.name || '').toLowerCase()
      if (
        obj.userData.isShadowPlane ||
        meshName === 'shadow plane' ||
        obj.userData.isGridHelper ||
        obj.userData.isAxesHelper ||
        obj.userData.isTransformControls ||
        obj.userData.isLightGizmo ||
        obj.userData.isLightHelper ||
        obj.userData.isGroundedSkybox ||
        obj.userData.isDynamicSky ||
        obj.userData.isSun ||
        obj.userData.isMoon
      ) {
        return
      }

      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

      materials.forEach((mat) => {
        try {
          const anyMat = mat as any
          const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
          const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
          const hasTransmission = transmission > 0
          const transparentFlag = anyMat.transparent === true
          const isPhysicalWithTransmission = mat instanceof THREE.MeshPhysicalMaterial && hasTransmission
          const materialName = (mat.name || '').toLowerCase()
          const isGlassLike = materialName.includes('glass') || 
                             materialName.includes('window') || 
                             materialName.includes('windshield') ||
                             materialName.includes('transparent') ||
                             materialName.includes('transmission')
          
          // Detect transparent materials (same logic as in useViewer.ts)
          const isTransparent = isPhysicalWithTransmission || 
                               hasTransmission || 
                               (transparentFlag && opacity < 1.0) ||
                               isGlassLike

          if (isTransparent) {
            // Check if already configured correctly
            const wasConfiguredTransparent = (mat as any).userData?.transparentShadowConfigured === true
            const isCorrectlyConfigured = 
              obj.castShadow === false &&
              mat.depthWrite === false &&
              obj.receiveShadow === true &&
              wasConfiguredTransparent

            if (force || !isCorrectlyConfigured) {
              // configureMaterialAsTransparent already sets the transparentShadowConfigured marker
              configureMaterialAsTransparent(obj, mat)
              result.configured++
            } else {
              result.skipped++
            }
          }
        } catch (error) {
          const errorMsg = `Failed to configure material on mesh "${obj.name || 'unnamed'}": ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          console.error('[TransparentMaterialHelper]', errorMsg, error)
        }
      })
    }
  })

  if (logResults) {
    console.log(
      `[TransparentMaterialHelper] Configuration complete: ${result.configured} configured, ${result.skipped} skipped, ${result.errors.length} errors`
    )
  }

  return result
}

/**
 * Find materials by name pattern and configure them as transparent
 */
export function configureMaterialsByNamePattern(
  scene: THREE.Scene,
  namePattern: string | RegExp,
  config?: TransparentMaterialConfig
): {
  configured: number
  errors: string[]
} {
  const result = {
    configured: 0,
    errors: [] as string[]
  }

  const pattern = typeof namePattern === 'string' ? new RegExp(namePattern, 'i') : namePattern

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Skip helpers, shadow plane, HDR objects, and other system objects
      // CRITICAL: Also check mesh name to ensure shadow plane is never modified
      const meshName = (obj.name || '').toLowerCase()
      
      // CRITICAL: Check material name as well - shadow plane materials might have specific names
      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]
      const materialNames = materials.map(m => (m.name || '').toLowerCase())
      const isShadowPlaneMaterial = materialNames.some(name => 
        name.includes('shadow') && name.includes('plane')
      )
      
      if (
        obj.userData.isShadowPlane ||
        meshName === 'shadow plane' ||
        isShadowPlaneMaterial ||
        obj.userData.isGridHelper ||
        obj.userData.isAxesHelper ||
        obj.userData.isTransformControls ||
        obj.userData.isLightGizmo ||
        obj.userData.isLightHelper ||
        obj.userData.isGroundedSkybox ||
        obj.userData.isDynamicSky ||
        obj.userData.isSun ||
        obj.userData.isMoon
      ) {
        return
      }

      materials.forEach((mat) => {
        try {
          const materialName = mat.name || ''
          const objMeshName = obj.name || ''

          if (pattern.test(materialName) || pattern.test(objMeshName)) {
            configureMaterialAsTransparent(obj, mat, config)
            result.configured++
          }
        } catch (error) {
          const errorMsg = `Failed to configure material on mesh "${obj.name || 'unnamed'}": ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          console.error('[TransparentMaterialHelper]', errorMsg, error)
        }
      })
    }
  })

  return result
}

