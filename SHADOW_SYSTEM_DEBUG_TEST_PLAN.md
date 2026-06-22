# Shadow System Debug & Test Plan

## Overview
Comprehensive testing strategy to identify all inconsistencies when switching between:
- **Standard Shadows**
- **HDR System** (with standard shadows)
- **Weather GL (CSM)** (Cascaded Shadow Maps)

## Test Scenarios

### Scenario 1: Standard → HDR → Standard
1. Start with standard shadows enabled
2. Enable HDR
3. Disable HDR
4. Verify shadows restored correctly

### Scenario 2: Standard → Weather GL → Standard
1. Start with standard shadows enabled
2. Enable Weather GL (CSM)
3. Disable Weather GL
4. Verify shadows restored correctly

### Scenario 3: Weather GL → HDR → Weather GL
1. Start with Weather GL enabled
2. Enable HDR
3. Disable HDR
4. Verify CSM shadows restored correctly

### Scenario 4: HDR → Weather GL → HDR
1. Start with HDR enabled
2. Enable Weather GL
3. Disable Weather GL
4. Verify HDR shadows restored correctly

### Scenario 5: Rapid Switching
1. Rapidly toggle between all three systems
2. Verify no race conditions
3. Verify state is consistent

## Debug Checklist for Each Transition

### 1. Shadow State Verification

#### Before Switch
- [ ] Log current shadow system type
- [ ] Log shadow camera bounds for all lights
- [ ] Log shadow camera positions
- [ ] Log shadow camera near/far planes
- [ ] Log shadow map sizes
- [ ] Log renderer shadow map enabled state
- [ ] Log shadow map type (PCF, PCFSoft, etc.)

#### After Switch
- [ ] Verify correct shadow system is active
- [ ] Verify shadow camera bounds are correct
- [ ] Verify shadow camera positions are correct
- [ ] Verify shadow camera near/far planes are correct
- [ ] Verify shadow maps are regenerated
- [ ] Verify renderer shadow map is enabled
- [ ] Verify shadow map type is correct

#### Debug Code
```typescript
function debugShadowState(light: THREE.DirectionalLight, label: string) {
  if (!light.shadow) return
  
  const cam = light.shadow.camera as THREE.OrthographicCamera
  console.log(`[ShadowDebug] ${label}:`, {
    system: shadowManager.getCurrentSystem(),
    lightName: light.name,
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
    cameraPosition: cam.position,
    cameraTarget: light.target.position,
    mapSize: light.shadow.mapSize,
    hasMap: !!light.shadow.map,
    bias: light.shadow.bias,
    normalBias: light.shadow.normalBias
  })
}
```

### 2. Shadow Plane State Verification

#### Before Switch
- [ ] Log shadow plane visibility
- [ ] Log shadow plane position (should be y = -0.001)
- [ ] Log shadow plane material properties (transparent, opacity, color)
- [ ] Log shadow plane receiveShadow/castShadow
- [ ] Log shadow plane material depthWrite

#### After Switch
- [ ] Verify shadow plane is visible (if it was visible before)
- [ ] Verify shadow plane position is correct (y = -0.001)
- [ ] Verify shadow plane material properties are preserved
- [ ] Verify shadow plane can receive shadows
- [ ] Verify shadow plane material depthWrite is true

#### Debug Code
```typescript
function debugShadowPlaneState(plane: THREE.Mesh, label: string) {
  if (!plane) return
  
  const material = plane.material as THREE.MeshStandardMaterial
  console.log(`[ShadowPlaneDebug] ${label}:`, {
    visible: plane.visible,
    position: plane.position,
    receiveShadow: plane.receiveShadow,
    castShadow: plane.castShadow,
    material: {
      type: material.type,
      transparent: material.transparent,
      opacity: material.opacity,
      color: material.color,
      depthWrite: material.depthWrite,
      depthTest: material.depthTest
    }
  })
}
```

### 3. Light Position Verification

#### Before Switch
- [ ] Log all light positions
- [ ] Log all light target positions
- [ ] Log all light intensities
- [ ] Log all light visibility states
- [ ] Log all light castShadow states
- [ ] Save light states to userData for comparison

