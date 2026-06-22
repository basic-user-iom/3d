/**
 * Enhanced Shadow System Test Runner
 * Captures all test data and saves to console/file
 */

import * as THREE from 'three'
import { ViewerInstance } from '../../types/viewer'

interface TestResult {
  timestamp: string
  testName: string
  fromSystem: string
  toSystem: string
  beforeState: any
  afterState: any
  lightStates: {
    before: any[]
    after: any[]
    restored: boolean[]
  }
  shadowPlaneState: {
    before: any
    after: any
  }
  shadowCameraState: {
    before: any[]
    after: any[]
  }
  materialState: {
    before: any
    after: any
  }
  systemState: {
    before: any
    after: any
  }
  errors: string[]
  warnings: string[]
  success: boolean
}

interface TestSuiteResults {
  timestamp: string
  totalTests: number
  passedTests: number
  failedTests: number
  results: TestResult[]
  summary: {
    lightPositionRestoration: { success: number; failed: number }
    shadowCameraRestoration: { success: number; failed: number }
    shadowPlaneRestoration: { success: number; failed: number }
    materialStatePreservation: { success: number; failed: number }
    systemStateConsistency: { success: number; failed: number }
  }
}

let testResults: TestResult[] = []
let viewerRef: ViewerInstance | null = null

export function setViewerRef(viewer: ViewerInstance): void {
  viewerRef = viewer
}

/**
 * Capture complete light state
 */
function captureLightState(light: THREE.DirectionalLight): any {
  return {
    uuid: light.uuid,
    name: light.name,
    position: {
      x: light.position.x,
      y: light.position.y,
      z: light.position.z
    },
    target: {
      x: light.target.position.x,
      y: light.target.position.y,
      z: light.target.position.z
    },
    intensity: light.intensity,
    visible: light.visible,
    castShadow: light.castShadow,
    shadow: light.shadow ? {
      enabled: light.shadow.enabled,
      mapSize: {
        width: light.shadow.mapSize.width,
        height: light.shadow.mapSize.height
      },
      camera: light.shadow.camera ? {
        type: light.shadow.camera.type,
        left: (light.shadow.camera as THREE.OrthographicCamera).left,
        right: (light.shadow.camera as THREE.OrthographicCamera).right,
        top: (light.shadow.camera as THREE.OrthographicCamera).top,
        bottom: (light.shadow.camera as THREE.OrthographicCamera).bottom,
        near: light.shadow.camera.near,
        far: light.shadow.camera.far,
        position: {
          x: light.shadow.camera.position.x,
          y: light.shadow.camera.position.y,
          z: light.shadow.camera.position.z
        }
      } : null,
      bias: light.shadow.bias,
      normalBias: light.shadow.normalBias
    } : null,
    userData: {
      _originalPositionSaved: light.userData._originalPositionSaved || false,
      _originalPosition: light.userData._originalPosition ? {
        x: light.userData._originalPosition.x,
        y: light.userData._originalPosition.y,
        z: light.userData._originalPosition.z
      } : null,
      _originalTargetPosition: light.userData._originalTargetPosition ? {
        x: light.userData._originalTargetPosition.x,
        y: light.userData._originalTargetPosition.y,
        z: light.userData._originalTargetPosition.z
      } : null,
      _originalIntensity: light.userData._originalIntensity,
      _originalCastShadow: light.userData._originalCastShadow,
      _originalVisible: light.userData._originalVisible,
      _lightSaveId: light.userData._lightSaveId
    }
  }
}

/**
 * Capture shadow plane state
 */
function captureShadowPlaneState(plane: THREE.Mesh | undefined): any {
  if (!plane) return null
  
  return {
    visible: plane.visible,
    position: {
      x: plane.position.x,
      y: plane.position.y,
      z: plane.position.z
    },
    receiveShadow: plane.receiveShadow,
    castShadow: plane.castShadow,
    material: plane.material ? {
      type: plane.material.type,
      transparent: (plane.material as THREE.MeshStandardMaterial).transparent,
      opacity: (plane.material as THREE.MeshStandardMaterial).opacity,
      depthWrite: (plane.material as THREE.MeshStandardMaterial).depthWrite
    } : null
  }
}

/**
 * Capture system state
 */
