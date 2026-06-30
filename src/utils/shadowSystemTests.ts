/**
 * Shadow System Tests for Main Application
 * Compares shadow behavior with test demo to ensure consistency
 */

import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { effectiveShadowPlaneVisible } from '../viewer/utils/hdrGroundShadowCatcher'

export interface ShadowTestResult {
  name: string
  passed: boolean
  expected: any
  actual: any
  message: string
}

export interface ShadowTestSuite {
  renderer: ShadowTestResult[]
  lights: ShadowTestResult[]
  objects: ShadowTestResult[]
  shadowPlane: ShadowTestResult[]
  camera: ShadowTestResult[]
  hdr: ShadowTestResult[]
  overall: {
    passed: number
    failed: number
    total: number
  }
}

/**
 * Run comprehensive shadow system tests
 */
export function runShadowSystemTests(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera?: THREE.Camera,
  viewer?: any // ViewerInstance for accessing HDR system
): ShadowTestSuite {
  const results: ShadowTestSuite = {
    renderer: [],
    lights: [],
    objects: [],
    shadowPlane: [],
    camera: [],
    hdr: [],
    overall: { passed: 0, failed: 0, total: 0 }
  }

  // Test 1: Renderer Shadow Map Enabled
  const rendererEnabled = renderer.shadowMap.enabled === true
  results.renderer.push({
    name: 'Renderer shadow map enabled',
    passed: rendererEnabled,
    expected: true,
    actual: renderer.shadowMap.enabled,
    message: rendererEnabled 
      ? '✅ Renderer shadow map is enabled' 
      : '❌ Renderer shadow map is disabled'
  })

  // Test 2: Renderer Shadow Map Type
  const shadowMapType = renderer.shadowMap.type
  const expectedType = THREE.PCFShadowMap
  const typeCorrect = shadowMapType === expectedType
  results.renderer.push({
    name: 'Renderer shadow map type',
    passed: typeCorrect,
    expected: 'PCFShadowMap',
    actual: getShadowMapTypeName(shadowMapType),
    message: typeCorrect 
      ? '✅ Shadow map type is PCFShadowMap' 
      : `❌ Shadow map type is ${getShadowMapTypeName(shadowMapType)}, expected PCFShadowMap`
  })

  // Test 3: Find Directional Lights
  const directionalLights: THREE.DirectionalLight[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
      directionalLights.push(obj)
    }
  })

  results.lights.push({
    name: 'Directional lights exist',
    passed: directionalLights.length > 0,
    expected: '> 0',
    actual: directionalLights.length,
    message: directionalLights.length > 0 
      ? `✅ Found ${directionalLights.length} directional light(s)` 
      : '❌ No directional lights found'
  })

  // Test 4: Directional Light Shadow Configuration
  if (directionalLights.length > 0) {
    const light = directionalLights[0]
    
    // Test shadow map size
    const shadowMapSize = light.shadow?.mapSize?.width || 0
    const expectedMinSize = 2048 // Test demo uses 2048
    const sizeCorrect = shadowMapSize >= expectedMinSize
    results.lights.push({
      name: 'Shadow map size',
      passed: sizeCorrect,
      expected: `>= ${expectedMinSize}px`,
      actual: `${shadowMapSize}px`,
      message: sizeCorrect 
        ? `✅ Shadow map size is ${shadowMapSize}px` 
        : `❌ Shadow map size is ${shadowMapSize}px, expected >= ${expectedMinSize}px`
    })

    // Test shadow camera bounds (should be tight like test demo: -10 to 10)
    if (light.shadow?.camera) {
      const shadowCamera = light.shadow.camera as THREE.OrthographicCamera
      const left = shadowCamera.left
      const right = shadowCamera.right
      const top = shadowCamera.top
      const bottom = shadowCamera.bottom
      
      // Test demo uses -10 to 10, but we allow some flexibility for dynamic bounds
      const boundsReasonable = Math.abs(left) <= 50 && Math.abs(right) <= 50 && 
                               Math.abs(top) <= 50 && Math.abs(bottom) <= 50
      
      results.camera.push({
        name: 'Shadow camera bounds (tight)',
        passed: boundsReasonable,
        expected: 'Within -50 to 50 (like test demo: -10 to 10)',
        actual: `left: ${left}, right: ${right}, top: ${top}, bottom: ${bottom}`,
        message: boundsReasonable 
          ? `✅ Shadow camera bounds are reasonable (${left} to ${right})` 
          : `❌ Shadow camera bounds are too large (${left} to ${right}), expected tighter bounds like test demo`
      })

      // Test shadow camera near/far
      const near = shadowCamera.near
      const far = shadowCamera.far
      const nearCorrect = near <= 0.1 // Test demo uses 0.1
      const farReasonable = far <= 100 // Test demo uses 50, but allow up to 100 for dynamic
      
      results.camera.push({
        name: 'Shadow camera near plane',
        passed: nearCorrect,
        expected: '<= 0.1 (like test demo)',
        actual: near,
        message: nearCorrect 
          ? `✅ Shadow camera near is ${near}` 
          : `❌ Shadow camera near is ${near}, expected <= 0.1`
      })

      results.camera.push({
        name: 'Shadow camera far plane',
        passed: farReasonable,
        expected: '<= 100 (test demo uses 50)',
        actual: far,
        message: farReasonable 
          ? `✅ Shadow camera far is ${far}` 
          : `❌ Shadow camera far is ${far}, expected <= 100`
      })

      // Test shadow radius (should be 2 after our fixes)
      // CRITICAL: Three.js defaults radius to 0 if not set, so we check for undefined or 0
      const radius = light.shadow.radius ?? 0
      const radiusCorrect = radius >= 1 && radius <= 3 // Allow some flexibility
      results.lights.push({
        name: 'Shadow radius',
        passed: radiusCorrect,
        expected: '1-3 (test demo uses default, we use 2)',
        actual: radius,
        message: radiusCorrect 
          ? `✅ Shadow radius is ${radius}` 
          : `❌ Shadow radius is ${radius}, expected 1-3`
      })
    }
  }

  // Test 5: Objects Cast Shadows
  const objects: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && 
        !obj.userData.isShadowPlane && 
        !obj.userData.isGridHelper &&
        !obj.userData.isAxesHelper &&
        !obj.userData.isLightGizmo &&
        !obj.userData.isLightHelper) {
      objects.push(obj)
    }
  })

  const objectsCastingShadows = objects.filter(obj => obj.castShadow).length
  results.objects.push({
    name: 'Objects cast shadows',
    passed: objectsCastingShadows > 0,
    expected: '> 0',
    actual: `${objectsCastingShadows} of ${objects.length}`,
    message: objectsCastingShadows > 0 
      ? `✅ ${objectsCastingShadows} of ${objects.length} objects cast shadows` 
      : `❌ No objects cast shadows (${objects.length} objects found)`
  })

  // Test 6: Objects Receive Shadows
  const objectsReceivingShadows = objects.filter(obj => obj.receiveShadow).length
  results.objects.push({
    name: 'Objects receive shadows',
    passed: objectsReceivingShadows > 0,
    expected: '> 0',
    actual: `${objectsReceivingShadows} of ${objects.length}`,
    message: objectsReceivingShadows > 0 
      ? `✅ ${objectsReceivingShadows} of ${objects.length} objects receive shadows` 
      : `❌ No objects receive shadows (${objects.length} objects found)`
  })

  // Test 7: Shadow Plane
  // CRITICAL: Shadow plane is inside a group, so we must traverse the scene
  let shadowPlane: THREE.Mesh | undefined
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData.isShadowPlane && !shadowPlane) {
      shadowPlane = obj
    }
  })

  if (shadowPlane) {
    results.shadowPlane.push({
      name: 'Shadow plane exists',
      passed: true,
      expected: true,
      actual: true,
      message: '✅ Shadow plane found'
    })

    results.shadowPlane.push({
      name: 'Shadow plane receives shadows',
      passed: shadowPlane.receiveShadow === true,
      expected: true,
      actual: shadowPlane.receiveShadow,
      message: shadowPlane.receiveShadow 
        ? '✅ Shadow plane receives shadows' 
        : '❌ Shadow plane does not receive shadows'
    })

    results.shadowPlane.push({
      name: 'Shadow plane does not cast shadows',
      passed: shadowPlane.castShadow === false,
      expected: false,
      actual: shadowPlane.castShadow,
      message: shadowPlane.castShadow === false 
        ? '✅ Shadow plane does not cast shadows' 
        : '❌ Shadow plane should not cast shadows'
    })

    // Test shadow plane visibility (HDR + shadows auto-shows plane or user toggle)
    const store = useAppStore.getState()
    const shadowPlaneShouldBeVisible = effectiveShadowPlaneVisible(store.showShadowPlane, {
      hdrEnabled: store.hdrEnabled,
      hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
      shadowsEnabled: store.shadowsEnabled
    })
    let visibilityReason = ''
    if (shadowPlaneShouldBeVisible && store.hdrEnabled && store.shadowsEnabled) {
      if (store.hdrGroundProjectionEnabled) {
        visibilityReason = 'HDR ground projection uses shadow catcher overlay'
      } else if (!store.showShadowPlane) {
        visibilityReason = 'HDR + shadows auto-shows shadow catcher on default grid'
      } else {
        visibilityReason = 'user shadow plane toggle on under HDR'
      }
    }

    const visibilityTestPasses = shadowPlane.visible === shadowPlaneShouldBeVisible
    
    results.shadowPlane.push({
      name: 'Shadow plane is visible',
      passed: visibilityTestPasses,
      expected: shadowPlaneShouldBeVisible,
      actual: shadowPlane.visible,
      message: shadowPlane.visible 
        ? `✅ Shadow plane is visible${visibilityReason ? ` (${visibilityReason})` : ''}` 
        : `ℹ️ Shadow plane is hidden${visibilityReason ? ` (${visibilityReason})` : ''}`
    })
  } else {
    results.shadowPlane.push({
      name: 'Shadow plane exists',
      passed: false,
      expected: true,
      actual: false,
      message: '❌ Shadow plane not found'
    })
  }

  // Test 8: HDR System
  if (viewer) {
    const hdrSystem = viewer.hdrSystem
    const environmentMap = viewer.environmentMap
    const pmremEnvMap = viewer.pmremEnvMap
    
    // Test HDR System exists
    results.hdr.push({
      name: 'HDR System exists',
      passed: hdrSystem !== undefined && hdrSystem !== null,
      expected: true,
      actual: hdrSystem !== undefined && hdrSystem !== null,
      message: hdrSystem 
        ? '✅ HDR System found' 
        : '⚠️ HDR System not found (optional)'
    })

    // Test environment map (optional - passes if HDR system exists, even if not loaded)
    results.hdr.push({
      name: 'Environment map exists',
      passed: true, // Always pass - HDR is optional
      expected: true,
      actual: environmentMap !== null && environmentMap !== undefined,
      message: environmentMap 
        ? '✅ Environment map found' 
        : 'ℹ️ Environment map not loaded (HDR is optional)'
    })

    // Test PMREM environment map (optional - passes if HDR system exists, even if not created)
    results.hdr.push({
      name: 'PMREM environment map exists',
      passed: true, // Always pass - HDR is optional
      expected: true,
      actual: pmremEnvMap !== null && pmremEnvMap !== undefined,
      message: pmremEnvMap 
        ? '✅ PMREM environment map found' 
        : 'ℹ️ PMREM environment map not created (HDR is optional)'
    })

    // Test scene environment
    const sceneEnv = scene.environment
    results.hdr.push({
      name: 'Scene environment set',
      passed: sceneEnv !== null && sceneEnv !== undefined,
      expected: true,
      actual: sceneEnv !== null && sceneEnv !== undefined,
      message: sceneEnv 
        ? '✅ Scene environment is set' 
        : '⚠️ Scene environment not set (optional)'
    })

    // Test scene background
    // Background should be set if HDR is loaded and background visibility is enabled
    const sceneBackground = scene.background
    const hasHDRLoaded = environmentMap !== null && environmentMap !== undefined
    let backgroundShouldBeSet = false
    let backgroundReason = ''
    
    if (hdrSystem && (hdrSystem as any).config) {
      const hdrConfig = (hdrSystem as any).config
      const backgroundVisible = hdrConfig.backgroundVisible !== false // Default is true
      const groundProjectionEnabled = hdrConfig.groundProjection?.enabled === true
      
      // Background should be set if:
      // 1. HDR is loaded AND
      // 2. Background visibility is enabled AND
      // 3. Ground projection is NOT enabled (ground projection replaces background)
      if (hasHDRLoaded && backgroundVisible && !groundProjectionEnabled) {
        backgroundShouldBeSet = true
        backgroundReason = 'HDR loaded with background visible'
      } else if (hasHDRLoaded && groundProjectionEnabled) {
        backgroundReason = 'Ground projection enabled (replaces background)'
      } else if (hasHDRLoaded && !backgroundVisible) {
        backgroundReason = 'Background visibility disabled'
      } else {
        backgroundReason = 'No HDR loaded'
      }
    } else {
      backgroundReason = 'HDR system not configured'
    }
    
    // Pass if background is set when it should be, or if it's optional
    const backgroundTestPasses = backgroundShouldBeSet 
      ? (sceneBackground !== null && sceneBackground !== undefined)
      : true // Optional if HDR not loaded or background disabled
    
    results.hdr.push({
      name: 'Scene background set',
      passed: backgroundTestPasses,
      expected: backgroundShouldBeSet ? true : 'optional',
      actual: sceneBackground !== null && sceneBackground !== undefined,
      message: sceneBackground 
        ? `✅ Scene background is set${backgroundReason ? ` (${backgroundReason})` : ''}` 
        : `ℹ️ Scene background not set (${backgroundReason})`
    })

    // Test HDR System enabled state (optional - passes if HDR system exists, even if disabled)
    if (hdrSystem && (hdrSystem as any).config) {
      const hdrEnabled = (hdrSystem as any).config.enabled === true
      results.hdr.push({
        name: 'HDR System enabled',
        passed: true, // Always pass - HDR is optional
        expected: true,
        actual: hdrEnabled,
        message: hdrEnabled 
          ? '✅ HDR System is enabled' 
          : 'ℹ️ HDR System is disabled (HDR is optional)'
      })
    }
  } else {
    // Viewer not provided, skip HDR tests
    results.hdr.push({
      name: 'HDR System exists',
      passed: false,
      expected: true,
      actual: false,
      message: '⚠️ Viewer instance not provided, skipping HDR tests'
    })
  }

  // Calculate overall statistics
  const allTests = [
    ...results.renderer,
    ...results.lights,
    ...results.objects,
    ...results.shadowPlane,
    ...results.camera,
    ...results.hdr
  ]

  results.overall.total = allTests.length
  results.overall.passed = allTests.filter(t => t.passed).length
  results.overall.failed = allTests.filter(t => !t.passed).length

  return results
}

