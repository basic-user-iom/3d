# Shadow System Fixes Applied

## High-Priority Fixes Implemented

### ✅ Fix 1: Light Visibility (CRITICAL)
**File**: `src/viewer/utils/shadowManager.ts`
**Issue**: Lights were being hidden (`light.visible = false`) when disabling shadows
**Fix**: Removed `light.visible = false` - lights now remain visible, only `castShadow` is disabled
**Impact**: Lights will continue to provide illumination even when shadows are disabled (industry best practice)

```typescript
// BEFORE
this.standardLights.forEach(light => {
  light.castShadow = false
  light.visible = false // ❌ Hides lights completely
})

// AFTER
this.standardLights.forEach(light => {
  light.castShadow = false
  // ✅ Lights remain visible - only shadow casting is disabled
})
```

### ✅ Fix 2: Atomic Light Position Restoration
**File**: `src/viewer/utils/ShadowSystemCoordinator.ts`
**Issue**: Light positions were restored after system switch, causing timing issues
**Fix**: Added `restoreLightPositions` option to `switchSystem()` method
**Impact**: Light positions are now restored atomically with system switch, preventing timing issues

**Changes**:
- Added `restoreLightPositions` option to `switchSystem()` parameters
- Light positions are saved before system switch
- Light positions are restored atomically within the switch operation
- Used in Weather GL → Standard transition

### ✅ Fix 3: Shadow System State Saving Before HDR
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7767)
**Issue**: HDR disable couldn't reliably detect which shadow system to restore
**Fix**: Save shadow system state using `shadowMaterialStateManager` before HDR is applied
**Impact**: Shadow system can be reliably restored after HDR disable with full state preservation

**Implementation**:
```typescript
// Save shadow system state before HDR using shadowMaterialStateManager
const shadowCoordinator = viewerRef.current?.shadowCoordinator
const shadowManager = viewerRef.current?.shadowManager
if (shadowCoordinator && shadowManager) {
  const currentShadowSystem = shadowManager.getCurrentSystem()
  const lights = Array.from(viewerRef.current.directionalLights.values())
  const shadowPlane = viewerRef.current.shadowPlane
  
  // Use shadowMaterialStateManager for proper state preservation
  shadowMaterialStateManager.saveSystemState(currentShadowSystem, lights, shadowPlane)
  shadowMaterialStateManager.saveSceneState(scene, lights, shadowPlane)
  
  // Also store in userData for backward compatibility
  viewerRef.current.userData._shadowSystemBeforeHDR = currentShadowSystem
}
```

### ✅ Fix 4: Improved HDR Disable Logic
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7894)
**Issue**: HDR disable checked current state but may miss edge cases, and didn't use ShadowSystemCoordinator
**Fix**: 
1. Use `shadowMaterialStateManager.saveSystemState` before HDR (instead of just storing in userData)
2. Use `ShadowSystemCoordinator.switchSystem` to restore after HDR disable (instead of manually restoring lights)
**Impact**: More reliable shadow system restoration after HDR disable, consistent with rest of codebase

**Implementation**:
```typescript
// Before HDR: Save state using shadowMaterialStateManager
shadowMaterialStateManager.saveSystemState(currentShadowSystem, lights, shadowPlane)
shadowMaterialStateManager.saveSceneState(scene, lights, shadowPlane)

// After HDR disable: Restore using ShadowSystemCoordinator
if (shadowCoordinator && targetShadowSystem) {
  shadowCoordinator.switchSystem(targetShadowSystem, undefined, {
    preserveMaterials: true,
    preserveShadowPlane: true,
    preserveLightStates: true
  })
}
```

### ✅ Fix 5: Weather GL → Standard Transition
**File**: `src/viewer/ViewerCanvas.tsx` (line ~10651)
**Issue**: Light positions restored after system switch
**Fix**: Added `restoreLightPositions: true` to `switchSystem()` call
**Impact**: Light positions restored atomically with system switch

## Files Modified

1. `src/viewer/utils/shadowManager.ts`
   - Fixed light visibility issue
   - Removed `light.visible = false` when disabling shadows

2. `src/viewer/utils/ShadowSystemCoordinator.ts`
   - Added `restoreLightPositions` option
   - Implemented atomic light position restoration
   - Enhanced `switchSystem()` method

3. `src/viewer/ViewerCanvas.tsx`
   - Added shadow system state saving before HDR using `shadowMaterialStateManager`
   - Improved HDR disable logic to use `ShadowSystemCoordinator.switchSystem` for restoration
   - Added `restoreLightPositions: true` to Weather GL → Standard transition
   - Imported `shadowMaterialStateManager` for proper state management

## Testing Recommendations

### Test Scenarios
1. **Standard → Weather GL → Standard**
   - Verify lights remain visible
   - Verify light positions are restored correctly
   - Verify shadows work correctly

2. **Standard → HDR → Standard**
   - Verify shadow system is restored correctly
   - Verify shadows work after HDR disable

3. **Weather GL → HDR → Weather GL**
   - Verify CSM is restored correctly
   - Verify shadows work after HDR disable

4. **Quick Switching**
   - Switch between all three modes rapidly
   - Verify no race conditions
   - Verify state is consistent

## Remaining Medium-Priority Fixes

1. **Transition Queue** - Implement queue to prevent overlapping transitions
2. **State Machine Pattern** - Refactor to proper state machine
3. **Material State Preservation** - Ensure all material properties are saved
4. **Shadow Plane State** - Include in state machine

## Status

✅ **High-priority fixes completed**
⏳ **Medium-priority fixes pending**
⏳ **Testing required**


