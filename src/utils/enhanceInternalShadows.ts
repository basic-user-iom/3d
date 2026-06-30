import * as THREE from 'three'

/** Reduce HDR/ambient fill on recessed interior geometry visible through body gaps. */
export const CAVITY_ENV_MAP_DIM_FACTOR = 0.32
export const CAVITY_EMISSIVE_DIM_FACTOR = 0.35

const INTERIOR_KEYWORDS = [
  'engine', 'motor', 'pipe', 'tube', 'exhaust', 'manifold', 'interior',
  'under', 'chassis', 'suspension', 'bracket', 'frame', 'structural',
  'diffuser', 'intake', 'radiator', 'coolant', 'turbo', 'catalyst',
  'muffler', 'axle', 'driveshaft', 'propeller', 'gearbox', 'transmission',
  'cylinder', 'piston', 'valve', 'hose', 'wire', 'cable', 'mechanical',
  'internal', 'cavity', 'hidden', 'subframe', 'mount', 'linkage', 'shaft',
  'bearing', 'spring', 'damper', 'strut', 'arm', 'knuckle', 'hub'
]

const EXTERIOR_KEYWORDS = [
  'body', 'shell', 'panel', 'door', 'hood', 'bonnet', 'trunk', 'boot',
  'fender', 'bumper', 'spoiler', 'wing', 'mirror', 'glass', 'window',
  'windshield', 'exterior', 'paint', 'carbon', 'roof', 'quarter', 'grille',
  'headlight', 'taillight', 'skin', 'outer', 'cover', 'cladding', 'lip',
  'skirt', 'badge', 'trim', 'handle', 'pillar', 'fascia'
]

/**
 * Enhance shadows on internal surfaces (like vents, openings, cavities)
 * This ensures shadows appear correctly on parts inside complex models like cars
 */
export interface InternalShadowEnhancementResult {
  meshesEnhanced: number
  materialsMadeDoubleSided: number
  transparentMaterialsFixed: number
  cavityMeshesDimmed: number
  exteriorPanelsFrontSided: number
  fixesApplied: string[]
  errors: string[]
}

function getStructuralLabel(mesh: THREE.Mesh): string {
  return `${mesh.name || ''} ${mesh.parent?.name || ''}`.toLowerCase()
}

function getMeshLabel(mesh: THREE.Mesh): string {
  const material = mesh.material
  const materials = Array.isArray(material) ? material : material ? [material] : []
  const materialNames = materials.map((mat) => (mat.name || '').toLowerCase()).join(' ')
  return `${getStructuralLabel(mesh)} ${materialNames}`.toLowerCase()
}

/** Meshes tagged or named like exterior body panels — keep single-sided. */
export function isLikelyExteriorBodyPanel(mesh: THREE.Mesh): boolean {
  if (mesh.userData.exterior || mesh.userData.isExterior || mesh.userData.isBodyPanel) {
    return true
  }
  const structural = getStructuralLabel(mesh)
  return EXTERIOR_KEYWORDS.some((keyword) => structural.includes(keyword))
}

/** Interior / mechanical parts that should be darker inside cavities. */
export function isLikelyInteriorMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.interior || mesh.userData.isInterior) {
    return true
  }
  if (isLikelyExteriorBodyPanel(mesh)) {
    return false
  }
  const structural = getStructuralLabel(mesh)
  if (INTERIOR_KEYWORDS.some((keyword) => structural.includes(keyword))) {
    return true
  }
  const label = getMeshLabel(mesh)
  return INTERIOR_KEYWORDS.some((keyword) => label.includes(keyword))
}

function isSystemMesh(obj: THREE.Mesh): boolean {
  return !!(
    obj.userData.isHelper ||
    obj.userData.isShadowPlane ||
    obj.userData.isGridHelper ||
    obj.userData.isAxesHelper ||
    obj.userData.isGroundedSkybox ||
    obj.userData.isLightGizmo
  )
}

function isImportedMesh(obj: THREE.Mesh): boolean {
  return !!(obj.userData.isImportedModel || obj.userData.isModel)
}

function materialSupportsShadows(materials: THREE.Material[]): boolean {
  return materials.some(
    (mat) =>
      mat instanceof THREE.MeshStandardMaterial ||
      mat instanceof THREE.MeshPhysicalMaterial ||
      mat instanceof THREE.MeshPhongMaterial ||
      mat instanceof THREE.MeshLambertMaterial
  )
}

function isTransparentMaterial(mat: THREE.Material): boolean {
  const anyMat = mat as THREE.Material & {
    transparent?: boolean
    opacity?: number
    transmission?: number
  }
  return (
    anyMat.transparent === true ||
    (typeof anyMat.opacity === 'number' && anyMat.opacity < 1.0) ||
    (typeof anyMat.transmission === 'number' && anyMat.transmission > 0)
  )
}

