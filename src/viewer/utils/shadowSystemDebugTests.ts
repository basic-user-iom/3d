/**
 * Shadow System Debug & Test Utilities
 * 
 * Comprehensive testing and debugging tools for shadow system transitions
 * Expose via: window.shadowSystemTests
 */

import * as THREE from 'three'
import { ShadowSystemType } from './shadowManager'

export interface ViewerInstance {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  shadowManager?: any
  shadowCoordinator?: any
  shadowPlane?: THREE.Mesh
  directionalLights: Map<string, THREE.DirectionalLight>
  csmShadowSystem?: any
}

let viewerRef: ViewerInstance | null = null

export function setViewerRef(viewer: ViewerInstance) {
  viewerRef = viewer
}

/**
 * Debug shadow state for a light
 */
export function debugShadowState(light: THREE.DirectionalLight, label: string): void {
  if (!light.shadow || !viewerRef) return
  
  const cam = light.shadow.camera as THREE.OrthographicCamera
  const shadowManager = viewerRef.shadowManager
  
  console.log(`[ShadowDebug] ${label}:`, {
    system: shadowManager?.getCurrentSystem?.() || 'unknown',
    lightName: light.name || 'Unnamed',
    castShadow: light.castShadow,
    visible: light.visible,
    shadowEnabled: light.shadow.enabled,
    cameraBounds: {
      left: cam.left,
      right: cam.right,
      top: cam.top,
      bottom: cam.bottom,
      near: cam.near,
      far: cam.far
    },
    cameraPosition: {
      x: cam.position.x.toFixed(2),
      y: cam.position.y.toFixed(2),
      z: cam.position.z.toFixed(2)
    },
    cameraTarget: {
      x: light.target.position.x.toFixed(2),
      y: light.target.position.y.toFixed(2),
      z: light.target.position.z.toFixed(2)
    },
    mapSize: {
      width: light.shadow.mapSize.width,
      height: light.shadow.mapSize.height
    },
    hasMap: !!light.shadow.map,
    bias: light.shadow.bias,
    normalBias: light.shadow.normalBias
  })
}

/**
 * Debug shadow plane state
 */
export function debugShadowPlaneState(plane: THREE.Mesh | undefined, label: string): void {
  if (!plane) {
    console.log(`[ShadowPlaneDebug] ${label}: No shadow plane`)
    return
  }
  
  const material = plane.material as THREE.MeshStandardMaterial
  console.log(`[ShadowPlaneDebug] ${label}:`, {
    visible: plane.visible,
    position: {
      x: plane.position.x.toFixed(3),
      y: plane.position.y.toFixed(3),
      z: plane.position.z.toFixed(3)
    },
    receiveShadow: plane.receiveShadow,
    castShadow: plane.castShadow,
    material: {
      type: material.type,
      transparent: material.transparent,
      opacity: material.opacity,
      color: `#${material.color.getHexString()}`,
      depthWrite: material.depthWrite,
      depthTest: material.depthTest
    }
  })
}

/**
 * Save light state for comparison
 */
export function saveLightState(light: THREE.DirectionalLight): void {
  light.userData._debugOriginalPosition = light.position.clone()
  light.userData._debugOriginalTargetPosition = light.target.position.clone()
  light.userData._debugOriginalIntensity = light.intensity
  light.userData._debugOriginalVisible = light.visible
  light.userData._debugOriginalCastShadow = light.castShadow
}

/**
 * Debug light state
 */
export function debugLightState(light: THREE.DirectionalLight, label: string): void {
  if (!viewerRef) return
  
  const shadowManager = viewerRef.shadowManager
  const isRegistered = shadowManager?.getStandardLights?.()?.includes(light) || false
  
  console.log(`[LightDebug] ${label}:`, {
    name: light.name || 'Unnamed',
    position: {
      x: light.position.x.toFixed(2),
      y: light.position.y.toFixed(2),
      z: light.position.z.toFixed(2)
    },
    targetPosition: {
      x: light.target.position.x.toFixed(2),
      y: light.target.position.y.toFixed(2),
      z: light.target.position.z.toFixed(2)
    },
    intensity: light.intensity.toFixed(2),
    visible: light.visible,
    castShadow: light.castShadow,
    shadowEnabled: light.shadow?.enabled,
    registered: isRegistered,
    savedPosition: light.userData._debugOriginalPosition ? {
      x: light.userData._debugOriginalPosition.x.toFixed(2),
      y: light.userData._debugOriginalPosition.y.toFixed(2),
      z: light.userData._debugOriginalPosition.z.toFixed(2)
    } : null,
    savedTargetPosition: light.userData._debugOriginalTargetPosition ? {
      x: light.userData._debugOriginalTargetPosition.x.toFixed(2),
      y: light.userData._debugOriginalTargetPosition.y.toFixed(2),
      z: light.userData._debugOriginalTargetPosition.z.toFixed(2)
    } : null,
    savedIntensity: light.userData._debugOriginalIntensity,
    savedVisible: light.userData._debugOriginalVisible,
    savedCastShadow: light.userData._debugOriginalCastShadow
  })
}