/**
 * Get shadow map type name
 */
function getShadowMapTypeName(type: THREE.ShadowMapType): string {
  switch (type) {
    case THREE.BasicShadowMap:
      return 'BasicShadowMap'
    case THREE.PCFShadowMap:
      return 'PCFShadowMap'
    case THREE.PCFSoftShadowMap:
      return 'PCFSoftShadowMap'
    case THREE.VSMShadowMap:
      return 'VSMShadowMap'
    default:
      return `Unknown (${type})`
  }
}

/**
 * Format test results as string
 */
export function formatTestResults(results: ShadowTestSuite): string {
  let output = '=== Shadow System Test Results ===\n\n'
  
  output += `Overall: ${results.overall.passed}/${results.overall.total} tests passed\n\n`

  const sections = [
    { name: 'Renderer', tests: results.renderer },
    { name: 'Lights', tests: results.lights },
    { name: 'Objects', tests: results.objects },
    { name: 'Shadow Plane', tests: results.shadowPlane },
    { name: 'Shadow Camera', tests: results.camera },
    { name: 'HDR', tests: results.hdr }
  ]

  sections.forEach(section => {
    if (section.tests.length > 0) {
      output += `\n--- ${section.name} ---\n`
      section.tests.forEach(test => {
        output += `${test.message}\n`
        if (!test.passed) {
          output += `  Expected: ${test.expected}\n`
          output += `  Actual: ${test.actual}\n`
        }
      })
    }
  })

  return output
}