function applyCavityDimming(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  result: InternalShadowEnhancementResult
): void {
  if (mat.userData.cavityDimApplied) return

  const originalEnv = mat.envMapIntensity ?? 1.0
  mat.userData.originalEnvMapIntensity = originalEnv
  mat.envMapIntensity = originalEnv * CAVITY_ENV_MAP_DIM_FACTOR

  if (mat.emissiveIntensity > 0) {
    mat.userData.originalEmissiveIntensity = mat.emissiveIntensity
    mat.emissiveIntensity *= CAVITY_EMISSIVE_DIM_FACTOR
  }

  mat.userData.cavityDimApplied = true
  mat.needsUpdate = true
  result.cavityMeshesDimmed++
}

/**
 * Enhance shadows on internal surfaces of models
 * - Ensures all meshes receive shadows
 * - Makes only interior materials double-sided (exterior panels stay front-facing)
 * - Dims ambient/HDR fill on interior parts visible through gaps
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
    cavityMeshesDimmed: 0,
    exteriorPanelsFrontSided: 0,
    fixesApplied: [],
    errors: []
  }

  try {
    // Step 1: Ensure all meshes receive shadows (including internal parts)
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || isSystemMesh(obj) || !isImportedMesh(obj)) {
        return
      }

      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

      if (!materialSupportsShadows(materials)) {
        return
      }

      if (!obj.receiveShadow) {
        obj.receiveShadow = true
        result.meshesEnhanced++
      }

      const isTransparent = materials.some(isTransparentMaterial)
      if (!isTransparent && !obj.castShadow) {
        obj.castShadow = true
      }
    })

    if (result.meshesEnhanced > 0) {
      result.fixesApplied.push(`Enabled shadow receiving on ${result.meshesEnhanced} mesh(es)`)
    }

    // Step 2: Exterior panels — front-side only (prevents back-face bleed through gaps)
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || isSystemMesh(obj) || !isImportedMesh(obj)) {
        return
      }

      if (!isLikelyExteriorBodyPanel(obj)) {
        return
      }

      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

      materials.forEach((mat) => {
        if (isTransparentMaterial(mat)) return
        if (
          mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhysicalMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshLambertMaterial
        ) {
          if (mat.side !== THREE.FrontSide) {
            mat.side = THREE.FrontSide
            mat.needsUpdate = true
            result.exteriorPanelsFrontSided++
          }
        }
      })
    })

    if (result.exteriorPanelsFrontSided > 0) {
      result.fixesApplied.push(
        `Set ${result.exteriorPanelsFrontSided} exterior panel material(s) to front-side only`
      )
    }

    // Step 3: Interior meshes — double-sided + cavity ambient dimming
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || isSystemMesh(obj) || !isImportedMesh(obj)) {
        return
      }

      if (!isLikelyInteriorMesh(obj)) {
        return
      }

      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

      materials.forEach((mat) => {
        if (isTransparentMaterial(mat)) return

        if (
          mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhysicalMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshLambertMaterial
        ) {
          if (mat.side !== THREE.DoubleSide && !mat.userData.internalShadowEnhanced) {
            mat.side = THREE.DoubleSide
            if (!isTransparentMaterial(mat) && mat.depthWrite !== true) {
              mat.depthWrite = true
            }
            mat.userData.internalShadowEnhanced = true
            mat.needsUpdate = true
            result.materialsMadeDoubleSided++
          }

          if (
            mat instanceof THREE.MeshStandardMaterial ||
            mat instanceof THREE.MeshPhysicalMaterial
          ) {
            applyCavityDimming(mat, result)
          }
        }
      })
    })

    if (result.materialsMadeDoubleSided > 0) {
      result.fixesApplied.push(
        `Made ${result.materialsMadeDoubleSided} interior material(s) double-sided for self-shadowing`
      )
    }

    if (result.cavityMeshesDimmed > 0) {
      result.fixesApplied.push(
        `Dimmed ambient/HDR fill on ${result.cavityMeshesDimmed} interior material(s) for cavity darkness`
      )
    }

    // Step 4: Fix transparent materials (glass/windows) for proper shadow behavior
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || isSystemMesh(obj) || !isImportedMesh(obj)) {
        return
      }

      const rawMaterial = obj.material
      const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

      materials.forEach((mat) => {
        if (
          mat instanceof THREE.LineBasicMaterial ||
          mat instanceof THREE.LineDashedMaterial ||
          mat instanceof THREE.PointsMaterial ||
          mat instanceof THREE.SpriteMaterial
        ) {
          return
        }

        if (!isTransparentMaterial(mat)) {
          return
        }

        let materialFixed = false

        if (obj.castShadow) {
          obj.castShadow = false
          materialFixed = true
        }

        if (mat.depthWrite !== false) {
          mat.depthWrite = false
          mat.needsUpdate = true
          materialFixed = true
        }

        if (!obj.receiveShadow) {
          obj.receiveShadow = true
          materialFixed = true
        }

        if (materialFixed && !mat.userData.transparentShadowFixed) {
          mat.userData.transparentShadowFixed = true
          result.transparentMaterialsFixed++
        }
      })
    })

    if (result.transparentMaterialsFixed > 0) {
      result.fixesApplied.push(
        `Fixed ${result.transparentMaterialsFixed} transparent material(s) for proper shadow behavior`
      )
    }

    // Step 5: Optimize shadow camera near plane and bias for close/internal surfaces
    directionalLights.forEach((light) => {
      if (!light.shadow || !light.castShadow) return

      const currentNear = light.shadow.camera.near
      const optimizedNear = Math.min(currentNear, 0.001)
      if (light.shadow.camera.near > optimizedNear) {
        light.shadow.camera.near = optimizedNear
        light.shadow.camera.updateProjectionMatrix()
        light.shadow.needsUpdate = true
      }

      const currentBias = light.shadow.bias || 0
      const optimizedBias = Math.max(currentBias, -0.00015)
      if (Math.abs(light.shadow.bias - optimizedBias) > 0.00001) {
        light.shadow.bias = optimizedBias
        light.shadow.needsUpdate = true
      }

      const currentNormalBias = light.shadow.normalBias || 0
      const optimizedNormalBias = Math.min(currentNormalBias, 0.008)
      if (light.shadow.normalBias > optimizedNormalBias) {
        light.shadow.normalBias = optimizedNormalBias
        light.shadow.needsUpdate = true
      }

      if (!result.fixesApplied.includes('Optimized shadow camera near plane and bias for internal surfaces')) {
        result.fixesApplied.push('Optimized shadow camera near plane and bias for internal surfaces')
      }
    })
  } catch (error) {
    result.errors.push(`Enhancement failed: ${error}`)
    console.error('[enhanceInternalShadows] Error:', error)
  }

  return result
}

/** Re-run interior enhancements after CSM lights are available. */
export function reapplyInteriorCavityEnhancements(
  scene: THREE.Scene,
  directionalLights: THREE.DirectionalLight[] = []
): InternalShadowEnhancementResult {
  return enhanceInternalShadows(scene, directionalLights)
}

