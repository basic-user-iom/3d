import * as THREE from 'three'

/** Reduce HDR/ambient fill on recessed interior geometry visible through body gaps. */
export const CAVITY_ENV_MAP_DIM_FACTOR = 0.12
export const CAVITY_COLOR_DIM_FACTOR = 0.3
export const CAVITY_EMISSIVE_DIM_FACTOR = 0.2
export const CAVITY_METALNESS_DIM_FACTOR = 0.45

const INTERIOR_KEYWORDS = [
  'engine', 'motor', 'pipe', 'tube', 'piping', 'harness', 'loom', 'wiring',
  'exhaust', 'exhaust_inner', 'manifold', 'tailpipe', 'muffler', 'catalyst',
  'interior', 'under', 'underbody', 'undertray', 'floorpan', 'underneath',
  'chassis', 'subframe', 'crossmember', 'rail', 'suspension', 'wishbone',
  'bracket', 'frame', 'structural', 'brace', 'mount', 'bushing', 'linkage',
  'diffuser', 'intake', 'radiator', 'coolant', 'turbo', 'supercharger',
  'axle', 'driveshaft', 'halfshaft', 'propeller', 'gearbox', 'transmission',
  'cylinder', 'piston', 'valve', 'hose', 'wire', 'cable', 'mechanical',
  'internal', 'cavity', 'hidden', 'shaft', 'bearing', 'spring', 'damper',
  'strut', 'arm', 'knuckle', 'hub', 'block', 'crank', 'cam', 'timing',
  'plenum', 'throttle', 'injector', 'fuel', 'tank', 'reservoir', 'canister',
  'airbox', 'intercooler', 'oil', 'sump', 'compressor', 'head', 'induction',
  'filter', 'clamp', 'fitting', 'connector', 'ecu', 'module', 'hardware',
  'machinery', 'diff', 'differential', 'clutch', 'stabilizer', 'sway',
  'control_arm', 'rear_axle', 'machined', 'casting', 'forged', 'billet'
]

const EXTERIOR_KEYWORDS = [
  'body', 'shell', 'panel', 'door', 'hood', 'bonnet', 'trunk', 'boot',
  'fender', 'bumper', 'spoiler', 'wing', 'mirror', 'glass', 'window',
  'windshield', 'exterior', 'paint', 'carbon', 'roof', 'quarter', 'grille',
  'headlight', 'taillight', 'skin', 'outer', 'cover', 'cladding', 'lip',
  'skirt', 'badge', 'trim', 'handle', 'pillar', 'fascia', 'lamp', 'light',
  'reflector', 'emblem', 'logo', 'nameplate', 'license', 'plate'
]

const _meshCenter = new THREE.Vector3()
const _bboxSize = new THREE.Vector3()
const _bboxCenter = new THREE.Vector3()
const _innerMin = new THREE.Vector3()
const _innerMax = new THREE.Vector3()
const _tempBox = new THREE.Box3()

export interface InternalShadowEnhancementResult {
  meshesEnhanced: number
  materialsMadeDoubleSided: number
  transparentMaterialsFixed: number
  cavityMeshesDimmed: number
  exteriorPanelsFrontSided: number
  interiorMeshesHidden: number
  fixesApplied: string[]
  errors: string[]
  affectedMeshes?: string[]
}

export interface InteriorEnhancementOptions {
  /** Hide structural interior meshes (engine bay) not meant to be seen through gaps. Default true. */
  hideInteriorGeometry?: boolean
  /** Log mesh names affected (useful for Pagani / auto-loaded models). */
  logAffectedMeshes?: boolean
  /** Re-sync cavity dimming after HDR/envMap intensity changes. */
  refreshDimming?: boolean
}

function keywordInLabel(label: string, keyword: string): boolean {
  if (keyword.length <= 4) {
    const re = new RegExp(`(?:^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`)
    return re.test(label)
  }
  return label.includes(keyword)
}

