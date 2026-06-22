# Interior Shadows Fix - Final Implementation

## Problem
Interior shadows are not appearing inside car models despite previous fixes.

## Root Cause Analysis

Based on Perplexity research and code analysis:

1. **Shadow camera near plane was being overridden**: `updateShadowCameraBounds()` was called AFTER `enhanceInternalShadows()`, potentially recalculating the near plane
2. **Remaining 0.01 values**: Some locations still set near plane to `0.01` instead of `0.001`
3. **Near plane not preserved**: The shadowManager's `updateShadowCameraBounds` didn't preserve the optimized near plane set by `enhanceInternalShadows`

## Fixes Applied

### 1. Fixed Remaining 0.01 Values
**File**: `src/viewer/ViewerCanvas.tsx`
- Line 7166: Changed from `0.01` to `0.001` for directional lights
- Line 7175: Changed from `0.01` to `0.001` for point lights  
- Line 7179: Changed from `0.01` to `0.001` for spot lights

### 2. Preserve Near Plane in shadowManager
**File**: `src/viewer/utils/shadowManager.ts`
- Modified `updateShadowCameraBounds` to preserve near plane if it's already <= 0.001
- This prevents `enhanceInternalShadows` settings from being overridden

```typescript
// If enhanceInternalShadows already set it smaller, preserve that value
const currentNear = light.shadow.camera.near
const nearPlane = currentNear <= 0.001 ? currentNear : (minDim < 0.01 ? 0.0005 : 0.001)
light.shadow.camera.near = nearPlane
```

### 3. Re-apply Near Plane After Bounds Update
**File**: `src/viewer/useViewer.ts`
- Added code to re-apply 0.001 near plane after `updateShadowCameraBounds()` is called
- This ensures interior shadows work even if bounds update recalculates near plane
- Applied in both `loadFromFile` and `loadFromUrl` functions

```typescript
// CRITICAL: Re-apply interior shadow near plane after bounds update
scene.traverse((obj) => {
  if (obj instanceof THREE.DirectionalLight && obj.castShadow && obj.shadow) {
    // Ensure near plane is small enough for interior shadows
    if (obj.shadow.camera.near > 0.001) {
      obj.shadow.camera.near = 0.001
      obj.shadow.camera.updateProjectionMatrix()
    }
    obj.shadow.needsUpdate = true
  }
})
```

## Best Practices from Perplexity

1. **Near plane should be 0.1 or smaller** for interior shadows
2. **0.001 is optimal** for car interiors and close surfaces
3. **Shadow camera bounds should be tight** around the model for better resolution
4. **All meshes must have `receiveShadow = true`** for shadows to appear

## Testing

To verify interior shadows are working:

1. Load a car model (e.g., Pagani Utopia)
2. Look inside the car interior
3. Check console for:
   - `[ShadowEnhancement] Enhanced shadows on internal surfaces`
   - Shadow camera near plane should be `0.001` or smaller
4. Verify shadows appear on:
   - Seats
   - Dashboard
   - Interior surfaces
   - Surfaces inside vents/openings

## Files Modified

1. `src/viewer/ViewerCanvas.tsx` - Fixed remaining 0.01 values
2. `src/viewer/utils/shadowManager.ts` - Preserve near plane if already optimized
3. `src/viewer/useViewer.ts` - Re-apply near plane after bounds update

## Expected Result

Interior shadows should now appear correctly inside car models with:
- Near plane set to 0.001 or smaller
- All meshes configured to receive shadows
- Transparent materials allowing shadows to pass through
- Shadow camera properly positioned and configured









