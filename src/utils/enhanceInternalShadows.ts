import * as THREE from 'three'

/**
 * Enhance shadows on internal surfaces (like vents, openings, cavities)
 * This ensures shadows appear correctly on parts inside complex models like cars
 */
export interface InternalShadowEnhancementResult {
  meshesEnhanced: number
  materialsMadeDoubleSided: number
  transparentMaterialsFixed: number
  fixesApplied: string[]
  errors: string[]
}

/**
 * Enhance shadows on internal surfaces of models
 * - Ensures all meshes receive shadows
 * - Makes materials double-sided for internal surfaces (so shadows appear on back faces)
 * - Optimizes shadow bias for better self-shadowing
 */
export function enhanceInternalShadows(
  scene: THREE.Object3D,
  directionalLights: THREE.DirectionalLight[] = []
): InternalShadowEnhancementResult {
  const result: InternalShadowEnhancementResult = {
    meshesEnhanced: 0,
    materialsMadeDoubleSided: 0,
    transparentMaterialsFixed: 0,
    fixesApplied: [],
    errors: []
  }

  try {
    // Step 1: Ensure all meshes receive shadows (including internal parts)
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Skip helpers, planes, and system objects
        if (obj.userData.isHelper || 
            obj.userData.isShadowPlane || 
            obj.userData.isGridHelper || 
            obj.userData.isAxesHelper ||
            obj.userData.isGroundedSkybox ||
            obj.userData.isLightGizmo) {
          return
        }

        // Only enhance imported models (not primitives or system objects)
        if (!obj.userData.isImportedModel && !obj.userData.isModel) {
          return
        }

        const rawMaterial = obj.material
        const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

        // Check if material supports shadows
        const supportsShadows = materials.some((mat: THREE.Material) => {
          return mat instanceof THREE.MeshStandardMaterial ||
                 mat instanceof THREE.MeshPhysicalMaterial ||
                 mat instanceof THREE.MeshPhongMaterial ||
                 mat instanceof THREE.MeshLambertMaterial
        })

        if (supportsShadows) {
          // CRITICAL: Enable shadow receiving on ALL meshes (including internal parts)
          if (!obj.receiveShadow) {
            obj.receiveShadow = true
            result.meshesEnhanced++
          }

          // Also enable casting for opaque materials (so they can cast shadows on internal parts)
          // Skip transparent materials (they should not cast shadows)
          const isTransparent = materials.some((mat: THREE.Material) => {
            const anyMat = mat as any
            return anyMat.transparent === true || 
                   (typeof anyMat.opacity === 'number' && anyMat.opacity < 1.0) ||
                   (typeof anyMat.transmission === 'number' && anyMat.transmission > 0)
          })

          if (!isTransparent && !obj.castShadow) {
            obj.castShadow = true
          }
        }
      }
    })

    if (result.meshesEnhanced > 0) {
      result.fixesApplied.push(`Enabled shadow receiving on ${result.meshesEnhanced} mesh(es)`)
    }

    // Step 2: Make materials double-sided for better shadow visibility on internal surfaces
    // Double-sided materials ensure shadows appear on both front and back faces
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Skip helpers and system objects
        if (obj.userData.isHelper || 
            obj.userData.isShadowPlane || 
            obj.userData.isGridHelper || 
            obj.userData.isAxesHelper ||
            obj.userData.isGroundedSkybox ||
            obj.userData.isLightGizmo) {
          return
        }

        // Only enhance imported models
        if (!obj.userData.isImportedModel && !obj.userData.isModel) {
          return
        }

        const rawMaterial = obj.material
        const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

        materials.forEach((mat: THREE.Material) => {
          // Skip transparent/glass materials (they have special handling)
          const anyMat = mat as any
          const isTransparent = anyMat.transparent === true || 
                               (typeof anyMat.opacity === 'number' && anyMat.opacity < 1.0) ||
                               (typeof anyMat.transmission === 'number' && anyMat.transmission > 0)

          if (isTransparent) {
            return // Skip transparent materials
          }

          // Only enhance materials that support shadows
          if (mat instanceof THREE.MeshStandardMaterial ||
              mat instanceof THREE.MeshPhysicalMaterial ||
              mat instanceof THREE.MeshPhongMaterial ||
              mat instanceof THREE.MeshLambertMaterial) {

            // Make material double-sided for better shadow visibility on internal surfaces
            // This ensures shadows appear on back faces (like inside vents/openings)
            // CRITICAL: Double-sided materials must still have depthWrite = true for opaque materials
            // to prevent light bleeding through back faces
            if (mat.side !== THREE.DoubleSide) {
              // Check if material was already configured (to avoid unnecessary changes)
              if (!mat.userData.internalShadowEnhanced) {
                mat.side = THREE.DoubleSide
                // CRITICAL: Ensure depthWrite = true for opaque double-sided materials
                // Double-sided doesn't mean transparent - opaque materials must still block light
                const anyMat = mat as any
                const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
                const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
                const isTransparent = anyMat.transparent === true || opacity < 1.0 || transmission > 0
                const wasConfiguredTransparent = anyMat.userData?.transparentShadowConfigured === true
                
                // Only set depthWrite = true for opaque materials
                if (!isTransparent && !wasConfiguredTransparent && mat.depthWrite !== true) {
                  mat.depthWrite = true
                }
                mat.needsUpdate = true
                mat.userData.internalShadowEnhanced = true
                result.materialsMadeDoubleSided++
              }
            }
          }
        })
      }
    })

    if (result.materialsMadeDoubleSided > 0) {
      result.fixesApplied.push(`Made ${result.materialsMadeDoubleSided} material(s) double-sided for internal shadows`)
    }

    // Step 3: Fix transparent materials (glass/windows) for proper shadow behavior
    // Transparent materials should NOT cast shadows (allow shadows to pass through)
    // and should NOT write to depth buffer (allow shadows/light to pass through)
    // but SHOULD receive shadows (so shadows appear on glass surfaces)
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Skip helpers and system objects
        if (obj.userData.isHelper || 
            obj.userData.isShadowPlane || 
            obj.userData.isGridHelper || 
            obj.userData.isAxesHelper ||
            obj.userData.isGroundedSkybox ||
            obj.userData.isLightGizmo) {
          return
        }

        // Only fix imported models
        if (!obj.userData.isImportedModel && !obj.userData.isModel) {
          return
        }

        const rawMaterial = obj.material
        const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

        materials.forEach((mat: THREE.Material) => {
          // Skip LineBasicMaterial and other helper materials
          if (mat instanceof THREE.LineBasicMaterial ||
              mat instanceof THREE.LineDashedMaterial ||
              mat instanceof THREE.PointsMaterial ||
              mat instanceof THREE.SpriteMaterial) {
            return
          }

          // Detect transparent materials (glass/windows)
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
          
          // SIMPLIFIED: Detect transparent materials - catch ANY transparent material
          // - Material has transparent flag set to true, OR
          // - Material has opacity < 1.0, OR
          // - Material has transmission > 0
          // This ensures all transparent materials (windows, glass, etc.) are fixed regardless of naming
          const isTransparent =
            transparentFlag || opacity < 1.0 || transmission > 0

          if (isTransparent) {
            let materialFixed = false

            // Fix 1: Transparent materials should NOT cast shadows (allow shadows to pass through)
            if (obj.castShadow) {
              obj.castShadow = false
              materialFixed = true
            }

            // Fix 2: Transparent materials should NOT write to depth buffer (allow shadows/light to pass through)
            if (mat.depthWrite !== false) {
              mat.depthWrite = false
              mat.needsUpdate = true
              materialFixed = true
            }

            // Fix 3: Transparent materials SHOULD receive shadows (so shadows appear on glass surfaces)
            if (!obj.receiveShadow) {
              obj.receiveShadow = true
              materialFixed = true
            }

            if (materialFixed && !mat.userData.transparentShadowFixed) {
              mat.userData.transparentShadowFixed = true
              result.transparentMaterialsFixed++
            }
          }
        })
      }
    })

    if (result.transparentMaterialsFixed > 0) {
      result.fixesApplied.push(`Fixed ${result.transparentMaterialsFixed} transparent material(s) for proper shadow behavior (castShadow=false, depthWrite=false, receiveShadow=true)`)
    }

    // Step 4: Optimize shadow camera near plane for better capture of close/internal surfaces
    directionalLights.forEach((light) => {
      if (light.shadow && light.castShadow) {
        // Use very small near plane to capture close surfaces (like inside vents/openings)
        // This is critical for shadows on internal parts
        const currentNear = light.shadow.camera.near
        const optimizedNear = Math.min(currentNear, 0.001) // Use 0.001 for very close surfaces
        
        if (light.shadow.camera.near > optimizedNear) {
          light.shadow.camera.near = optimizedNear
          light.shadow.camera.updateProjectionMatrix()
          light.shadow.needsUpdate = true
        }

        // CRITICAL: Reduce shadow bias for better self-shadowing on internal parts
        // Lower bias means shadows appear closer to surfaces (better for internal details)
        const currentBias = light.shadow.bias || 0
        // Use slightly less negative bias for better self-shadowing on close surfaces
        // This helps shadows appear on internal surfaces that are close together
        const optimizedBias = Math.max(currentBias, -0.00015) // Slightly less negative for close surfaces
        
        if (Math.abs(light.shadow.bias - optimizedBias) > 0.00001) {
          light.shadow.bias = optimizedBias
          light.shadow.needsUpdate = true
        }

        // Also optimize normal bias for internal surfaces
        // Lower normal bias helps with self-shadowing on close surfaces
        const currentNormalBias = light.shadow.normalBias || 0
        const optimizedNormalBias = Math.min(currentNormalBias, 0.005) // Lower for better self-shadowing
        
        if (light.shadow.normalBias > optimizedNormalBias) {
          light.shadow.normalBias = optimizedNormalBias
          light.shadow.needsUpdate = true
        }

        result.fixesApplied.push(`Optimized shadow camera near plane and bias for internal surfaces`)
      }
    })

  } catch (error) {
    result.errors.push(`Enhancement failed: ${error}`)
    console.error('[enhanceInternalShadows] Error:', error)
  }

  return result
}