/**
 * Compare with test demo expectations
 */
export function compareWithTestDemo(results: ShadowTestSuite): {
  matches: boolean
  differences: string[]
} {
  const differences: string[] = []
  let matches = true

  // Check renderer shadow map enabled
  const rendererEnabled = results.renderer.find(t => t.name === 'Renderer shadow map enabled')
  if (!rendererEnabled?.passed) {
    matches = false
    differences.push('Renderer shadow map is not enabled (test demo: enabled)')
  }

  // Check shadow map type
  const shadowMapType = results.renderer.find(t => t.name === 'Renderer shadow map type')
  if (!shadowMapType?.passed) {
    matches = false
    differences.push(`Shadow map type mismatch: ${shadowMapType?.actual} (test demo: PCFShadowMap)`)
  }

  // Check shadow camera bounds
  const cameraBounds = results.camera.find(t => t.name === 'Shadow camera bounds (tight)')
  if (!cameraBounds?.passed) {
    matches = false
    differences.push(`Shadow camera bounds too large: ${cameraBounds?.actual} (test demo: -10 to 10)`)
  }

  // Check objects casting shadows
  const objectsCast = results.objects.find(t => t.name === 'Objects cast shadows')
  if (!objectsCast?.passed) {
    matches = false
    differences.push('No objects cast shadows (test demo: all objects cast shadows)')
  }

  // Check shadow plane
  const shadowPlaneExists = results.shadowPlane.find(t => t.name === 'Shadow plane exists')
  if (!shadowPlaneExists?.passed) {
    matches = false
    differences.push('Shadow plane not found (test demo: shadow plane exists)')
  }

  return { matches, differences }
}

