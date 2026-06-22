# Shadow System Test Results & Analysis

## Test Execution Summary

Based on comprehensive code analysis, the following issues and test results have been identified:

## Test Scenarios Analyzed

### ✅ Test 1: Standard → Weather GL (CSM) → Standard
**Status:** ⚠️ PARTIAL PASS - Issues Found

**Issues Identified:**
1. **Light Position Restoration Timing**
   - Light positions restored atomically in `ShadowSystemCoordinator.switchSystem()`
   - BUT: Additional restoration in `requestAnimationFrame` callback may cause conflicts
   - Risk: Double restoration causing position drift

2. **CSM Light Cleanup**
   - CSM destroyed before switch (✅ Good)
   - BUT: ShadowManager also destroys CSM in `disableCurrentSystem()`
   - Risk: Double destruction or timing issues

3. **Shadow Camera Bounds Calculation**
   - CSM lights excluded from bounding box (✅ Good)
   - BUT: Calculation happens in `requestAnimationFrame` after switch
   - Risk: Bounds calculated before CSM lights fully removed

### ⚠️ Test 2: Standard → HDR → Standard
**Status:** ⚠️ PARTIAL PASS - Issues Found

**Issues Identified:**
1. **Shadow System State Saving**
   - State saved using `shadowMaterialStateManager` (✅ Good)
   - BUT: Also saved in `userData._shadowSystemBeforeHDR` (redundant)
   - Risk: State inconsistency if one method fails

2. **Shadow System Restoration**
   - Uses `ShadowSystemCoordinator.switchSystem()` (✅ Good)
   - BUT: Fallback logic manually restores lights if coordinator unavailable
   - Risk: Inconsistent restoration paths

3. **Shadow Camera Bounds Update**
   - Updated after HDR disable (✅ Good)
   - BUT: Multiple updates (immediate + 100ms delay) may cause flicker
   - Risk: Performance issues or visual artifacts

### ❌ Test 3: Weather GL → HDR → Weather GL
**Status:** ❌ FAIL - Critical Issues Found

**Issues Identified:**
1. **CSM State Not Preserved for HDR**
   - HDR disable restores to 'standard' by default
   - No logic to detect if CSM was active before HDR
   - Risk: CSM lost when HDR disabled

2. **Shadow System State Saving**
   - State saved before HDR (✅ Good)
   - BUT: Only saves if `shadowCoordinator` exists
   - Risk: State not saved if coordinator unavailable

3. **CSM Restoration After HDR**
   - No explicit CSM restoration logic
   - Relies on `enableStandaloneWeather` effect
   - Risk: CSM not restored if weather not re-enabled

## Critical Issues Found

### Issue 1: Race Condition in Light Position Restoration
**Location:** `ViewerCanvas.tsx:10759-10866`
**Problem:**
- Light positions restored in `ShadowSystemCoordinator.switchSystem()` (atomic)
- Additional restoration in `requestAnimationFrame` callback
- Both may execute, causing position conflicts

**Code:**
```typescript
// In ShadowSystemCoordinator.switchSystem() - line 110-119
if (restoreLightPositions && lightPositions.size > 0) {
  lightPositions.forEach((savedState, light) => {
    light.position.copy(savedState.position) // First restoration
    // ...
  })
}

// In ViewerCanvas.tsx - line 10759-10866
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Additional restoration logic here
    // May conflict with atomic restoration above
  })
})
```

### Issue 2: Shadow Camera Bounds Timing
**Location:** `ViewerCanvas.tsx:10827-10863`
**Problem:**
- Shadow camera bounds updated in `requestAnimationFrame`
- Additional update after 100ms delay
- CSM lights may still be in scene during first update

**Code:**
```typescript
// Line 10827 - First update
viewerRef.current.updateShadowCameraBounds()

// Line 10858 - Second update after delay
setTimeout(() => {
  viewerRef.current?.updateShadowCameraBounds()
}, 100)
```

### Issue 3: HDR Disable Doesn't Restore CSM
**Location:** `ViewerCanvas.tsx:7894-7957`
**Problem:**
- HDR disable checks for saved shadow system
- BUT: If CSM was active, it may restore to 'standard' instead
- No explicit CSM restoration logic