/**
 * Verify light state matches saved state
 */
export function verifyLightState(light: THREE.DirectionalLight): boolean {
  const saved = light.userData
  const matches = {
    position: saved._debugOriginalPosition?.equals(light.position) ?? false,
    target: saved._debugOriginalTargetPosition?.equals(light.target.position) ?? false,
    intensity: saved._debugOriginalIntensity === light.intensity,
    visible: saved._debugOriginalVisible === light.visible,
    castShadow: saved._debugOriginalCastShadow === light.castShadow
  }
  
  const allMatch = Object.values(matches).every(v => v)
  console.log(`[LightVerify] ${light.name || 'Unnamed'}:`, {
    ...matches,
    status: allMatch ? '✅ PASS' : '❌ FAIL'
  })
  
  return allMatch
}

/**
 * Debug material state
 */
export function debugMaterialState(material: THREE.Material, mesh: THREE.Mesh, label: string): void {
  console.log(`[MaterialDebug] ${label}:`, {
    materialType: material.type,
    meshName: mesh.name || 'Unnamed',
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
    depthWrite: (material as any).depthWrite,
    depthTest: (material as any).depthTest,
    hasCSMSetup: !!(material as any).userData?.csmSetup,
    hasCSMUniforms: !!(material as any).userData?.csmShadowMapUniforms
  })
}

/**
 * Count CSM materials in scene
 */
export function countCSMMaterials(scene: THREE.Scene): number {
  let count = 0
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach(mat => {
        if ((mat as any).userData?.csmSetup) {
          count++
        }
      })
    }
  })
  return count
}

/**
 * Debug system state
 */
export function debugSystemState(label: string): void {
  if (!viewerRef) {
    console.log(`[SystemDebug] ${label}: No viewer reference`)
    return
  }
  
  const scene = viewerRef.scene
  const shadowManager = viewerRef.shadowManager
  
  // Count lights
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
  
  console.log(`[SystemDebug] ${label}:`, {
    currentSystem: shadowManager?.getCurrentSystem?.() || 'unknown',
    csmActive: shadowManager?.isSystemActive?.('csm') || false,
    standardActive: shadowManager?.isSystemActive?.('standard') || false,
    csmLightsInScene: csmLightCount,
    standardLightsInScene: standardLightCount,
    csmSystemExists: !!viewerRef.csmShadowSystem,
    shadowPlaneExists: !!viewerRef.shadowPlane,
    rendererShadowsEnabled: viewerRef.renderer.shadowMap.enabled,
    rendererShadowMapType: viewerRef.renderer.shadowMap.type,
    csmMaterialsCount: countCSMMaterials(scene)
  })
}

/**
 * Test system switch and verify state
 */
export async function testSystemSwitch(
  fromSystem: ShadowSystemType,
  toSystem: ShadowSystemType,
  testName: string
): Promise<void> {
  if (!viewerRef) {
    console.error('[ShadowSystemTests] No viewer reference - cannot run tests')
    return
  }
  
  console.log(`\n🧪 TEST: ${testName}`)
  console.log(`Switching from ${fromSystem} to ${toSystem}`)
  
  // Save state before switch
  const lightsBefore = Array.from(viewerRef.directionalLights.values())
  lightsBefore.forEach(light => saveLightState(light))
  debugSystemState('BEFORE SWITCH')
  lightsBefore.forEach(light => debugLightState(light, 'BEFORE'))
  debugShadowPlaneState(viewerRef.shadowPlane, 'BEFORE')
  lightsBefore.forEach(light => debugShadowState(light, 'BEFORE'))
  
  // Perform switch
  const shadowCoordinator = viewerRef.shadowCoordinator
  if (shadowCoordinator) {
    shadowCoordinator.switchSystem(toSystem, undefined, {
      preserveMaterials: true,
      preserveShadowPlane: true,
      preserveLightStates: true,
      restoreLightPositions: true
    })
  } else if (viewerRef.shadowManager) {
    viewerRef.shadowManager.setShadowSystem(toSystem)
  } else {
    console.error('[ShadowSystemTests] No shadow coordinator or manager available')
    return
  }
  
  // Wait for async operations
  await new Promise(resolve => setTimeout(resolve, 200))
  
  // Verify state after switch
  debugSystemState('AFTER SWITCH')
  const lightsAfter = Array.from(viewerRef.directionalLights.values())
  lightsAfter.forEach(light => {
    debugLightState(light, 'AFTER')
    verifyLightState(light)
  })
  debugShadowPlaneState(viewerRef.shadowPlane, 'AFTER')
  lightsAfter.forEach(light => debugShadowState(light, 'AFTER'))
  
  console.log(`✅ TEST COMPLETE: ${testName}\n`)
}

