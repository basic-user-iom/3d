# Complete Shadow System Analysis for Perplexity

## Problem Statement

We have a Three.js application with three shadow/rendering modes that can be dynamically switched:
1. **Standard Shadows**: Traditional Three.js directional light shadows
2. **Weather GL (CSM)**: Cascaded Shadow Maps with dynamic sky
3. **HDR System**: High Dynamic Range environment (can be combined with Standard or CSM)

**Critical Issue**: Light positions are being modified/overridden by `fixLightPositionsAndShadowCameras()` after they've been restored, causing inconsistencies.

## Complete Code Flow and Settings

### Transition 1: Standard → Weather GL (CSM)

**File**: `src/viewer/ViewerCanvas.tsx:10353-10793`

**Step 1: Save Light Positions** (lines 10360-10388)
```typescript
// For each directional light
if (!light.userData._originalPositionSaved) {
  light.userData._originalPosition = light.position.clone()
  light.userData._originalTargetPosition = light.target.position.clone()
  light.userData._originalIntensity = light.intensity
  light.userData._originalCastShadow = light.castShadow
  light.userData._originalVisible = light.visible
  light.userData._originalPositionSaved = true
  light.userData._lightSaveId = `light_${light.name || 'unnamed'}_${Date.now()}`
}
```

**Settings Saved:**
- `light.position` (Vector3) → `userData._originalPosition`
- `light.target.position` (Vector3) → `userData._originalTargetPosition`
- `light.intensity` (number) → `userData._originalIntensity`
- `light.castShadow` (boolean) → `userData._originalCastShadow`
- `light.visible` (boolean) → `userData._originalVisible`
- Flag: `userData._originalPositionSaved = true`

**Step 2: Switch to CSM** (lines 10438-10444)
```typescript
shadowCoordinator.switchSystem('csm', csmConfig, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true
  // NOTE: restoreLightPositions NOT set (correct - going TO CSM)
})
```

**CSM Config:**
```typescript
{
  camera: camera,
  parent: scene,
  lightIntensity: 1.0,
  lightColor: new THREE.Color(0xffffff),
  cascades: 3,
  maxFar: 5000,
  shadowMapSize: 4096,
  lightDirection: lightDirection, // Negated sun direction
  shadowBias: -0.0002,
  shadowNormalBias: 0.03
}
```

**Step 3: CSM System Initialization** (lines 10456-10499)
- CSM system created via ShadowManager
- 3 CSM lights added to scene
- Materials set up for CSM shadows
- Transparent materials fixed (depthWrite=false, castShadow=false)
- Shadow plane set up for CSM

**Settings Changed:**
| Setting | Before | After |
|---------|--------|-------|
| Shadow System | `standard` | `csm` |
| CSM Lights in Scene | 0 | 3 |
| Standard Light castShadow | `true` | May be `false` |
| Shadow Plane Material | Standard | CSM-patched |
| Scene Materials | Standard | CSM-patched |
| Light Positions | Original | **UNCHANGED** (saved but not modified) |

### Transition 2: Weather GL → Standard

**File**: `src/viewer/ViewerCanvas.tsx:10796-11226`

**Step 1: Destroy CSM System** (lines 10801-10812)
```typescript
if (csmSystem.isEnabled && csmSystem.isEnabled()) {
  csmSystem.destroy() // Removes CSM lights from scene
}
viewerRef.current.csmShadowSystem = undefined
```

**Step 2: Switch to Standard** (lines 10817-10823)
```typescript
shadowCoordinator.switchSystem('standard', undefined, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true // ✅ ATOMIC RESTORATION
})
```

**Inside ShadowSystemCoordinator.switchSystem()** (`src/viewer/utils/ShadowSystemCoordinator.ts:83-120`):
```typescript
// Save positions from userData before switch
if (restoreLightPositions) {
  lights.forEach(light => {
    if (light.userData._originalPositionSaved && light.userData._originalPosition) {
      lightPositions.set(light, {
        position: light.userData._originalPosition.clone(),
        targetPosition: light.userData._originalTargetPosition?.clone(),
        intensity: light.userData._originalIntensity ?? light.intensity,
        castShadow: light.userData._originalCastShadow ?? light.castShadow,
        visible: light.userData._originalVisible ?? light.visible
      })
    }
  })
}

// Switch system
this.shadowManager.setShadowSystem(targetSystem, csmConfig)

// Restore positions ATOMICALLY
if (restoreLightPositions && lightPositions.size > 0) {
  lightPositions.forEach((savedState, light) => {
    light.position.copy(savedState.position) // ✅ RESTORED
    light.target.position.copy(savedState.targetPosition) // ✅ RESTORED
    light.target.updateMatrixWorld()
    light.intensity = savedState.intensity // ✅ RESTORED
    light.castShadow = savedState.castShadow // ✅ RESTORED
    light.visible = savedState.visible // ✅ RESTORED
  })
}
```

