# Complete Shadow System Analysis Summary

## Critical Conflict Found ✅

### The Problem

**`fixLightPositionsAndShadowCameras()` is overriding restored light positions!**

**Location**: `ViewerCanvas.tsx:7690-7771` and `ViewerCanvas.tsx:8006-8012`

**Flow:**
1. Weather GL → Standard: Light positions restored atomically ✅
2. HDR Disable: `fixLightPositionsAndShadowCameras()` called ❌
3. Function modifies `light.position.y` and `light.target.position.y` ❌
4. **Result**: Restored positions are OVERRIDDEN! ❌

## All Code Locations

### Light Position Saving
- **Before Weather GL**: `ViewerCanvas.tsx:10360-10388`
  - Saves to `userData._originalPosition`
  - Saves to `userData._originalTargetPosition`

### Light Position Restoration
- **ShadowSystemCoordinator**: `ShadowSystemCoordinator.ts:110-119`
  - Atomic restoration when `restoreLightPositions: true`
  - Used in Weather GL → Standard transition

### Light Position Modification (CONFLICT)
- **fixLightPositionsAndShadowCameras**: `ViewerCanvas.tsx:7690-7771`
  - Modifies `light.position.y` if `y < 0` → sets to `y = 10`
  - Modifies `light.target.position.y` if above light
  - Called after HDR disable (line 8010)
  - Called after ground projection disable (line 8166)

## Complete Settings Matrix

| Setting | Standard → Weather GL | Weather GL → Standard | Standard → HDR | HDR → Standard |
|---------|---------------------|----------------------|----------------|----------------|
| Light Position | SAVED | **RESTORED** | UNCHANGED | **⚠️ MODIFIED** |
| Light Target | SAVED | **RESTORED** | UNCHANGED | **⚠️ MODIFIED** |
| Shadow System | `standard` → `csm` | `csm` → `standard` | UNCHANGED | **RESTORED** |
| CSM Lights | Added (3) | Removed | UNCHANGED | UNCHANGED |
| Shadow Plane | CSM setup | Restored | Protected | Restored |
| Materials | CSM-patched | Patches removed | HDR applied | HDR removed |

## Recommended Fixes

### Fix 1: Make `fixLightPositionsAndShadowCameras` Respect Restored Positions

**Option A: Skip if position was recently restored**
```typescript
const fixLightPositionsAndShadowCameras = () => {
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
      // Check if position was recently restored
      if (obj.userData._originalPositionSaved && obj.userData._originalPosition) {
        const distance = obj.position.distanceTo(obj.userData._originalPosition)
        // If position matches saved position (within 0.1 units), don't modify
        if (distance < 0.1) {
          console.log('[ViewerCanvas] Skipping position fix - position was recently restored')
          return // Skip this light
        }
      }
      
      // Only fix if position is clearly wrong (extreme values)
      if (obj.position.y < -100) {
        obj.position.y = 10
      }
      // ... rest of function
    }
  })
}
```

**Option B: Only fix extreme cases**
```typescript
// Only fix if position is way off (not just slightly below horizon)
if (obj.position.y < -100) { // Only fix extreme cases
  obj.position.y = 10
}
```

**Option C: Don't call after position restoration**
```typescript
// After HDR disable
if (!justRestoredPositions) {
  fixLightPositionsAndShadowCameras()
}
```

### Fix 2: Consolidate Duplicate Code

**Extract light finding to shared function:**
```typescript
function findDirectionalLights(viewer: ViewerInstance): THREE.DirectionalLight[] {
  let lights: THREE.DirectionalLight[] = []
  
  // Source 1: Map (priority)
  if (viewer.directionalLights?.size > 0) {
    lights = Array.from(viewer.directionalLights.values())
      .filter(light => !light.userData.isCSMLight && !light.userData.isStandaloneWeatherLight)
  }
  
  // Source 2: Scene traversal
  if (lights.length === 0) {
    viewer.scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight && 
          !obj.userData.isCSMLight && 
          !obj.userData.isStandaloneWeatherLight) {
        lights.push(obj)
      }
    })
  }
  
  // Source 3: ShadowManager
  if (lights.length === 0 && viewer.shadowManager?.getStandardLights) {
    lights = viewer.shadowManager.getStandardLights()
  }
  
  return lights
}
```

### Fix 3: Remove Duplicate Shadow Camera Bounds Updates

**Consolidate to single update:**
```typescript
// After all operations complete
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (viewerRef.current?.updateShadowCameraBounds) {
      viewerRef.current.updateShadowCameraBounds()
    }
  })
})
```

## Files Created

1. **COMPLETE_CODE_ANALYSIS_AND_CONFLICTS.md** - Detailed code analysis
2. **PERPLEXITY_COMPLETE_SHADOW_SYSTEM_ANALYSIS.md** - Comprehensive Perplexity query
3. **COMPLETE_ANALYSIS_SUMMARY.md** - This summary

## Next Steps

1. ✅ **Fix `fixLightPositionsAndShadowCameras` conflict** (Option A recommended)
2. ✅ **Extract duplicate light finding logic**
3. ✅ **Consolidate shadow camera bounds updates**
4. ✅ **Test all transitions** (Standard ↔ Weather GL ↔ HDR)

---

**Status**: Analysis complete. Ready for fixes.