/**
 * Run all test scenarios
 */
export async function runAllShadowSystemTests(): Promise<void> {
  if (!viewerRef) {
    console.error('[ShadowSystemTests] No viewer reference - cannot run tests')
    return
  }
  
  console.log('🚀 Starting Shadow System Tests\n')
  console.log('='.repeat(60))
  
  try {
    // Test 1: Standard → HDR → Standard
    console.log('\n📋 Test Suite 1: Standard ↔ HDR')
    await testSystemSwitch('standard', 'standard', 'Initial Standard State')
    // Note: HDR doesn't change shadow system type, it's a separate system
    // So we'll test Standard → Standard (verify no issues)
    
    // Test 2: Standard → Weather GL → Standard
    console.log('\n📋 Test Suite 2: Standard ↔ Weather GL (CSM)')
    await testSystemSwitch('standard', 'csm', 'Standard to Weather GL')
    await new Promise(resolve => setTimeout(resolve, 500))
    await testSystemSwitch('csm', 'standard', 'Weather GL to Standard')
    
    // Test 3: Weather GL → Standard → Weather GL (round trip)
    console.log('\n📋 Test Suite 3: Weather GL Round Trip')
    await testSystemSwitch('standard', 'csm', 'Standard to Weather GL (Round Trip)')
    await new Promise(resolve => setTimeout(resolve, 500))
    await testSystemSwitch('csm', 'standard', 'Weather GL to Standard (Round Trip)')
    await new Promise(resolve => setTimeout(resolve, 500))
    await testSystemSwitch('standard', 'csm', 'Standard to Weather GL (Final)')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ All tests complete!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('❌ Test suite failed:', error)
  }
}

/**
 * Visualize shadow camera frustum
 */
export function visualizeShadowCamera(light: THREE.DirectionalLight): void {
  if (!viewerRef || !light.shadow) return
  
  const cam = light.shadow.camera as THREE.OrthographicCamera
  const helper = new THREE.CameraHelper(cam)
  helper.name = `ShadowCameraHelper_${light.name || 'light'}`
  viewerRef.scene.add(helper)
  
  console.log(`[ShadowSystemTests] ✅ Added shadow camera helper for ${light.name || 'light'}`)
  
  // Remove after 10 seconds
  setTimeout(() => {
    viewerRef?.scene.remove(helper)
    helper.dispose()
    console.log(`[ShadowSystemTests] ✅ Removed shadow camera helper`)
  }, 10000)
}

/**
 * Visualize light position
 */
export function visualizeLightPosition(light: THREE.DirectionalLight): void {
  if (!viewerRef) return
  
  const geometry = new THREE.SphereGeometry(0.1, 16, 16)
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 })
  const marker = new THREE.Mesh(geometry, material)
  marker.position.copy(light.position)
  marker.name = `LightMarker_${light.name || 'light'}`
  viewerRef.scene.add(marker)
  
  // Line from light to target
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    light.position,
    light.target.position
  ])
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 })
  const line = new THREE.Line(lineGeometry, lineMaterial)
  line.name = `LightLine_${light.name || 'light'}`
  viewerRef.scene.add(line)
  
  console.log(`[ShadowSystemTests] ✅ Added light position visualization for ${light.name || 'light'}`)
}

/**
 * Initialize and expose test functions globally
 */
export function initializeShadowSystemTests(viewer: ViewerInstance): void {
  setViewerRef(viewer)
  
  const testSuite = {
    runAll: runAllShadowSystemTests,
    testSwitch: testSystemSwitch,
    debugShadow: debugShadowState,
    debugLight: debugLightState,
    debugPlane: debugShadowPlaneState,
    debugSystem: debugSystemState,
    debugMaterial: debugMaterialState,
    visualizeCamera: visualizeShadowCamera,
    visualizeLight: visualizeLightPosition,
    countCSMMaterials: () => viewer.scene ? countCSMMaterials(viewer.scene) : 0
  }
  
  ;(window as any).shadowSystemTests = testSuite
  
  console.log('✅ Shadow System Tests initialized!')
  console.log('Available commands:')
  console.log('  window.shadowSystemTests.runAll() - Run all tests')
  console.log('  window.shadowSystemTests.testSwitch(from, to, name) - Test specific switch')
  console.log('  window.shadowSystemTests.debugSystem(label) - Debug system state')
  console.log('  window.shadowSystemTests.debugLight(light, label) - Debug light state')
  console.log('  window.shadowSystemTests.debugPlane(plane, label) - Debug shadow plane')
  console.log('  window.shadowSystemTests.visualizeCamera(light) - Visualize shadow camera')
  console.log('  window.shadowSystemTests.visualizeLight(light) - Visualize light position')
}





