function captureSystemState(): any {
  if (!viewerRef) return null
  
  const scene = viewerRef.scene
  let csmLightCount = 0
  let standardLightCount = 0
  
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight) {
      if (obj.userData.isCSMLight) {
        csmLightCount++
      } else if (!obj.userData.isCSMLight && !obj.userData.isStandaloneWeatherLight) {
        standardLightCount++
      }
    }
  })
  
  return {
    currentSystem: viewerRef.shadowManager?.getCurrentSystem?.() || 'unknown',
    csmActive: viewerRef.shadowManager?.isSystemActive?.('csm') || false,
    standardActive: viewerRef.shadowManager?.isSystemActive?.('standard') || false,
    csmLightsInScene: csmLightCount,
    standardLightsInScene: standardLightCount,
    csmSystemExists: !!viewerRef.csmShadowSystem,
    shadowPlaneExists: !!viewerRef.shadowPlane,
    rendererShadowsEnabled: viewerRef.renderer.shadowMap.enabled,
    rendererShadowMapType: viewerRef.renderer.shadowMap.type
  }
}

/**
 * Run comprehensive test with full data capture
 */
export async function runComprehensiveTestWithCapture(): Promise<TestSuiteResults> {
  if (!viewerRef) {
    throw new Error('No viewer reference - cannot run tests')
  }
  
  testResults = []
  const errors: string[] = []
  const warnings: string[] = []
  
  console.log('🚀 Starting Comprehensive Shadow System Tests with Full Data Capture\n')
  console.log('='.repeat(80))
  
  try {
    // Test 1: Standard → Weather GL
    console.log('\n📋 Test 1: Standard → Weather GL (CSM)')
    const test1 = await captureTestTransition('standard', 'csm', 'Standard to Weather GL')
    testResults.push(test1)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Test 2: Weather GL → Standard
    console.log('\n📋 Test 2: Weather GL → Standard')
    const test2 = await captureTestTransition('csm', 'standard', 'Weather GL to Standard')
    testResults.push(test2)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Test 3: Standard → Weather GL (Round Trip)
    console.log('\n📋 Test 3: Standard → Weather GL (Round Trip)')
    const test3 = await captureTestTransition('standard', 'csm', 'Standard to Weather GL (Round Trip)')
    testResults.push(test3)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Test 4: Weather GL → Standard (Round Trip)
    console.log('\n📋 Test 4: Weather GL → Standard (Round Trip)')
    const test4 = await captureTestTransition('csm', 'standard', 'Weather GL to Standard (Round Trip)')
    testResults.push(test4)
    
  } catch (error) {
    errors.push(`Test suite failed: ${error}`)
    console.error('❌ Test suite failed:', error)
  }
  
  // Generate summary
  const summary = generateSummary(testResults)
  
  const suiteResults: TestSuiteResults = {
    timestamp: new Date().toISOString(),
    totalTests: testResults.length,
    passedTests: testResults.filter(r => r.success).length,
    failedTests: testResults.filter(r => !r.success).length,
    results: testResults,
    summary
  }
  
  // Output results
  console.log('\n' + '='.repeat(80))
  console.log('📊 TEST SUITE RESULTS')
  console.log('='.repeat(80))
  console.log(JSON.stringify(suiteResults, null, 2))
  console.log('\n' + '='.repeat(80))
  console.log('✅ All tests complete!')
  console.log('='.repeat(80))
  
  // Save to window for easy access
  ;(window as any).shadowSystemTestResults = suiteResults
  
  // Download as JSON file
  downloadTestResults(suiteResults)
  
  return suiteResults
}

/**
 * Capture a single test transition
 */