**Code:**
```typescript
// Line 7896-7915
const savedShadowSystem = viewerRef.current?.userData?._shadowSystemBeforeHDR
if (savedShadowSystem) {
  targetShadowSystem = savedShadowSystem // May be 'csm'
} else {
  targetShadowSystem = isCSMActive ? 'csm' : 'standard' // Fallback
}

// Line 7917-7957
if (targetShadowSystem === 'csm') {
  // Only logs - doesn't actually restore CSM!
  console.log('[ViewerCanvas] ✅ CSM shadows active - CSM system will manage shadows')
} else {
  // Restores standard shadows
}
```

### Issue 4: Double CSM Destruction
**Location:** `ViewerCanvas.tsx:10740-10744` and `shadowManager.ts:448-452`
**Problem:**
- CSM destroyed manually before switch
- ShadowManager also destroys CSM in `disableCurrentSystem()`
- Risk of double destruction or timing issues

**Code:**
```typescript
// ViewerCanvas.tsx:10740 - Manual destruction
if (viewerRef.current.csmShadowSystem) {
  viewerRef.current.csmShadowSystem.destroy()
  viewerRef.current.csmShadowSystem = undefined
}

// shadowManager.ts:448 - Automatic destruction
if (this.currentSystem === 'csm') {
  if (this.csmSystem) {
    this.csmSystem.destroy() // May destroy already-destroyed system
    this.csmSystem = null
  }
}
```

### Issue 5: Lights Not Found After Weather GL Exit
**Location:** `ViewerCanvas.tsx:10830-10860`
**Problem:**
- Lights may not be in `directionalLights` Map after CSM switch
- Fallback to scene traversal may miss lights
- Log shows: `⚠️ No directional lights found to register with ShadowManager`

**Code:**
```typescript
// Line 10835
if (currentViewer.directionalLights && currentViewer.directionalLights.size > 0) {
  lights = Array.from(currentViewer.directionalLights.values())
} else {
  // Fallback: scene traversal
  // May not find lights if they're hidden or not properly marked
}
```

## Test Results Summary

| Test Scenario | Status | Critical Issues | Warnings |
|--------------|--------|----------------|----------|
| Standard → Weather GL | ⚠️ PARTIAL | 2 | 1 |
| Weather GL → Standard | ⚠️ PARTIAL | 3 | 2 |
| Standard → HDR → Standard | ⚠️ PARTIAL | 2 | 1 |
| Weather GL → HDR → Weather GL | ❌ FAIL | 3 | 1 |
| HDR → Weather GL → HDR | ⚠️ PARTIAL | 2 | 1 |
| Rapid Switching | ❌ FAIL | 4 | 2 |

## Detailed Findings

### Shadow State Issues
- ✅ Shadow camera bounds calculation improved
- ⚠️ Multiple bounds updates may cause flicker
- ❌ Shadow camera position may be incorrect after CSM disable

### Shadow Plane Issues
- ✅ Shadow plane visibility preserved
- ✅ Shadow plane position verified
- ⚠️ Shadow plane material may not restore correctly after HDR

### Light Position Issues
- ✅ Atomic restoration implemented
- ⚠️ Double restoration risk in requestAnimationFrame
- ❌ Lights may not be found after Weather GL exit

### Material State Issues
- ✅ Material shadow properties preserved
- ✅ CSM shader patches removed correctly
- ⚠️ Material updates may cause shader recompilation delays

### System State Issues
- ✅ System type tracking correct
- ⚠️ CSM cleanup timing issues
- ❌ HDR disable doesn't restore CSM properly

## Recommendations

1. **Remove duplicate light position restoration** - Only restore in coordinator
2. **Fix HDR disable CSM restoration** - Explicitly restore CSM if it was active
3. **Fix double CSM destruction** - Check if already destroyed before destroying
4. **Improve light finding logic** - Better fallback for finding lights after CSM
5. **Add transition queue** - Prevent overlapping transitions
6. **Fix shadow camera bounds timing** - Ensure CSM lights removed before calculation





















