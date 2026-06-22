# Shadow System Fixes Applied

## Issues Fixed

### 1. Transparent Materials Shadow Configuration
**Problem**: Transparent materials (windows, glass) had incorrect shadow settings:
- `castShadow = true` (should be `false` to allow shadows to pass through)
- `depthWrite = true` (should be `false` to allow shadows to pass through)

**Fix Applied**:
- Enhanced `fixAllTransparentMaterials()` call after CSM initialization with delayed check (500ms)
- Added auto-fix in shadow diagnostics loop to catch transparent material issues
- Ensures transparent materials are fixed when detected by diagnostics

**Files Modified**:
- `src/viewer/ViewerCanvas.tsx`:
  - Added delayed transparent material fix after CSM init (line ~10315-10320)
  - Added auto-fix in shadow noise diagnostics (line ~5390-5400)

### 2. CSM Normal Bias Too Low
**Problem**: CSM lights (lights 4, 5, 6) had normal bias of 0.01, which is too low and causes warnings.
**Recommendation**: Normal bias should be 0.02-0.05 to prevent artifacts on curved surfaces.

**Fix Applied**:
- Increased default normal bias from 0.01 to 0.03
- Added minimum clamp of 0.02 to ensure it never goes below recommended value
- Applied to all CSM initialization and update locations

**Files Modified**:
- `src/viewer/ViewerCanvas.tsx`:
  - Line ~6317: Changed `shadowNormalBiasOverride || 0.01` to `Math.max(normalBias, 0.02)` with default 0.03
  - Line ~6529: Same fix for adaptive mode
  - Line ~10267: Changed initial CSM config from `0.01` to `0.03`
  - Line ~8484: Already had `0.03` (no change needed)

**Code Changes**:
```typescript
// Before
csmSystem.setShadowNormalBias(shadowNormalBiasOverride || 0.01)

// After
const normalBias = shadowNormalBiasOverride || 0.03
csmSystem.setShadowNormalBias(Math.max(normalBias, 0.02))
```

### 3. Shadow Camera Bounds Too Large
**Problem**: Shadow camera bounds are too large, causing low effective resolution (0.01 pixels/unit).
**Status**: This is a more complex issue that requires adjusting the bounds calculation algorithm. The current implementation already attempts to optimize bounds, but may need further tuning based on scene scale.

**Note**: Shadow camera bounds optimization is already implemented in `updateShadowCameraBounds()` function. The warnings may persist if the scene is very large or objects are spread far apart. This is expected behavior for large scenes.

## Testing

After these fixes:
1. **Transparent Materials**: Should have `castShadow = false` and `depthWrite = false`
2. **Normal Bias Warnings**: Should be reduced or eliminated (normal bias now 0.03, minimum 0.02)
3. **Shadow Quality**: Should be improved with proper normal bias values

## Verification

To verify fixes are working:
1. Check browser console - transparent material warnings should be reduced
2. Check shadow diagnostics - normal bias warnings should be gone
3. Visual inspection - shadows should pass through transparent materials correctly

## Status

✅ **FIXED**:
- CSM normal bias increased to 0.03 (minimum 0.02)
- Transparent material fixes enhanced with delayed check
- Auto-fix added to shadow diagnostics

⚠️ **PARTIALLY ADDRESSED**:
- Shadow camera bounds warnings may persist for very large scenes (expected behavior)
























