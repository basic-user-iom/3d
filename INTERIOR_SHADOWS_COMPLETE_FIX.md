# Complete Fix: Interior Objects Receiving Light When Should Be in Shadow

## Problem
Some objects inside the car that should be in shadow are still receiving light.

## Root Causes Identified (via Perplexity Research)

1. **Shadow Camera Bounds Too Small**: Only shadow-casting objects were included in bounds calculation, excluding interior parts
2. **Interior Objects Not Casting Shadows**: Some interior objects had `castShadow = false`, allowing light to pass through
3. **Shadow Map Resolution**: May be too low for interior details
4. **Shadow Camera Frustum**: May not encompass entire model including interior

## Fixes Applied

### 1. ✅ Shadow Camera Bounds - Include ALL Model Objects
**File**: `src/viewer/utils/shadowManager.ts` (lines 185-226)

**Problem**: Only objects with `castShadow = true` were included in shadow camera bounds calculation. This meant interior objects that should cast shadows weren't included, causing shadow camera frustum to miss them.

**Fix**: Modified `updateShadowCameraBounds` to include ALL imported model meshes in bounds calculation, not just those that currently cast shadows:

```typescript
// BEFORE: Only included objects with castShadow = true
if (obj instanceof THREE.Mesh && obj.castShadow) {
  objBox = new THREE.Box3().setFromObject(obj)
}

// AFTER: Include ALL imported model meshes (for interior shadow coverage)
if (obj instanceof THREE.Mesh) {
  if (obj.castShadow || obj.userData.isImportedModel || obj.userData.isModel) {
    objBox = new THREE.Box3().setFromObject(obj)
  }
}
```

**Result**: Shadow camera bounds now cover entire model including interior parts, ensuring all objects are within shadow camera frustum.

### 2. ✅ Enhanced Interior Shadow Diagnostics
**File**: `src/viewer/useViewer.ts` (lines 2163-2285)

**Added Comprehensive Diagnostics**:
- **Shadow Camera Bounds Coverage Check**: Verifies shadow camera bounds are at least 1.5x scene size
- **Shadow Map Resolution Check**: Warns if resolution < 1024x1024
- **Interior Objects Not Casting Shadows**: Detects and auto-fixes opaque interior objects missing `castShadow = true`
- **Detailed Shadow Camera Analysis**: Logs shadow camera vs scene size comparison

**Diagnostic Output**:
- `[ShadowDebug] Shadow Camera Analysis:` - Shows bounds coverage ratio
- `⚠️ Shadow camera bounds may be too small` - If bounds don't cover interior
- `⚠️ Shadow map resolution may be too low` - If resolution < 1024
- `⚠️ Found interior objects not casting shadows` - If any interior objects missing castShadow

### 3. ✅ Auto-Fix for Interior Objects Not Casting Shadows
**File**: `src/viewer/useViewer.ts` (lines 2252-2280)

**Problem**: Some interior objects had `castShadow = false`, allowing light to pass through them.

**Fix**: Added automatic detection and fix for opaque interior objects not casting shadows:

```typescript
// Check for interior objects that might not be casting shadows
scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh && obj.userData.isImportedModel) {
    const isTransparent = /* check transparency */
    if (!isTransparent && !obj.castShadow) {
      // AUTO-FIX: Enable shadow casting
      obj.castShadow = true
    }
  }
})
```

**Result**: All opaque interior objects now cast shadows, blocking light correctly.

## Best Practices Applied (from Perplexity Research)

1. **Shadow Map Size**: Should be 1024x1024 or higher for interior details ✅
2. **Shadow Camera Bounds**: Should be at least 1.5x scene size to cover interior ✅
3. **All Opaque Objects Cast Shadows**: Prevents light bleeding through ✅
4. **Shadow Camera Near Plane**: 0.001 for interior shadows ✅ (already implemented)

## Expected Results

After these fixes:
1. ✅ Shadow camera bounds cover entire model (including interior)
2. ✅ All interior objects cast shadows (auto-fixed)
3. ✅ Shadow map resolution is adequate (warned if too low)
4. ✅ Interior objects are properly shadowed (no light bleeding)

## Testing

After reloading a model, check console for:
- `[ShadowDebug] Shadow Camera Analysis:` - Verify bounds coverage
- `[ShadowDebug] ✅ No light bleeding issues detected` - All materials properly configured
- `[ShadowDebug] ⚠️ Found interior objects not casting shadows (auto-fixed)` - If any were fixed

## Files Modified

1. `src/viewer/utils/shadowManager.ts` - Shadow camera bounds calculation
2. `src/viewer/useViewer.ts` - Enhanced diagnostics and auto-fixes

## Related Fixes

- Shadow camera near plane: `0.001` (already implemented)
- Material depth writing: `depthWrite = true` for opaque (already implemented)
- Double-sided materials: Properly configured (already implemented)