**Step 3: Configure Lights** (lines 10828-11016)
```typescript
// Find lights from multiple sources (Map prioritized)
let lights: THREE.DirectionalLight[] = []

// Source 1: directionalLights Map (PRIORITY)
if (viewerRef.current.directionalLights && viewerRef.current.directionalLights.size > 0) {
  lights = Array.from(viewerRef.current.directionalLights.values())
    .filter(light => !light.userData.isCSMLight && !light.userData.isStandaloneWeatherLight)
}

// Source 2: Scene traversal (if Map empty)
if (lights.length === 0) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && 
        !obj.userData.isCSMLight && 
        !obj.userData.isStandaloneWeatherLight) {
      lights.push(obj)
    }
  })
}

// Source 3: ShadowManager registry (if still empty)
if (lights.length === 0 && viewerRef.current.shadowManager?.getStandardLights) {
  lights = viewerRef.current.shadowManager.getStandardLights()
}

// Configure shadow properties (positions already restored)
lights.forEach(light => {
  viewerRef.current.shadowManager?.registerStandardLight(light)
  light.castShadow = true
  light.visible = true
  light.shadow.enabled = true
  light.shadow.needsUpdate = true
  if (light.shadow.map) {
    light.shadow.map.dispose()
    light.shadow.map = null
  }
})
```

**Step 4: Update Shadow Camera Bounds** (lines 11038-11079)
```typescript
// Wait 50ms for CSM destruction to complete
setTimeout(() => {
  if (viewerRef.current.updateShadowCameraBounds) {
    viewerRef.current.updateShadowCameraBounds()
  }
  
  // Update again after 100ms
  setTimeout(() => {
    if (viewerRef.current?.updateShadowCameraBounds) {
      viewerRef.current.updateShadowCameraBounds()
    }
  }, 100)
}, 50)
```

**Settings Changed:**
| Setting | Before | After |
|---------|--------|-------|
| Shadow System | `csm` | `standard` |
| CSM Lights in Scene | 3 | 0 |
| Standard Light Position | Modified by CSM | **RESTORED** from `userData._originalPosition` |
| Standard Light Target | Modified by CSM | **RESTORED** from `userData._originalTargetPosition` |
| Standard Light Intensity | Modified by CSM | **RESTORED** from `userData._originalIntensity` |
| Standard Light castShadow | `false` | **RESTORED** from `userData._originalCastShadow` |
| Standard Light visible | May be `false` | **RESTORED** from `userData._originalVisible` |
| Shadow Plane Visibility | CSM state | Restored from store |
| Shadow Plane Position | CSM state | `y = -0.001` (enforced) |
| Materials | CSM-patched | CSM patches removed |
| Shadow Camera Bounds | CSM bounds | Updated (2x) |
| Renderer shadowMap | Enabled | Enabled |

### Transition 3: Standard/HDR → HDR Enable

**File**: `src/viewer/ViewerCanvas.tsx:7779-7883`

**Step 1: Save Shadow System State** (lines 7784-7803)
```typescript
const shadowCoordinator = viewerRef.current?.shadowCoordinator
const shadowManager = viewerRef.current?.shadowManager
if (shadowCoordinator && shadowManager) {
  const currentShadowSystem = shadowManager.getCurrentSystem()
  const lights = Array.from(viewerRef.current.directionalLights.values())
  const shadowPlane = viewerRef.current.shadowPlane
  
  // Save using shadowMaterialStateManager
  shadowMaterialStateManager.saveSystemState(currentShadowSystem, lights, shadowPlane)
  shadowMaterialStateManager.saveSceneState(viewerRef.current.scene, lights, shadowPlane)
  
  // Also store in userData for backward compatibility
  viewerRef.current.userData._shadowSystemBeforeHDR = currentShadowSystem
}
```

**Step 2: Apply HDR** (line 7805)
```typescript
await hdrSystem.applyHDR(hdrSource, hdrIntensity)
```

**Inside HDRSystem.applyHDR()** (`src/viewer/effects/HDRSystem.ts:711-1047`):
- Loads HDR texture
- Applies to `scene.environment`
- Updates materials with environment map
- Protects shadow plane from HDR updates
- Re-enables shadow casting/receiving on meshes
- Forces shadow map update on all lights