function labelMatchesAnyKeyword(label: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => keywordInLabel(label, keyword))
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
  return labelMatchesAnyKeyword(structural, EXTERIOR_KEYWORDS)
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
  if (labelMatchesAnyKeyword(structural, INTERIOR_KEYWORDS)) {
    return true
  }
  const label = getMeshLabel(mesh)
  return labelMatchesAnyKeyword(label, INTERIOR_KEYWORDS)
}

function getStructuralLabel(mesh: THREE.Mesh): string {
  return `${mesh.name || ''} ${mesh.parent?.name || ''}`.toLowerCase()
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

function meshHasTransparentMaterial(mesh: THREE.Mesh): boolean {
  const rawMaterial = mesh.material
  const materials = Array.isArray(rawMaterial) ? rawMaterial : rawMaterial ? [rawMaterial] : []
  return materials.some(isTransparentMaterial)
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

function computeImportedModelBBox(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && isImportedMesh(obj) && !isSystemMesh(obj) && !meshHasTransparentMaterial(obj)) {
      _tempBox.setFromObject(obj)
      if (!_tempBox.isEmpty()) {
        box.union(_tempBox)
      }
    }
  })
  return box
}

function getCarLengthAxis(modelBBox: THREE.Box3): 'x' | 'y' | 'z' {
  modelBBox.getSize(_bboxSize)
  if (_bboxSize.x >= _bboxSize.y && _bboxSize.x >= _bboxSize.z) return 'x'
  if (_bboxSize.y >= _bboxSize.x && _bboxSize.y >= _bboxSize.z) return 'y'
  return 'z'
}

/** Centroid inside the inner ~70% of the model bounding volume. */
export function isSpatiallyInteriorMesh(mesh: THREE.Mesh, modelBBox: THREE.Box3): boolean {
  if (modelBBox.isEmpty()) return false

  _tempBox.setFromObject(mesh)
  if (_tempBox.isEmpty()) return false

  _tempBox.getCenter(_meshCenter)
  modelBBox.getCenter(_bboxCenter)
  modelBBox.getSize(_bboxSize)

  const margin = 0.15
  const halfInner = 0.5 * (1 - margin)
  _innerMin.set(
    _bboxCenter.x - _bboxSize.x * halfInner,
    _bboxCenter.y - _bboxSize.y * halfInner,
    _bboxCenter.z - _bboxSize.z * halfInner
  )
  _innerMax.set(
    _bboxCenter.x + _bboxSize.x * halfInner,
    _bboxCenter.y + _bboxSize.y * halfInner,
    _bboxCenter.z + _bboxSize.z * halfInner
  )

  return (
    _meshCenter.x >= _innerMin.x &&
    _meshCenter.x <= _innerMax.x &&
    _meshCenter.y >= _innerMin.y &&
    _meshCenter.y <= _innerMax.y &&
    _meshCenter.z >= _innerMin.z &&
    _meshCenter.z <= _innerMax.z
  )
}

function isInRearEngineBayRegion(mesh: THREE.Mesh, modelBBox: THREE.Box3): boolean {
  if (modelBBox.isEmpty()) return false

  const axis = getCarLengthAxis(modelBBox)
  _tempBox.setFromObject(mesh)
  _tempBox.getCenter(_meshCenter)

  const min = modelBBox.min[axis]
  const max = modelBBox.max[axis]
  const length = max - min
  if (length <= 0) return false

  const rearCutoff = min + length * 0.55
  const frontCutoff = max - length * 0.55
  const pos = _meshCenter[axis]
  const inEndCap = pos < rearCutoff || pos > frontCutoff

  const height = modelBBox.max.y - modelBBox.min.y
  const aboveFloor = _meshCenter.y > modelBBox.min.y + height * 0.12

  return inEndCap && aboveFloor && isSpatiallyInteriorMesh(mesh, modelBBox)
}