#### After Switch
- [ ] Verify light positions match saved positions
- [ ] Verify light target positions match saved positions
- [ ] Verify light intensities match saved intensities
- [ ] Verify light visibility states are correct
- [ ] Verify light castShadow states are correct
- [ ] Verify lights are registered with ShadowManager

#### Debug Code
```typescript
function debugLightState(light: THREE.DirectionalLight, label: string) {
  console.log(`[LightDebug] ${label}:`, {
    name: light.name,
    position: light.position.clone(),
    targetPosition: light.target.position.clone(),
    intensity: light.intensity,
    visible: light.visible,
    castShadow: light.castShadow,
    shadowEnabled: light.shadow?.enabled,
    registered: shadowManager.getStandardLights().includes(light),
    savedPosition: light.userData._originalPosition,
    savedTargetPosition: light.userData._originalTargetPosition,
    savedIntensity: light.userData._originalIntensity
  })
}

function saveLightState(light: THREE.DirectionalLight) {
  light.userData._debugOriginalPosition = light.position.clone()
  light.userData._debugOriginalTargetPosition = light.target.position.clone()
  light.userData._debugOriginalIntensity = light.intensity
  light.userData._debugOriginalVisible = light.visible
  light.userData._debugOriginalCastShadow = light.castShadow
}

function verifyLightState(light: THREE.DirectionalLight): boolean {
  const saved = light.userData
  const matches = {
    position: saved._debugOriginalPosition?.equals(light.position) ?? false,
    target: saved._debugOriginalTargetPosition?.equals(light.target.position) ?? false,
    intensity: saved._debugOriginalIntensity === light.intensity,
    visible: saved._debugOriginalVisible === light.visible,
    castShadow: saved._debugOriginalCastShadow === light.castShadow
  }
  
  console.log(`[LightVerify] ${light.name}:`, matches)
  return Object.values(matches).every(v => v)
}
```

### 4. Material State Verification

#### Before Switch
- [ ] Log material shadow properties (castShadow, receiveShadow)
- [ ] Log material depth properties (depthWrite, depthTest)
- [ ] Log CSM setup state (if applicable)
- [ ] Count materials with CSM shader patches

#### After Switch
- [ ] Verify material shadow properties are preserved
- [ ] Verify material depth properties are preserved
- [ ] Verify CSM shader patches are removed (when switching away from CSM)
- [ ] Verify materials are updated for new shadow system

#### Debug Code
```typescript
function debugMaterialState(material: THREE.Material, mesh: THREE.Mesh, label: string) {
  console.log(`[MaterialDebug] ${label}:`, {
    materialType: material.type,
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
    depthWrite: (material as any).depthWrite,
    depthTest: (material as any).depthTest,
    hasCSMSetup: !!(material as any).userData?.csmSetup,
    hasCSMUniforms: !!(material as any).userData?.csmShadowMapUniforms
  })
}

function countCSMMaterials(scene: THREE.Scene): number {
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
```

### 5. System State Verification

#### Before Switch
- [ ] Log current shadow system type
- [ ] Log CSM system state (if applicable)
- [ ] Log ShadowManager state
- [ ] Count CSM lights in scene
- [ ] Count standard lights in scene

#### After Switch
- [ ] Verify correct shadow system is active
- [ ] Verify previous system is fully disabled
- [ ] Verify no leftover CSM lights in scene
- [ ] Verify no race conditions
- [ ] Verify all resources are cleaned up

#### Debug Code
```typescript
function debugSystemState(label: string) {
  const scene = viewerRef.current.scene
  const shadowManager = viewerRef.current.shadowManager
  
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
    currentSystem: shadowManager?.getCurrentSystem(),
    csmActive: shadowManager?.isSystemActive('csm'),
    standardActive: shadowManager?.isSystemActive('standard'),
    csmLightsInScene: csmLightCount,
    standardLightsInScene: standardLightCount,
    csmSystemExists: !!viewerRef.current.csmShadowSystem,
    shadowPlaneExists: !!viewerRef.current.shadowPlane,
    rendererShadowsEnabled: viewerRef.current.renderer.shadowMap.enabled
  })
}
```

## Automated Test Structure

### Test Helper Functions