**Step 3: Update Shadow Camera Bounds** (lines 7875-7881)
```typescript
requestAnimationFrame(() => {
  viewerRef.current?.updateShadowCameraBounds()
})
```

**Settings Changed:**
| Setting | Before | After |
|---------|--------|-------|
| Scene Environment | None/Previous | HDR texture |
| Shadow System | Current (saved) | **UNCHANGED** |
| Light Positions | Current | **UNCHANGED** |
| Light Targets | Current | **UNCHANGED** |
| Materials | Standard | HDR environment applied |
| Shadow Plane | Protected | Protected from HDR |
| Shadow Camera Bounds | Current | Updated (after material changes) |

### Transition 4: HDR → HDR Disable

**File**: `src/viewer/ViewerCanvas.tsx:7884-8040`

**Step 1: Disable HDR** (line 7886)
```typescript
hdrSystem.disableHDR()
```

**Step 2: Re-enable Renderer Shadows** (lines 7898-7904)
```typescript
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.needsUpdate = true
```

**Step 3: Restore Shadow System** (lines 7916-8004)
```typescript
const savedShadowSystem = viewerRef.current.userData._shadowSystemBeforeHDR
let targetShadowSystem: 'standard' | 'csm' | null = null

if (savedShadowSystem) {
  targetShadowSystem = savedShadowSystem
} else {
  // Fallback: Check current state
  const isCSMActive = shadowManager?.isSystemActive('csm') || !!viewerRef.current?.csmShadowSystem
  targetShadowSystem = isCSMActive ? 'csm' : 'standard'
}

if (shadowCoordinator2 && targetShadowSystem) {
  shadowCoordinator2.switchSystem(targetShadowSystem, undefined, {
    preserveMaterials: true,
    preserveShadowPlane: true,
    preserveLightStates: true
    // NOTE: restoreLightPositions NOT set (HDR doesn't change light positions)
  })
}
```

**Step 4: ⚠️ CONFLICT - fixLightPositionsAndShadowCameras** (lines 8006-8012)
```typescript
requestAnimationFrame(() => {
  fixLightPositionsAndShadowCameras() // ❌ MODIFIES LIGHT POSITIONS!
})
```

**What `fixLightPositionsAndShadowCameras` does** (`ViewerCanvas.tsx:7690-7771`):
```typescript
scene.traverse((obj) => {
  if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
    // ❌ CONFLICT: Modifies light position
    if (obj.position.y < 0) {
      obj.position.y = Math.max(obj.position.y, 10) // OVERRIDES restored position!
    }
    
    // ❌ CONFLICT: Modifies light target position
    if (obj.target.position.y > obj.position.y) {
      obj.target.position.y = obj.position.y - 10 // OVERRIDES restored target!
    }
    
    // Recalculates shadow camera position/orientation
    // ... (lines 7718-7761)
  }
})
```

**Step 5: Update Shadow Camera Bounds** (lines 8016-8037)
```typescript
requestAnimationFrame(() => {
  viewerRef.current?.updateShadowCameraBounds()
  
  // Force shadow map regeneration
  viewerRef.current.directionalLights.forEach((light) => {
    if (light && light.shadow) {
      light.shadow.needsUpdate = true
      if (light.shadow.map) {
        light.shadow.map.dispose()
        light.shadow.map = null
      }
    }
  })
})
```

**Settings Changed:**
| Setting | Before | After |
|---------|--------|-------|
| Scene Environment | HDR texture | Removed |
| Shadow System | Saved state | **RESTORED** from `userData._shadowSystemBeforeHDR` |
| Light Position | Original | **⚠️ MODIFIED** by `fixLightPositionsAndShadowCameras` |
| Light Target | Original | **⚠️ MODIFIED** by `fixLightPositionsAndShadowCameras` |
| Shadow Camera | Current | **MODIFIED** by `fixLightPositionsAndShadowCameras` |
| Shadow Camera Bounds | Current | Updated |
| Shadow Maps | Current | Regenerated |

## Critical Conflict Identified

### The Problem

**After Weather GL → Standard transition:**
1. Light positions are restored atomically via `ShadowSystemCoordinator` ✅
2. Positions are correct: `light.position` = `userData._originalPosition` ✅

**After HDR disable:**
1. Shadow system is restored correctly ✅
2. **BUT** `fixLightPositionsAndShadowCameras()` is called ❌
3. This function **MODIFIES** `light.position.y` and `light.target.position.y` ❌
4. **Result**: Restored positions are OVERRIDDEN! ❌