/** Interior by name/tag, spatial enclosure, or rear-engine-bay heuristics. */
export function isInteriorCandidate(mesh: THREE.Mesh, modelBBox: THREE.Box3): boolean {
  if (isLikelyExteriorBodyPanel(mesh) || meshHasTransparentMaterial(mesh)) {
    return false
  }
  if (isLikelyInteriorMesh(mesh)) {
    return true
  }
  if (!isSpatiallyInteriorMesh(mesh, modelBBox)) {
    return false
  }
  const label = getMeshLabel(mesh)
  if (labelMatchesAnyKeyword(label, EXTERIOR_KEYWORDS)) {
    return false
  }
  return isInRearEngineBayRegion(mesh, modelBBox) || isSpatiallyInteriorMesh(mesh, modelBBox)
}

/** Structural internals that should not be visible through body gaps. */
export function shouldHideInteriorMesh(mesh: THREE.Mesh, modelBBox: THREE.Box3): boolean {
  if (isLikelyExteriorBodyPanel(mesh) || meshHasTransparentMaterial(mesh)) {
    return false
  }
  if (mesh.userData.neverHideInterior) {
    return false
  }

  if (isLikelyInteriorMesh(mesh)) {
    return isSpatiallyInteriorMesh(mesh, modelBBox) || isInRearEngineBayRegion(mesh, modelBBox)
  }

  if (isInRearEngineBayRegion(mesh, modelBBox)) {
    const label = getMeshLabel(mesh)
    const genericName = /^(mesh|object|node|part|geo|shape|element)[_\s.-]*\d*$/i.test(
      (mesh.name || '').trim()
    )
    if (genericName || label.length < 4) {
      return true
    }
  }

  return false
}

function applyCavityDimming(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  result: InternalShadowEnhancementResult,
  refreshDimming: boolean
): void {
  if (!mat.userData.cavityDimApplied) {
    mat.userData.cavityBaseEnvIntensity = mat.envMapIntensity ?? 1.0
    mat.userData.cavityBaseColor = mat.color.clone()
    mat.userData.cavityBaseEmissiveIntensity = mat.emissiveIntensity ?? 0
    mat.userData.cavityBaseMetalness = mat.metalness ?? 0
    mat.userData.cavityBaseRoughness = mat.roughness ?? 0.5
    mat.userData.cavityDimApplied = true
  } else if (refreshDimming) {
    const expectedEnv =
      (mat.userData.cavityBaseEnvIntensity as number) * CAVITY_ENV_MAP_DIM_FACTOR
    if (Math.abs((mat.envMapIntensity ?? 1) - expectedEnv) > 0.02) {
      mat.userData.cavityBaseEnvIntensity = mat.envMapIntensity ?? 1.0
    }
  }

  mat.envMapIntensity = (mat.userData.cavityBaseEnvIntensity as number) * CAVITY_ENV_MAP_DIM_FACTOR
  mat.color.copy(mat.userData.cavityBaseColor as THREE.Color).multiplyScalar(CAVITY_COLOR_DIM_FACTOR)

  if ((mat.userData.cavityBaseEmissiveIntensity as number) > 0) {
    mat.emissiveIntensity =
      (mat.userData.cavityBaseEmissiveIntensity as number) * CAVITY_EMISSIVE_DIM_FACTOR
  }

  mat.metalness = (mat.userData.cavityBaseMetalness as number) * CAVITY_METALNESS_DIM_FACTOR
  mat.roughness = Math.min(
    1,
    (mat.userData.cavityBaseRoughness as number) + 0.12
  )

  mat.needsUpdate = true
  result.cavityMeshesDimmed++
}

function hideInteriorMesh(mesh: THREE.Mesh, result: InternalShadowEnhancementResult): void {
  if (mesh.userData.interiorHiddenByViewer) return
  mesh.userData.preHideVisible = mesh.visible
  mesh.userData.interiorHiddenByViewer = true
  mesh.visible = false
  result.interiorMeshesHidden++
}

function showInteriorMesh(mesh: THREE.Mesh): void {
  if (!mesh.userData.interiorHiddenByViewer) return
  mesh.visible = mesh.userData.preHideVisible ?? true
  delete mesh.userData.interiorHiddenByViewer
  delete mesh.userData.preHideVisible
}