```typescript
// Test helper to switch systems and verify state
async function testSystemSwitch(
  fromSystem: ShadowSystemType,
  toSystem: ShadowSystemType,
  testName: string
) {
  console.log(`\n🧪 TEST: ${testName}`)
  console.log(`Switching from ${fromSystem} to ${toSystem}`)
  
  // Save state before switch
  const lightsBefore = Array.from(viewerRef.current.directionalLights.values())
  lightsBefore.forEach(light => saveLightState(light))
  debugSystemState('BEFORE SWITCH')
  lightsBefore.forEach(light => debugLightState(light, 'BEFORE'))
  debugShadowPlaneState(viewerRef.current.shadowPlane, 'BEFORE')
  
  // Perform switch
  const shadowCoordinator = viewerRef.current.shadowCoordinator
  shadowCoordinator.switchSystem(toSystem, undefined, {
    preserveMaterials: true,
    preserveShadowPlane: true,
    preserveLightStates: true,
    restoreLightPositions: true
  })
  
  // Wait for async operations
  await new Promise(resolve => setTimeout(resolve, 200))
  
  // Verify state after switch
  debugSystemState('AFTER SWITCH')
  const lightsAfter = Array.from(viewerRef.current.directionalLights.values())
  lightsAfter.forEach(light => {
    debugLightState(light, 'AFTER')
    verifyLightState(light)
  })
  debugShadowPlaneState(viewerRef.current.shadowPlane, 'AFTER')
  lightsAfter.forEach(light => debugShadowState(light, 'AFTER'))
  
  console.log(`✅ TEST COMPLETE: ${testName}\n`)
}

// Run all test scenarios
async function runAllShadowSystemTests() {
  console.log('🚀 Starting Shadow System Tests\n')
  
  // Test 1: Standard → HDR → Standard
  await testSystemSwitch('standard', 'hdr', 'Standard to HDR')
  await testSystemSwitch('hdr', 'standard', 'HDR to Standard')
  
  // Test 2: Standard → Weather GL → Standard
  await testSystemSwitch('standard', 'csm', 'Standard to Weather GL')
  await testSystemSwitch('csm', 'standard', 'Weather GL to Standard')
  
  // Test 3: Weather GL → HDR → Weather GL
  await testSystemSwitch('csm', 'hdr', 'Weather GL to HDR')
  await testSystemSwitch('hdr', 'csm', 'HDR to Weather GL')
  
  console.log('✅ All tests complete!')
}
```

## Visualization Tools

### Shadow Camera Frustum Visualization

```typescript
function visualizeShadowCamera(light: THREE.DirectionalLight, scene: THREE.Scene) {
  if (!light.shadow) return
  
  const cam = light.shadow.camera as THREE.OrthographicCamera
  const helper = new THREE.CameraHelper(cam)
  helper.name = `ShadowCameraHelper_${light.name}`
  scene.add(helper)
  
  // Remove after 5 seconds
  setTimeout(() => {
    scene.remove(helper)
    helper.dispose()
  }, 5000)
}
```

### Light Position Markers

```typescript
function visualizeLightPosition(light: THREE.DirectionalLight, scene: THREE.Scene) {
  const geometry = new THREE.SphereGeometry(0.1, 16, 16)
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 })
  const marker = new THREE.Mesh(geometry, material)
  marker.position.copy(light.position)
  marker.name = `LightMarker_${light.name}`
  scene.add(marker)
  
  // Line from light to target
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    light.position,
    light.target.position
  ])
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 })
  const line = new THREE.Line(lineGeometry, lineMaterial)
  line.name = `LightLine_${light.name}`
  scene.add(line)
}
```

## Usage

Add this to your browser console or create a test panel:

```typescript
// Expose test functions globally
(window as any).shadowSystemTests = {
  runAll: runAllShadowSystemTests,
  testSwitch: testSystemSwitch,
  debugShadow: debugShadowState,
  debugLight: debugLightState,
  debugPlane: debugShadowPlaneState,
  debugSystem: debugSystemState,
  visualizeCamera: visualizeShadowCamera,
  visualizeLight: visualizeLightPosition
}

// Run tests
// window.shadowSystemTests.runAll()
```

## Expected Results

After running tests, you should see:
- ✅ All light positions match saved positions
- ✅ Shadow plane state is preserved
- ✅ Shadow camera bounds are correct
- ✅ No leftover CSM lights in scene
- ✅ Materials are correctly configured for active system
- ✅ No race conditions or timing issues





















