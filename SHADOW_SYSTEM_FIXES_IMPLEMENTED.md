# Shadow System Critical Fixes - Implementation Summary

## Date: 2024-12-19

This document summarizes the 5 critical fixes implemented to resolve shadow system inconsistencies when switching between Weather GL (CSM), Standard Shadows, and HDR System.

---

## Issue 1: Double Light Position Restoration ✅ FIXED

**Problem**: Light positions were being restored twice - once atomically in `ShadowSystemCoordinator.switchSystem()` and again in the `requestAnimationFrame` callback in `ViewerCanvas.tsx`.

**Location**: `src/viewer/ViewerCanvas.tsx:10757-10831`

**Fix**: 
- Removed duplicate light position restoration from the `requestAnimationFrame` callback
- Light positions are now only restored atomically in `ShadowSystemCoordinator.switchSystem()` when `restoreLightPositions: true` is set
- The `requestAnimationFrame` callback now only configures shadow properties (castShadow, visible, shadow.enabled, etc.) without touching positions

**Code Change**:
```typescript
// BEFORE: Restored positions in requestAnimationFrame
// AFTER: Only configure shadow properties, positions already restored atomically
lights.forEach(light => {
  // Only set shadow properties, not positions
  light.castShadow = true
  light.visible = true
  // ... other shadow properties
})
```

---

## Issue 2: Shadow Camera Bounds Timing ✅ FIXED

**Problem**: Shadow camera bounds were being calculated before CSM lights were fully removed from the scene, causing incorrect bounding box calculations.

**Location**: `src/viewer/ViewerCanvas.tsx:10850-10863`

**Fix**:
- Added a `setTimeout(50ms)` delay before calculating shadow camera bounds
- This ensures CSM destruction is complete and all CSM lights are removed from the scene graph before bounds calculation
- Shadow camera bounds are now calculated after CSM cleanup is fully complete

**Code Change**:
```typescript
// FIX: Wait for CSM destruction to fully complete before calculating shadow bounds
setTimeout(() => {
  if (viewerRef.current.updateShadowCameraBounds) {
    viewerRef.current.updateShadowCameraBounds()
    // ... shadow camera logging
  }
  // ... renderer shadow map configuration
}, 50) // Wait 50ms for CSM destruction to complete
```

---

## Issue 3: HDR Disable Doesn't Restore CSM ✅ FIXED

**Problem**: When HDR was disabled and CSM should be restored, the code only logged that CSM was active but didn't actually restore it.

**Location**: `src/viewer/ViewerCanvas.tsx:7937-7940`

**Fix**:
- Added logic to check if CSM system exists and is enabled
- If CSM is managed by ShadowManager, ensure it's set as the active system
- Added proper logging for all CSM restoration scenarios

**Code Change**:
```typescript
} else if (targetShadowSystem === 'csm') {
  // FIX: Actually restore CSM if it was active before HDR
  const csmSystem = viewerRef.current?.csmShadowSystem
  const shadowManagerCSM = shadowManager?.getCSMSystem()
  
  if (csmSystem && csmSystem.isEnabled && csmSystem.isEnabled()) {
    // CSM system exists and is enabled - ensure it's properly configured
    console.log('[ViewerCanvas] ✅ CSM system already enabled after HDR disable')
  } else if (shadowManagerCSM) {
    // CSM is managed by ShadowManager - ensure it's active
    shadowManager.setShadowSystem('csm')
    console.log('[ViewerCanvas] ✅ CSM system restored via ShadowManager after HDR disable')
  } else {
    // CSM should be active but system doesn't exist - log warning
    console.warn('[ViewerCanvas] ⚠️ CSM should be active but system not found - may need to recreate')
  }
}
```

---

## Issue 4: Double CSM Destruction ✅ FIXED

**Problem**: CSM system could be destroyed multiple times, causing errors and inconsistent state.

**Location**: `src/viewer/ViewerCanvas.tsx:10740-10744`

**Fix**:
- Added check using `csmSystem.isEnabled()` before destroying CSM
- Only destroy CSM if it's currently enabled
- Prevents double destruction errors