async function captureTestTransition(
  fromSystem: string,
  toSystem: string,
  testName: string
): Promise<TestResult> {
  if (!viewerRef) {
    throw new Error('No viewer reference')
  }
  
  const result: TestResult = {
    timestamp: new Date().toISOString(),
    testName,
    fromSystem,
    toSystem,
    beforeState: {},
    afterState: {},
    lightStates: {
      before: [],
      after: [],
      restored: []
    },
    shadowPlaneState: {
      before: null,
      after: null
    },
    shadowCameraState: {
      before: [],
      after: []
    },
    materialState: {
      before: {},
      after: {}
    },
    systemState: {
      before: null,
      after: null
    },
    errors: [],
    warnings: [],
    success: false
  }
  
  try {
    // Capture BEFORE state
    const lightsBefore = Array.from(viewerRef.directionalLights.values())
    result.lightStates.before = lightsBefore.map(light => captureLightState(light))
    result.shadowPlaneState.before = captureShadowPlaneState(viewerRef.shadowPlane)
    result.systemState.before = captureSystemState()
    
    lightsBefore.forEach(light => {
      if (light.shadow && light.shadow.camera) {
        result.shadowCameraState.before.push(captureLightState(light))
      }
    })
    
    // Perform switch
    const shadowCoordinator = viewerRef.shadowCoordinator
    if (shadowCoordinator) {
      shadowCoordinator.switchSystem(toSystem as any, undefined, {
        preserveMaterials: true,
        preserveShadowPlane: true,
        preserveLightStates: true,
        restoreLightPositions: true
      })
    } else if (viewerRef.shadowManager) {
      viewerRef.shadowManager.setShadowSystem(toSystem as any)
    }
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Capture AFTER state
    const lightsAfter = Array.from(viewerRef.directionalLights.values())
    result.lightStates.after = lightsAfter.map(light => captureLightState(light))
    result.shadowPlaneState.after = captureShadowPlaneState(viewerRef.shadowPlane)
    result.systemState.after = captureSystemState()
    
    lightsAfter.forEach(light => {
      if (light.shadow && light.shadow.camera) {
        result.shadowCameraState.after.push(captureLightState(light))
      }
    })
    
    // Verify restoration
    lightsBefore.forEach((lightBefore, index) => {
      const lightAfter = lightsAfter.find(l => l.uuid === lightBefore.uuid)
      if (lightAfter) {
        const beforeState = result.lightStates.before[index]
        const afterState = captureLightState(lightAfter)
        
        // Check if position was restored
        const positionRestored = beforeState.userData._originalPosition && 
          Math.abs(afterState.position.x - beforeState.userData._originalPosition.x) < 0.001 &&
          Math.abs(afterState.position.y - beforeState.userData._originalPosition.y) < 0.001 &&
          Math.abs(afterState.position.z - beforeState.userData._originalPosition.z) < 0.001
        
        result.lightStates.restored.push(positionRestored)
        
        if (!positionRestored && beforeState.userData._originalPosition) {
          result.warnings.push(`Light ${lightAfter.name || 'unnamed'} position not restored correctly`)
        }
      } else {
        result.errors.push(`Light ${lightBefore.name || 'unnamed'} not found after switch`)
        result.lightStates.restored.push(false)
      }
    })
    
    result.success = result.errors.length === 0 && result.lightStates.restored.every(r => r)
    
  } catch (error) {
    result.errors.push(`Test failed: ${error}`)
    result.success = false
  }
  
  return result
}

/**
 * Generate summary statistics
 */
function generateSummary(results: TestResult[]): TestSuiteResults['summary'] {
  const summary = {
    lightPositionRestoration: { success: 0, failed: 0 },
    shadowCameraRestoration: { success: 0, failed: 0 },
    shadowPlaneRestoration: { success: 0, failed: 0 },
    materialStatePreservation: { success: 0, failed: 0 },
    systemStateConsistency: { success: 0, failed: 0 }
  }
  
  results.forEach(result => {
    // Light position restoration
    result.lightStates.restored.forEach(restored => {
      if (restored) {
        summary.lightPositionRestoration.success++
      } else {
        summary.lightPositionRestoration.failed++
      }
    })
    
    // Shadow plane restoration
    if (result.shadowPlaneState.before && result.shadowPlaneState.after) {
      const planeRestored = 
        result.shadowPlaneState.before.visible === result.shadowPlaneState.after.visible &&
        Math.abs(result.shadowPlaneState.before.position.y - result.shadowPlaneState.after.position.y) < 0.001
      
      if (planeRestored) {
        summary.shadowPlaneRestoration.success++
      } else {
        summary.shadowPlaneRestoration.failed++
      }
    }
    
    // System state consistency
    if (result.systemState.before && result.systemState.after) {
      const systemConsistent = result.systemState.after.currentSystem === result.toSystem
      if (systemConsistent) {
        summary.systemStateConsistency.success++
      } else {
        summary.systemStateConsistency.failed++
      }
    }
  })
  
  return summary
}

/**
 * Download test results as JSON file
 */
function downloadTestResults(results: TestSuiteResults): void {
  const dataStr = JSON.stringify(results, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `shadow-system-test-results-${new Date().toISOString().replace(/:/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  console.log('📥 Test results downloaded as JSON file')
}

/**
 * Initialize test runner
 */
export function initializeTestRunner(viewer: ViewerInstance): void {
  setViewerRef(viewer)
  
  const testRunner = {
    runAll: runComprehensiveTestWithCapture,
    getResults: () => (window as any).shadowSystemTestResults || null,
    exportResults: () => {
      const results = (window as any).shadowSystemTestResults
      if (results) {
        downloadTestResults(results)
      }
    }
  }
  
  ;(window as any).shadowSystemTestRunner = testRunner
  
  console.log('✅ Shadow System Test Runner initialized!')
  console.log('Available commands:')
  console.log('  window.shadowSystemTestRunner.runAll() - Run all tests and capture data')
  console.log('  window.shadowSystemTestRunner.getResults() - Get last test results')
  console.log('  window.shadowSystemTestRunner.exportResults() - Download results as JSON')
}





