/**
 * Apply internal shadow enhancements when models are loaded
 */
export function applyInternalShadowEnhancements(
  model: THREE.Object3D,
  directionalLights: THREE.DirectionalLight[] = []
): InternalShadowEnhancementResult {
  // Create a temporary scene to process the model
  const tempScene = new THREE.Scene()
  tempScene.add(model.clone())
  
  return enhanceInternalShadows(tempScene, directionalLights)
}

/**
 * Fix all transparent materials in a scene to have correct shadow settings
 * This is a simpler, more aggressive function that catches ALL transparent materials
 * regardless of naming or other conditions
 */
export function fixAllTransparentMaterials(scene: THREE.Object3D): {
  fixed: number
  skipped: number
} {
  let fixed = 0
  let skipped = 0

  try {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Skip helpers and system objects
        if (
          obj.userData.isHelper ||
          obj.userData.isShadowPlane ||
          obj.userData.isGridHelper ||
          obj.userData.isAxesHelper ||
          obj.userData.isGroundedSkybox ||
          obj.userData.isLightGizmo ||
          obj.userData.isGizmo
        ) {
          skipped++
          return
        }

        const rawMaterial = obj.material
        if (!rawMaterial) {
          return
        }

        const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

        materials.forEach((mat: THREE.Material) => {
          // Skip line materials and other helper materials
          if (
            mat instanceof THREE.LineBasicMaterial ||
            mat instanceof THREE.LineDashedMaterial ||
            mat instanceof THREE.PointsMaterial ||
            mat instanceof THREE.SpriteMaterial
          ) {
            return
          }

          const anyMat = mat as any
          const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
          const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
          const transparentFlag = anyMat.transparent === true

          // SIMPLIFIED: Catch ANY transparent material
          // - Material has transparent flag set to true, OR
          // - Material has opacity < 1.0, OR
          // - Material has transmission > 0
          const isTransparent =
            transparentFlag || opacity < 1.0 || transmission > 0

          if (isTransparent) {
            let materialFixed = false

            // Fix 1: Transparent materials should NOT cast shadows
            if (obj.castShadow) {
              obj.castShadow = false
              materialFixed = true
            }

            // Fix 2: Transparent materials should NOT write to depth buffer
            if (mat.depthWrite !== false) {
              mat.depthWrite = false
              mat.needsUpdate = true
              materialFixed = true
            }

            // Fix 3: Transparent materials SHOULD receive shadows
            if (!obj.receiveShadow) {
              obj.receiveShadow = true
              materialFixed = true
            }

            if (materialFixed) {
              fixed++
              // Mark as fixed to prevent duplicate processing
              if (!mat.userData) {
                mat.userData = {}
              }
              mat.userData.transparentShadowFixed = true
            }
          }
        })
      } else if (obj instanceof THREE.LOD) {
        // Also process LOD objects - traverse their children
        obj.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            const rawMaterial = child.material
            if (!rawMaterial) {
              return
            }

            const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

            materials.forEach((mat: THREE.Material) => {
              // Skip line materials
              if (
                mat instanceof THREE.LineBasicMaterial ||
                mat instanceof THREE.LineDashedMaterial ||
                mat instanceof THREE.PointsMaterial ||
                mat instanceof THREE.SpriteMaterial
              ) {
                return
              }

              const anyMat = mat as any
              const opacity = typeof anyMat.opacity === 'number' ? anyMat.opacity : 1
              const transmission = typeof anyMat.transmission === 'number' ? anyMat.transmission : 0
              const transparentFlag = anyMat.transparent === true

              const isTransparent =
                transparentFlag || opacity < 1.0 || transmission > 0

              if (isTransparent) {
                let materialFixed = false

                if (child.castShadow) {
                  child.castShadow = false
                  materialFixed = true
                }

                if (mat.depthWrite !== false) {
                  mat.depthWrite = false
                  mat.needsUpdate = true
                  materialFixed = true
                }

                if (!child.receiveShadow) {
                  child.receiveShadow = true
                  materialFixed = true
                }

                if (materialFixed) {
                  fixed++
                  if (!mat.userData) {
                    mat.userData = {}
                  }
                  mat.userData.transparentShadowFixed = true
                }
              }
            })
          }
        })
      }
    })
  } catch (error) {
    console.error('[fixAllTransparentMaterials] Error:', error)
  }

  return { fixed, skipped }
}