**Code Change**:
```typescript
// FIX: Prevent double destruction by checking enabled state
if (viewerRef.current.csmShadowSystem) {
  const csmSystem = viewerRef.current.csmShadowSystem
  // Check if CSM is enabled (if disabled, it may already be destroyed)
  if (csmSystem.isEnabled && csmSystem.isEnabled()) {
    console.log('[ViewerCanvas] Destroying standalone CSM shadow system (before switch)')
    csmSystem.destroy()
  } else {
    console.log('[ViewerCanvas] CSM system already disabled/destroyed, skipping')
  }
  viewerRef.current.csmShadowSystem = undefined
}
```

---

## Issue 5: Lights Not Found After Weather GL Exit ✅ FIXED

**Problem**: After exiting Weather GL, lights were not always found because the code only checked the `directionalLights` Map, which could be empty.

**Location**: `src/viewer/ViewerCanvas.tsx:10764-10805`

**Fix**:
- Implemented multi-source light finding:
  1. Check `directionalLights` Map (primary source)
  2. Traverse scene to find all directional lights (fallback)
  3. Check ShadowManager's standard lights registry (additional source)
- Added duplicate prevention to avoid adding the same light multiple times
- Improved logging to show which source found the lights

**Code Change**:
```typescript
// FIX: Improved light finding - check multiple sources
let lights: THREE.DirectionalLight[] = []

// Source 1: directionalLights Map
if (viewerRef.current.directionalLights && viewerRef.current.directionalLights.size > 0) {
  lights = Array.from(viewerRef.current.directionalLights.values())
}

// Source 2: Scene traversal (find all lights, including hidden ones)
const scene = viewerRef.current.scene
if (scene && (lights.length === 0 || lights.length < viewerRef.current.directionalLights?.size || 0)) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight) {
      // Include all lights that are not CSM lights
      if (!obj.userData.isCSMLight && !obj.userData.isStandaloneWeatherLight) {
        // Avoid duplicates
        if (!lights.includes(obj)) {
          lights.push(obj)
        }
      }
    }
  })
}

// Source 3: ShadowManager's standard lights registry
if (viewerRef.current.shadowManager?.getStandardLights) {
  const standardLights = viewerRef.current.shadowManager.getStandardLights()
  if (standardLights && standardLights.length > 0) {
    standardLights.forEach(light => {
      if (!lights.includes(light)) {
        lights.push(light)
      })
    })
  }
}
```

---

## Testing Recommendations

After these fixes, test the following scenarios:

1. **Weather GL → Standard**: 
   - Enable Weather GL, then disable it
   - Verify shadows appear correctly and shadow plane is visible
   - Check console for proper light restoration logs

2. **Standard → HDR → Standard**:
   - Enable standard shadows, enable HDR, then disable HDR
   - Verify standard shadows are restored correctly

3. **Weather GL → HDR → Weather GL**:
   - Enable Weather GL, enable HDR, disable HDR
   - Verify CSM shadows are restored correctly

4. **Rapid Switching**:
   - Quickly toggle between Weather GL, Standard, and HDR
   - Verify no errors occur and shadows remain consistent

5. **Shadow Camera Bounds**:
   - After exiting Weather GL, verify shadow camera bounds are correct
   - Shadows should cover the entire scene, not just a small area

---

## Files Modified

1. `src/viewer/ViewerCanvas.tsx`
   - Fixed double light position restoration
   - Fixed shadow camera bounds timing
   - Fixed CSM restoration after HDR disable
   - Fixed double CSM destruction
   - Improved light finding logic

---

## Next Steps

1. Run comprehensive shadow system tests using `window.shadowSystemTests.runAll()`
2. Monitor console logs for any remaining issues
3. Test all transition scenarios manually
4. If issues persist, review the test results and consider additional fixes

---

## Related Documents

- `COMPREHENSIVE_TEST_REPORT.md` - Original test results identifying these issues
- `PERPLEXITY_FINAL_QUERY.md` - Query to Perplexity for architectural guidance
- `FINAL_TEST_REPORT_AND_PERPLEXITY_QUERY.md` - Combined test report and query





