**Example:**
```typescript
// After Weather GL exit:
light.position = { x: 0, y: 5, z: 0 } // ✅ Restored correctly

// After HDR disable:
fixLightPositionsAndShadowCameras() // Called
if (light.position.y < 0) { // 5 is not < 0, so this doesn't trigger
  light.position.y = 10
}
// But if light was at y = -1, it would be changed to y = 10
// This OVERRIDES the restored position!
```

**When `fixLightPositionsAndShadowCameras` is called:**
1. After HDR disable (line 8010)
2. After ground projection disable (line 8166)

**The function's purpose:**
- Ensure lights are above horizon (`y >= 10` if `y < 0`)
- Ensure targets are below lights
- Fix shadow camera orientation

**The conflict:**
- This function doesn't check if positions were recently restored
- It modifies positions even if they're correct
- It can override restored positions from Weather GL exit

## All Code Locations Where Light Positions Are Modified

### Position Saving (3 locations)
1. **Before Weather GL** (`ViewerCanvas.tsx:10360-10388`)
   - Saves to `userData._originalPosition`
   - Saves to `userData._originalTargetPosition`

### Position Restoration (2 locations)
1. **ShadowSystemCoordinator** (`ShadowSystemCoordinator.ts:110-119`)
   - Atomic restoration when `restoreLightPositions: true`
   - Used in Weather GL → Standard transition

2. **Manual restoration** (NONE - removed to prevent conflicts)

### Position Modification (1 location - CONFLICT)
1. **fixLightPositionsAndShadowCameras** (`ViewerCanvas.tsx:7690-7771`)
   - Modifies `light.position.y` if `y < 0`
   - Modifies `light.target.position.y` if above light
   - Called after HDR disable (line 8010)
   - Called after ground projection disable (line 8166)

## Complete Settings Matrix

| Setting | Standard → Weather GL | Weather GL → Standard | Standard → HDR | HDR → Standard |
|---------|---------------------|----------------------|----------------|----------------|
| **Light Position** | SAVED (not modified) | **RESTORED** atomically | UNCHANGED | **⚠️ MODIFIED** by fixLightPositions |
| **Light Target** | SAVED (not modified) | **RESTORED** atomically | UNCHANGED | **⚠️ MODIFIED** by fixLightPositions |
| **Light Intensity** | SAVED | **RESTORED** atomically | UNCHANGED | UNCHANGED |
| **Light castShadow** | SAVED | **RESTORED** atomically | UNCHANGED | UNCHANGED |
| **Light visible** | SAVED | **RESTORED** atomically | UNCHANGED | UNCHANGED |
| **Shadow System** | `standard` → `csm` | `csm` → `standard` | UNCHANGED (saved) | **RESTORED** from saved |
| **CSM Lights** | Added (3) | Removed | UNCHANGED | UNCHANGED |
| **Shadow Plane** | Set up for CSM | Restored | Protected | Restored |
| **Materials** | CSM-patched | Patches removed | HDR applied | HDR removed |
| **Shadow Camera** | UNCHANGED | Updated (2x) | Updated | Updated + Fixed |
| **Renderer Shadows** | Enabled | Enabled | Enabled | Enabled |

## Questions for Perplexity

1. **How should we handle `fixLightPositionsAndShadowCameras` conflict?**
   - Should it check if positions were recently restored?
   - Should it only fix extreme cases (e.g., `y < -100`)?
   - Should it be called conditionally based on context?

2. **Is the current restoration flow correct?**
   - Atomic restoration in `ShadowSystemCoordinator` ✅
   - But then `fixLightPositionsAndShadowCameras` overrides it ❌
   - Should restoration happen AFTER `fixLightPositionsAndShadowCameras`?

3. **Should `fixLightPositionsAndShadowCameras` respect restored positions?**
   - Add check: `if (light.userData._originalPositionSaved && light.position matches saved) { skip }`
   - Or: Only fix if position is clearly wrong (extreme values)?

4. **Are there other conflicts we should be aware of?**
   - Multiple `updateShadowCameraBounds()` calls?
   - Duplicate light finding logic?
   - Race conditions with async operations?

5. **What's the recommended pattern for state preservation in Three.js?**
   - Current: `userData` for simple state, coordinator for orchestration
   - Is this correct?
   - Should we use a different pattern?

## Request for Guidance

Please provide:
1. **Solution for `fixLightPositionsAndShadowCameras` conflict**
2. **Review of restoration flow** (is it correct?)
3. **Best practices for state preservation** in Three.js
4. **Pattern recommendations** for handling multiple shadow systems
5. **Any other issues** you identify in the code flow

---

**Thank you for your comprehensive analysis!**





















