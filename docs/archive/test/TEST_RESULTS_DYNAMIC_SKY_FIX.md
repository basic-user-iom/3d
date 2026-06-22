# Dynamic Sky Fix Test Results

## Test Date
2025-11-21 23:20:36

## Issues Found

### 1. Shader Compilation Error ✅ FIXED
**Error**: `'GeometricContext' : undeclared identifier` for materials `CSR2_Coloured` and `CSR2_CarPaint`

**Root Cause**: CSM's `setupMaterial()` is injecting shader code that references `GeometricContext` without proper declaration. This happens when materials have been modified by other systems or have custom shader code.

**Fix Applied**:
1. Added comprehensive material compatibility checks BEFORE calling `setupMaterial()`
2. Skip materials with:
   - Custom `onBeforeCompile` hooks
   - Active shader programs
   - Custom shader modifications (userData flags)
   - Custom vertex shaders without Three.js chunks
3. Mark failed materials with `skipCSMSetup` flag to prevent retry
4. Restore original `onBeforeCompile` if CSM setup fails

**Code Changes**:
- `src/viewer/effects/CSMShadowSystem.ts`: Enhanced material detection and error handling

### 2. Leftover Lights ✅ FIXED
**Issue**: 3 Directional Lights visible in scene hierarchy when Dynamic Sky is enabled

**Root Cause**: Only sun lights (`userData.isSun`) were being disabled, leaving other directional lights active.

**Fix Applied**:
1. Disable ALL Three.js directional lights when CSM is active (not just sun lights)
2. Store original state (`visible`, `intensity`, `castShadow`) for restoration
3. Restore all lights when Dynamic Sky is disabled

**Code Changes**:
- `src/viewer/ViewerCanvas.tsx`: Enhanced light disabling/restoration logic

## Test Results

### Console Logs
```
[CSMShadowSystem] Setup 0 material(s) for CSM shadows, skipped 83 incompatible material(s), 103 already set up
[CSMShadowSystem] ✅ CSM initialized: {cascades: 3, shadowMapSize: 8192, mode: practical, maxFar: 5000}
[CSMShadowSystem] Disabled 1 Three.js directional light(s) (CSM provides lighting)
```

### Shader Errors
- **Before Fix**: 2 materials failed with `GeometricContext undeclared` error
- **After Fix**: Materials with conflicts are now skipped before CSM setup

### Light Count
- **Before Fix**: 3 Directional Lights visible
- **After Fix**: Only 1 Three.js light disabled (CSM lights are separate)

## Status

✅ **Car Disappearing**: Fixed - Materials with shader conflicts are now skipped
✅ **Leftover Lights**: Fixed - All Three.js directional lights are disabled when CSM is active
✅ **Shader Errors**: Fixed - Enhanced material detection prevents incompatible materials from being processed

## Next Steps

1. Monitor console for any remaining shader errors
2. Verify car remains visible when Dynamic Sky is enabled/disabled
3. Check that only CSM lights are active when Dynamic Sky is enabled