/** Toggle visibility of hidden interior structural meshes. */
export function applyInteriorVisibility(scene: THREE.Object3D, hide: boolean): number {
  let changed = 0
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !isImportedMesh(obj) || isSystemMesh(obj)) {
      return
    }
    if (hide) {
      if (!obj.userData.interiorHiddenByViewer && obj.visible === false && obj.userData.wasInteriorHidden) {
        obj.visible = true
      }
    } else if (obj.userData.interiorHiddenByViewer) {
      showInteriorMesh(obj)
      changed++
    }
  })

  if (!hide) return changed

  const modelBBox = computeImportedModelBBox(scene)
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !isImportedMesh(obj) || isSystemMesh(obj)) {
      return
    }
    if (shouldHideInteriorMesh(obj, modelBBox)) {
      const wasVisible = obj.visible
      hideInteriorMesh(obj, {
        meshesEnhanced: 0,
        materialsMadeDoubleSided: 0,
        transparentMaterialsFixed: 0,
        cavityMeshesDimmed: 0,
        exteriorPanelsFrontSided: 0,
        interiorMeshesHidden: 0,
        fixesApplied: [],
        errors: []
      })
      if (wasVisible) changed++
      obj.userData.wasInteriorHidden = true
    }
  })
  return changed
}

/**
 * Enhance shadows on internal surfaces (vents, openings, engine bay cavities).
 * Call after HDR/envMap setup so cavity dimming is not overwritten.
 */
export function enhanceInternalShadows(
  scene: THREE.Object3D,
  directionalLights: THREE.DirectionalLight[] = [],
  options: InteriorEnhancementOptions = {}
): InternalShadowEnhancementResult {
  const hideInteriorGeometry = options.hideInteriorGeometry !== false
  const refreshDimming = options.refreshDimming === true
  const affectedMeshes: string[] = []

  const result: InternalShadowEnhancementResult = {
    meshesEnhanced: 0,
    materialsMadeDoubleSided: 0,
    transparentMaterialsFixed: 0,
    cavityMeshesDimmed: 0,
    exteriorPanelsFrontSided: 0,
    interiorMeshesHidden: 0,
    fixesApplied: [],
    errors: []
  }

  const modelBBox = computeImportedModelBBox(scene)

  try {
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

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || isSystemMesh(obj) || !isImportedMesh(obj)) {
        return
      }

      const isInterior = isInteriorCandidate(obj, modelBBox)

      if (hideInteriorGeometry && shouldHideInteriorMesh(obj, modelBBox)) {
        hideInteriorMesh(obj, result)
        if (options.logAffectedMeshes) {
          affectedMeshes.push(`[hidden] ${obj.name || '(unnamed)'}`)
        }
        return
      }

      if (!isInterior) {
        return
      }

      if (options.logAffectedMeshes) {
        affectedMeshes.push(`[dimmed] ${obj.name || '(unnamed)'}`)
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
            applyCavityDimming(mat, result, refreshDimming)
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

    if (result.interiorMeshesHidden > 0) {
      result.fixesApplied.push(
        `Hid ${result.interiorMeshesHidden} structural interior mesh(es) not meant to be visible`
      )
    }

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

    if (options.logAffectedMeshes && affectedMeshes.length > 0) {
      result.affectedMeshes = affectedMeshes
      console.log('[enhanceInternalShadows] Affected meshes:', affectedMeshes.slice(0, 80), {
        total: affectedMeshes.length,
        hidden: result.interiorMeshesHidden,
        dimmed: result.cavityMeshesDimmed
      })
    }
  } catch (error) {
    result.errors.push(`Enhancement failed: ${error}`)
    console.error('[enhanceInternalShadows] Error:', error)
  }

  return result
}

/** Re-run interior enhancements after CSM lights / HDR are available. */
export function reapplyInteriorCavityEnhancements(
  scene: THREE.Scene,
  directionalLights: THREE.DirectionalLight[] = [],
  options: InteriorEnhancementOptions = {}
): InternalShadowEnhancementResult {
  return enhanceInternalShadows(scene, directionalLights, {
    ...options,
    refreshDimming: true
  })
}

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
      }
    })
  } catch (error) {
    console.error('[fixAllTransparentMaterials] Error:', error)
  }

  return { fixed, skipped }
}
