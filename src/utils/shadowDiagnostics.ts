/**
 * Comprehensive Shadow System Diagnostics
 * Tests all factors that could prevent shadows from showing
 */

// @ts-nocheck

import * as THREE from 'three'

export interface ShadowDiagnosticResult {
  category: string
  test: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  recommendation?: string
}

export interface ShadowDiagnosticReport {
  timestamp: string
  overallStatus: 'healthy' | 'issues' | 'critical'
  results: ShadowDiagnosticResult[]
  summary: {
    totalTests: number
    passed: number
    failed: number
    warnings: number
  }
}

export function runShadowDiagnostics(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera
): ShadowDiagnosticReport {
  const results: ShadowDiagnosticResult[] = []
  let passed = 0
  let failed = 0
  let warnings = 0

  // ========================================
  // 1. RENDERER SHADOW MAP SETTINGS
  // ========================================
  results.push({
    category: 'Renderer',
    test: 'Shadow Map Enabled',
    status: renderer.shadowMap.enabled ? 'pass' : 'fail',
    message: renderer.shadowMap.enabled
      ? 'Shadow map is enabled on renderer'
      : '❌ CRITICAL: Shadow map is DISABLED on renderer',
    recommendation: renderer.shadowMap.enabled
      ? undefined
      : 'Enable shadows: renderer.shadowMap.enabled = true'
  })
  renderer.shadowMap.enabled ? passed++ : failed++

  results.push({
    category: 'Renderer',
    test: 'Shadow Map Type',
    status: renderer.shadowMap.type === THREE.PCFSoftShadowMap ? 'pass' : 'warning',
    message: `Shadow map type: ${getShadowMapTypeName(renderer.shadowMap.type)}`,
    recommendation: renderer.shadowMap.type !== THREE.PCFSoftShadowMap
      ? 'Consider using PCFSoftShadowMap for better quality'
      : undefined
  })
  renderer.shadowMap.type === THREE.PCFSoftShadowMap ? passed++ : warnings++

  results.push({
    category: 'Renderer',
    test: 'Shadow Map Auto Update',
    status: renderer.shadowMap.autoUpdate ? 'pass' : 'warning',
    message: renderer.shadowMap.autoUpdate
      ? 'Shadow maps update automatically'
      : '⚠️ Shadow maps do NOT update automatically',
    recommendation: renderer.shadowMap.autoUpdate
      ? undefined
      : 'Enable auto-update: renderer.shadowMap.autoUpdate = true'
  })
  renderer.shadowMap.autoUpdate ? passed++ : warnings++

  // ========================================
  // 2. LIGHT SHADOW CONFIGURATION
  // ========================================
  const shadowCastingLights: THREE.Light[] = []
  const allLights: THREE.Light[] = []

  scene.traverse((obj) => {
    if (obj instanceof THREE.Light) {
      allLights.push(obj)
      if (obj.castShadow && obj.shadow) {
        shadowCastingLights.push(obj)
      }
    }
  })

  results.push({
    category: 'Lights',
    test: 'Shadow-Casting Lights Found',
    status: shadowCastingLights.length > 0 ? 'pass' : 'fail',
    message: shadowCastingLights.length > 0
      ? `Found ${shadowCastingLights.length} light(s) casting shadows`
      : '❌ CRITICAL: No lights are casting shadows!',
    recommendation: shadowCastingLights.length === 0
      ? 'At least one light must have castShadow = true and shadow configured'
      : undefined
  })
  shadowCastingLights.length > 0 ? passed++ : failed++

  results.push({
    category: 'Lights',
    test: 'Total Lights in Scene',
    status: allLights.length > 0 ? 'pass' : 'warning',
    message: `Total lights in scene: ${allLights.length}`,
    recommendation: allLights.length === 0 ? 'Add at least one light to the scene' : undefined
  })
  allLights.length > 0 ? passed++ : warnings++

  // Check each shadow-casting light
  shadowCastingLights.forEach((light, index) => {
    const lightType = light.constructor.name
    const hasShadow = !!light.shadow
    const shadowMapSize = light.shadow?.mapSize
    const shadowCamera = light.shadow?.camera

    results.push({
      category: 'Lights',
      test: `Light ${index + 1} (${lightType}) - Shadow Configured`,
      status: hasShadow ? 'pass' : 'fail',
      message: hasShadow
        ? `${lightType} has shadow property configured`
        : `❌ ${lightType} missing shadow property`,
      recommendation: hasShadow ? undefined : 'Configure light.shadow property'
    })
    hasShadow ? passed++ : failed++

    if (hasShadow && shadowMapSize) {
      const mapSize = shadowMapSize.width || shadowMapSize.height || 0
      results.push({
        category: 'Lights',
        test: `Light ${index + 1} - Shadow Map Size`,
        status: mapSize >= 1024 ? 'pass' : mapSize >= 512 ? 'warning' : 'fail',
        message: `Shadow map size: ${mapSize}x${mapSize}`,
        recommendation: mapSize < 1024
          ? `Consider increasing shadow map size to at least 2048x2048 for better quality (current: ${mapSize}x${mapSize})`
          : undefined
      })
      mapSize >= 1024 ? passed++ : mapSize >= 512 ? warnings++ : failed++
    }

    if (hasShadow && shadowCamera) {
      const isOrthographic = shadowCamera instanceof THREE.OrthographicCamera
      const isPerspective = shadowCamera instanceof THREE.PerspectiveCamera

      results.push({
        category: 'Lights',
        test: `Light ${index + 1} - Shadow Camera Type`,
        status: isOrthographic || isPerspective ? 'pass' : 'fail',
        message: isOrthographic
          ? 'Shadow camera is OrthographicCamera (correct for DirectionalLight)'
          : isPerspective
          ? 'Shadow camera is PerspectiveCamera (correct for Point/SpotLight)'
          : '❌ Shadow camera type is invalid',
        recommendation: isOrthographic || isPerspective
          ? undefined
          : 'Shadow camera must be OrthographicCamera or PerspectiveCamera'
      })
      isOrthographic || isPerspective ? passed++ : failed++

      if (isOrthographic) {
        const ortho = shadowCamera as THREE.OrthographicCamera
        const width = ortho.right - ortho.left
        const height = ortho.top - ortho.bottom
        const coverage = width * height

        results.push({
          category: 'Lights',
          test: `Light ${index + 1} - Shadow Camera Coverage`,
          status: coverage > 0 && coverage < 1000000 ? 'pass' : 'warning',
          message: `Shadow camera coverage: ${width.toFixed(1)} x ${height.toFixed(1)} units`,
          recommendation:
            coverage === 0
              ? 'Shadow camera has zero coverage - shadows will not render'
              : coverage > 1000000
              ? 'Shadow camera coverage is very large - shadows may be low quality'
              : undefined
        })
        coverage > 0 && coverage < 1000000 ? passed++ : warnings++
      }
    }
  })

  // ========================================
  // 3. OBJECT SHADOW CONFIGURATION
  // ========================================
  const shadowCastingObjects: THREE.Mesh[] = []
  const shadowReceivingObjects: THREE.Mesh[] = []
  const allMeshes: THREE.Mesh[] = []
  const materialsWithoutShadowSupport: Array<{ mesh: string; material: string }> = []
  const transparentMaterials: Array<{
    mesh: string
    material: string
    transmission: number
    opacity: number
    castShadow: boolean
    depthWrite: boolean
    transparent: boolean
  }> = []
  const incorrectlyConfiguredTransparent: Array<{
    mesh: string
    material: string
    issue: string
  }> = []

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      allMeshes.push(obj)

      // Skip helpers and debug objects
      // IMPROVED: Also skip LineBasicMaterial and other helper materials
      if (
        obj.userData.isShadowPlane ||
        obj.userData.isGridHelper ||
        obj.userData.isAxesHelper ||
        obj.userData.isTransformControls ||
        obj.userData.isLightGizmo ||
        obj.userData.isLightHelper ||
        obj.userData.isGizmo ||
        obj.userData.isHelper
      ) {
        return
      }

      if (obj.castShadow) {
        shadowCastingObjects.push(obj)
      }
      if (obj.receiveShadow) {
        shadowReceivingObjects.push(obj)
      }

      // Check material shadow support and transparent materials
      const material = obj.material
      if (material) {
        const materials = Array.isArray(material) ? material : [material]
        materials.forEach((mat) => {
          // IMPROVED: Skip LineBasicMaterial and other helper materials first
          // These are typically from gizmos/helpers and shouldn't be treated as transparent surfaces
          if (mat instanceof THREE.LineBasicMaterial ||
              mat instanceof THREE.LineDashedMaterial ||
              mat instanceof THREE.PointsMaterial ||
              mat instanceof THREE.SpriteMaterial) {
            return // Skip line materials - they're not surfaces that need shadow configuration
          }
          
          // Check for MeshBasicMaterial (doesn't support shadows)
          if (
            mat instanceof THREE.MeshBasicMaterial &&
            (obj.castShadow || obj.receiveShadow) &&
            !obj.userData.isGroundedSkybox &&
            !obj.userData.ignoreShadowWarnings
          ) {
            materialsWithoutShadowSupport.push({
              mesh: obj.name || 'unnamed',
              material: mat.type
            })
          }

          // IMPROVED: Check for transparent materials (glass/windows)
          
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
          
          // IMPROVED: Detect transparent materials with better filtering
          // Only detect materials that are actually glass/windows, not just any transparent material
          // Skip materials with very low opacity (< 0.1) as they might be gizmo/helper materials
          // Focus on materials with transmission > 0 or glass-like names
          const isTransparent = isPhysicalWithTransmission || 
                               hasTransmission || 
                               (isGlassLike && transparentFlag && opacity < 1.0) ||
                               (transparentFlag && opacity < 1.0 && opacity > 0.1 && (transmission > 0 || isGlassLike))

          if (isTransparent) {
            transparentMaterials.push({
              mesh: obj.name || 'unnamed',
              material: mat.name || mat.type || 'unnamed',
              transmission,
              opacity,
              castShadow: obj.castShadow,
              depthWrite: mat.depthWrite !== false,
              transparent: transparentFlag
            })

            // Check if transparent material is incorrectly configured
            if (obj.castShadow) {
              incorrectlyConfiguredTransparent.push({
                mesh: obj.name || 'unnamed',
                material: mat.name || mat.type || 'unnamed',
                issue: 'Transparent material has castShadow = true (should be false to allow shadows to pass through)'
              })
            }
            if (mat.depthWrite !== false) {
              incorrectlyConfiguredTransparent.push({
                mesh: obj.name || 'unnamed',
                material: mat.name || mat.type || 'unnamed',
                issue: 'Transparent material has depthWrite = true (should be false to allow shadows to pass through)'
              })
            }
            if (!obj.receiveShadow) {
              incorrectlyConfiguredTransparent.push({
                mesh: obj.name || 'unnamed',
                material: mat.name || mat.type || 'unnamed',
                issue: 'Transparent material has receiveShadow = false (should be true to receive shadows on glass)'
              })
            }
          }
        })
      }
    }
  })

  // Only fail if renderer shadows are enabled but no objects are casting shadows
  // If shadows are disabled or scene is empty, this is expected
  const hasAnyObjects = allMeshes.length > 0
  const shadowTestStatus = shadowCastingObjects.length > 0 
    ? 'pass' 
    : (hasAnyObjects && renderer.shadowMap.enabled) 
      ? 'fail' 
      : 'warning' // Warning if scene is empty or shadows disabled
  
  results.push({
    category: 'Objects',
    test: 'Objects Casting Shadows',
    status: shadowTestStatus,
    message: shadowCastingObjects.length > 0
      ? `Found ${shadowCastingObjects.length} object(s) casting shadows`
      : hasAnyObjects && renderer.shadowMap.enabled
        ? '❌ CRITICAL: No objects are casting shadows!'
        : hasAnyObjects
          ? '⚠️ No objects are casting shadows (shadows may be disabled)'
          : 'ℹ️ No objects in scene yet (expected on initial load)',
    recommendation:
      shadowCastingObjects.length === 0 && hasAnyObjects && renderer.shadowMap.enabled
        ? 'Set castShadow = true on at least one mesh in the scene'
        : undefined
  })
  shadowTestStatus === 'pass' ? passed++ : shadowTestStatus === 'fail' ? failed++ : warnings++

  // Only fail if renderer shadows are enabled but no objects are receiving shadows
  // If shadows are disabled or scene is empty, this is expected
  const receiveShadowTestStatus = shadowReceivingObjects.length > 0 
    ? 'pass' 
    : (hasAnyObjects && renderer.shadowMap.enabled) 
      ? 'fail' 
      : 'warning' // Warning if scene is empty or shadows disabled
  
  results.push({
    category: 'Objects',
    test: 'Objects Receiving Shadows',
    status: receiveShadowTestStatus,
    message: shadowReceivingObjects.length > 0
      ? `Found ${shadowReceivingObjects.length} object(s) receiving shadows`
      : hasAnyObjects && renderer.shadowMap.enabled
        ? '❌ CRITICAL: No objects are receiving shadows!'
        : hasAnyObjects
          ? '⚠️ No objects are receiving shadows (shadows may be disabled)'
          : 'ℹ️ No objects in scene yet (expected on initial load)',
    recommendation:
      shadowReceivingObjects.length === 0 && hasAnyObjects && renderer.shadowMap.enabled
        ? 'Set receiveShadow = true on at least one mesh (like ground plane)'
        : undefined
  })
  receiveShadowTestStatus === 'pass' ? passed++ : receiveShadowTestStatus === 'fail' ? failed++ : warnings++

  results.push({
    category: 'Objects',
    test: 'Materials Supporting Shadows',
    status: materialsWithoutShadowSupport.length === 0 ? 'pass' : 'warning',
    message:
      materialsWithoutShadowSupport.length === 0
        ? 'All materials support shadows'
        : `⚠️ ${materialsWithoutShadowSupport.length} mesh(es) use MeshBasicMaterial which doesn't support shadows`,
    recommendation:
      materialsWithoutShadowSupport.length > 0
        ? 'Convert MeshBasicMaterial to MeshStandardMaterial for shadow support'
        : undefined
  })
  materialsWithoutShadowSupport.length === 0 ? passed++ : warnings++

  // Check transparent materials configuration
  results.push({
    category: 'Transparent Materials',
    test: 'Transparent Materials Detected',
    status: transparentMaterials.length > 0 ? 'pass' : 'warning',
    message: transparentMaterials.length > 0
      ? `Found ${transparentMaterials.length} transparent material(s) (glass/windows)`
      : 'No transparent materials detected in scene',
    recommendation: transparentMaterials.length === 0
      ? 'If scene has glass/windows, ensure materials have transmission > 0 or transparent flag'
      : undefined
  })
  transparentMaterials.length > 0 ? passed++ : warnings++

  // Check if transparent materials are correctly configured
  results.push({
    category: 'Transparent Materials',
    test: 'Transparent Materials Configuration',
    status: incorrectlyConfiguredTransparent.length === 0 ? 'pass' : 'fail',
    message: incorrectlyConfiguredTransparent.length === 0
      ? `All ${transparentMaterials.length} transparent material(s) are correctly configured for shadow passing`
      : `❌ ${incorrectlyConfiguredTransparent.length} transparent material(s) are incorrectly configured`,
    recommendation: incorrectlyConfiguredTransparent.length > 0
      ? 'Transparent materials should have: castShadow = false, depthWrite = false, receiveShadow = true'
      : undefined
  })
  incorrectlyConfiguredTransparent.length === 0 ? passed++ : failed++

  // IMPROVED: Log transparent materials details for debugging (only when there are issues)
  // Reduced logging frequency - only log when there are incorrectly configured materials
  if (transparentMaterials.length > 0 && incorrectlyConfiguredTransparent.length > 0) {
    console.group('[ShadowDebug] Transparent Materials Detected (with issues):')
    // Only log incorrectly configured materials to reduce console spam
    incorrectlyConfiguredTransparent.forEach((ic) => {
      const tm = transparentMaterials.find(t => t.mesh === ic.mesh && t.material === ic.material)
      if (tm) {
        console.log(`  - ${tm.mesh} (${tm.material}): ${ic.issue}, transmission=${tm.transmission}, opacity=${tm.opacity}, castShadow=${tm.castShadow}, depthWrite=${tm.depthWrite}, transparent=${tm.transparent}`)
      }
    })
    console.groupEnd()
  } else if (transparentMaterials.length > 0 && incorrectlyConfiguredTransparent.length === 0) {
    // Only log summary when all transparent materials are correctly configured (once per diagnostic run)
    // Use a throttled log to prevent spam
    const lastSummaryLog = (window as any).__lastTransparentSummaryLog || 0
    const now = Date.now()
    if (now - lastSummaryLog > 30000) { // Log summary at most once every 30 seconds
      (window as any).__lastTransparentSummaryLog = now
      console.log(`[ShadowDebug] ✅ All ${transparentMaterials.length} transparent material(s) are correctly configured for shadow passing`)
    }
  }

  // ========================================
  // 4. GROUND PROJECTION SHADOW SUPPORT
  // ========================================
  let groundedSkybox: THREE.Mesh | null = null
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj as any).isGroundedSkybox) {
      groundedSkybox = obj
    }
  })

  if (groundedSkybox) {
    results.push({
      category: 'Ground Projection',
      test: 'GroundedSkybox Receives Shadows',
      status: groundedSkybox.receiveShadow ? 'pass' : 'fail',
      message: groundedSkybox.receiveShadow
        ? 'GroundedSkybox is configured to receive shadows'
        : '❌ GroundedSkybox is NOT receiving shadows',
      recommendation: groundedSkybox.receiveShadow
        ? undefined
        : 'Set groundedSkybox.receiveShadow = true'
    })
    groundedSkybox.receiveShadow ? passed++ : failed++

    if (groundedSkybox.material instanceof THREE.ShaderMaterial) {
      const hasShadowDefines =
        groundedSkybox.material.defines &&
        (groundedSkybox.material.defines.USE_SHADOWMAP !== undefined ||
          groundedSkybox.material.defines.SHADOWMAP_TYPE_PCF !== undefined)

      results.push({
        category: 'Ground Projection',
        test: 'GroundedSkybox Shader Shadow Support',
        status: hasShadowDefines ? 'pass' : 'fail',
        message: hasShadowDefines
          ? 'GroundedSkybox shader includes shadow map defines'
          : '❌ GroundedSkybox shader missing shadow map support',
        recommendation: hasShadowDefines
          ? undefined
          : 'Inject shadow map chunks into GroundedSkybox shader'
      })
      hasShadowDefines ? passed++ : failed++
    }
  }

  // ========================================
  // 5. SHADOW CAMERA BOUNDS
  // ========================================
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow && light.shadow.camera instanceof THREE.OrthographicCamera) {
      const shadowCamera = light.shadow.camera as THREE.OrthographicCamera
      const box = new THREE.Box3()
      let hasObjects = false

      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh &&
          (obj.castShadow || obj.receiveShadow) &&
          !obj.userData.isShadowPlane &&
          !obj.userData.isGridHelper
        ) {
          const objBox = new THREE.Box3().setFromObject(obj)
          if (!objBox.isEmpty()) {
            if (!hasObjects) {
              box.copy(objBox)
              hasObjects = true
            } else {
              box.union(objBox)
            }
          }
        }
      })

      if (hasObjects) {
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        // Use same formula as actual bounds calculation for consistency
        // Base multiplier: 2.5-4.0x, with adaptive max size for large scenes
        const baseMultiplier = 4.0 // Use the larger multiplier for diagnostic (full scene)
        const sizeFactor = maxDim > 50 ? Math.max(0.5, 1.0 - (maxDim - 50) / 200) : 1.0
        const boundsMultiplier = baseMultiplier * sizeFactor
        const shadowSize = Math.max(maxDim * boundsMultiplier, 50)
        const padding = Math.min(Math.max(maxDim * 0.1, 10), 50)
        const finalShadowSize = shadowSize + padding
        // Adaptive max size matches actual bounds calculation
        const adaptiveMaxSize = maxDim > 1000 ? Math.min(maxDim * 1.5, 10000) : 2000
        const maxShadowSize = Math.max(adaptiveMaxSize, 2000)
        const expectedShadowSize = Math.min(finalShadowSize, maxShadowSize)
        
        const cameraWidth = shadowCamera.right - shadowCamera.left
        const cameraHeight = shadowCamera.top - shadowCamera.bottom
        // More lenient bounds: allow 0.3x to 2x of expected size (accounts for visible vs full scene differences)
        const lowerBound = expectedShadowSize * 0.3
        const upperBound = expectedShadowSize * 2.0

        results.push({
          category: 'Shadow Camera',
          test: `Light ${index + 1} - Camera Bounds Coverage`,
          status:
            cameraWidth >= lowerBound && cameraWidth <= upperBound
              ? 'pass'
              : 'warning',
          message: `Shadow camera: ${cameraWidth.toFixed(1)} x ${cameraHeight.toFixed(1)}, Scene: ${expectedShadowSize.toFixed(1)}`,
          recommendation:
            cameraWidth < lowerBound
              ? 'Shadow camera may be too small - shadows may be cut off'
              : cameraWidth > upperBound
              ? 'Shadow camera may be too large - shadows may be low quality'
              : undefined
        })
        cameraWidth >= lowerBound && cameraWidth <= upperBound ? passed++ : warnings++
      }
    }
  })

  // ========================================
  // 6. SHADOW BIAS SETTINGS
  // ========================================
  shadowCastingLights.forEach((light, index) => {
    if (light.shadow) {
      const bias = light.shadow.bias || 0
      const normalBias = light.shadow.normalBias || 0

      results.push({
        category: 'Shadow Quality',
        test: `Light ${index + 1} - Shadow Bias`,
        status: bias >= -0.001 && bias <= 0.001 ? 'pass' : 'warning',
        message: `Shadow bias: ${bias.toFixed(6)}, Normal bias: ${normalBias.toFixed(6)}`,
        recommendation:
          bias < -0.001
            ? 'Bias is too negative - may cause shadow acne'
            : bias > 0.001
            ? 'Bias is too positive - may cause shadow detachment'
            : undefined
      })
      bias >= -0.001 && bias <= 0.001 ? passed++ : warnings++
    }
  })

  // ========================================
  // 7. SCENE VISIBILITY
  // ========================================
  const visibleCastingObjects = shadowCastingObjects.filter((obj) => obj.visible)
  const visibleReceivingObjects = shadowReceivingObjects.filter((obj) => obj.visible)

  // Only fail if there are shadow-casting objects but they're all invisible
  // If there are no objects, this is expected
  const visibleCastingTestStatus = visibleCastingObjects.length > 0 
    ? 'pass' 
    : shadowCastingObjects.length > 0 
      ? 'fail' 
      : 'warning' // Warning if no objects at all
  
  results.push({
    category: 'Visibility',
    test: 'Shadow-Casting Objects Visible',
    status: visibleCastingTestStatus,
    message:
      visibleCastingObjects.length > 0
        ? `${visibleCastingObjects.length} visible object(s) casting shadows`
        : shadowCastingObjects.length > 0
          ? '❌ All shadow-casting objects are invisible!'
          : 'ℹ️ No shadow-casting objects in scene yet (expected on initial load)',
    recommendation:
      visibleCastingObjects.length === 0 && shadowCastingObjects.length > 0
        ? 'Make at least one shadow-casting object visible'
        : undefined
  })
  visibleCastingTestStatus === 'pass' ? passed++ : visibleCastingTestStatus === 'fail' ? failed++ : warnings++

  // Only fail if there are shadow-receiving objects but they're all invisible
  // If there are no objects, this is expected
  const visibleReceivingTestStatus = visibleReceivingObjects.length > 0 
    ? 'pass' 
    : shadowReceivingObjects.length > 0 
      ? 'fail' 
      : 'warning' // Warning if no objects at all
  
  results.push({
    category: 'Visibility',
    test: 'Shadow-Receiving Objects Visible',
    status: visibleReceivingTestStatus,
    message:
      visibleReceivingObjects.length > 0
        ? `${visibleReceivingObjects.length} visible object(s) receiving shadows`
        : shadowReceivingObjects.length > 0
          ? '❌ All shadow-receiving objects are invisible!'
          : 'ℹ️ No shadow-receiving objects in scene yet (expected on initial load)',
    recommendation:
      visibleReceivingObjects.length === 0 && shadowReceivingObjects.length > 0
        ? 'Make at least one shadow-receiving object visible'
        : undefined
  })
  visibleReceivingTestStatus === 'pass' ? passed++ : visibleReceivingTestStatus === 'fail' ? failed++ : warnings++

  // ========================================
  // SUMMARY
  // ========================================
  const totalTests = results.length
  const overallStatus: 'healthy' | 'issues' | 'critical' =
    failed > 0 ? 'critical' : warnings > 0 ? 'issues' : 'healthy'

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    results,
    summary: {
      totalTests,
      passed,
      failed,
      warnings
    }
  }
}

function getShadowMapTypeName(type: number): string {
  const types: { [key: number]: string } = {
    [THREE.BasicShadowMap]: 'BasicShadowMap',
    [THREE.PCFShadowMap]: 'PCFShadowMap',
    [THREE.PCFSoftShadowMap]: 'PCFSoftShadowMap',
    [THREE.VSMShadowMap]: 'VSMShadowMap'
  }
  return types[type] || `Unknown (${type})`
}