/**
 * Apply internal shadow enhancements when models are loaded
 */
export function applyInternalShadowEnhancements(
  model: THREE.Object3D,
  directionalLights: THREE.DirectionalLight[] = []
): InternalShadowEnhancementResult {
  const tempScene = new THREE.Scene()
  tempScene.add(model.clone())
  return enhanceInternalShadows(tempScene, directionalLights)
}

/**
 * Fix all transparent materials in a scene to have correct shadow settings
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

        materials.forEach((mat) => {
          if (
            mat instanceof THREE.LineBasicMaterial ||
            mat instanceof THREE.LineDashedMaterial ||
            mat instanceof THREE.PointsMaterial ||
            mat instanceof THREE.SpriteMaterial
          ) {
            return
          }

          if (!isTransparentMaterial(mat)) {
            return
          }

          let materialFixed = false

          if (obj.castShadow) {
            obj.castShadow = false
            materialFixed = true
          }

          if (mat.depthWrite !== false) {
            mat.depthWrite = false
            mat.needsUpdate = true
            materialFixed = true
          }

          if (!obj.receiveShadow) {
            obj.receiveShadow = true
            materialFixed = true
          }

          if (materialFixed) {
            fixed++
            mat.userData = mat.userData || {}
            mat.userData.transparentShadowFixed = true
          }
        })
      } else if (obj instanceof THREE.LOD) {
        obj.children.forEach((child) => {
          if (!(child instanceof THREE.Mesh)) return

          const rawMaterial = child.material
          if (!rawMaterial) return

          const materials = Array.isArray(rawMaterial) ? rawMaterial : [rawMaterial]

          materials.forEach((mat) => {
            if (
              mat instanceof THREE.LineBasicMaterial ||
              mat instanceof THREE.LineDashedMaterial ||
              mat instanceof THREE.PointsMaterial ||
              mat instanceof THREE.SpriteMaterial
            ) {
              return
            }

            if (!isTransparentMaterial(mat)) return

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
              mat.userData = mat.userData || {}
              mat.userData.transparentShadowFixed = true
            }
          })
        })
      }
    })
  } catch (error) {
    console.error('[fixAllTransparentMaterials] Error:', error)
  }

  return { fixed, skipped }
}
