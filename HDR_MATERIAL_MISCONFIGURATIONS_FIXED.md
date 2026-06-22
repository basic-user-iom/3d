# HDR Material Misconfigurations - Fixed

## Summary
Found and fixed critical misconfigurations in the HDR system that caused inconsistent material intensity calculations, particularly affecting metallic materials.

## Issues Found and Fixed

### 1. **updateIntensity() Method Not Using calculateMaterialIntensity** ✅ FIXED

**Location:** `src/viewer/effects/HDRSystem.ts` - `updateIntensity()` method (lines 1500-1595)

**Problem:**
- The `updateIntensity()` method was setting `envMapIntensity` directly without using `calculateMaterialIntensity()`
- This meant metallic materials (metalness > 0.3) lost their 1.5x boost when HDR intensity was updated via slider
- Inconsistent behavior: materials got 1.5x boost on initial HDR load, but lost it when intensity was changed

**Fix:**
- Updated both array and single material paths in `updateIntensity()` to use `calculateMaterialIntensity()`
- Now metallic materials maintain their 1.5x boost when intensity is updated
- Added proper change detection to only update when intensity actually changes

**Code Changes:**
```typescript
// Before:
mat.envMapIntensity = intensity

// After:
const finalIntensity = calculateMaterialIntensity(mat, intensity)
if (Math.abs(currentIntensity - finalIntensity) > 0.001) {
  mat.envMapIntensity = finalIntensity
}
```

### 2. **Material Loading Not Using calculateMaterialIntensity** ✅ FIXED

**Location:** `src/viewer/useViewer.ts` - Material loading code (lines 1309-1332, 1897-1920)

**Problem:**
- When materials were loaded from files/URLs, `envMapIntensity` was set directly to `hdrIntensity`
- Metallic materials didn't get the 1.5x boost when loaded
- This caused inconsistency: materials loaded before HDR got boost, materials loaded after HDR didn't

**Fix:**
- Added import for `calculateMaterialIntensity` from `materialIntensityHelper`
- Updated material loading code to use `calculateMaterialIntensity()` before setting `envMapIntensity`
- Applied fix to both occurrences in the file

**Code Changes:**
```typescript
// Before:
mat.envMapIntensity = hdrIntensity

// After:
const finalIntensity = calculateMaterialIntensity(mat, hdrIntensity)
mat.envMapIntensity = finalIntensity
```

## Verified Correct Behavior

### ✅ applyToMaterials() Method
- Already correctly uses `calculateMaterialIntensity()` (lines 1209, 1288)
- Metallic materials get 1.5x boost on initial HDR application

### ✅ disableHDR() Method
- Uses `applyToMaterials()` which correctly applies `calculateMaterialIntensity()`
- Default environment intensity is boosted by 2.0x to match HDR brightness
- Metallic materials still get 1.5x boost on the boosted default environment

### ✅ Material Panel
- User-controlled intensities are properly preserved
- System respects `userControlledEnvMapIntensity` flag

## Impact

### Before Fixes:
- **Inconsistent intensity**: Metallic materials had different intensities depending on when/how HDR was applied
- **Lost boost on update**: Changing HDR intensity slider removed metallic boost
- **Inconsistent loading**: Materials loaded after HDR didn't get metallic boost

### After Fixes:
- **Consistent intensity**: All metallic materials get 1.5x boost regardless of when/how HDR is applied
- **Maintained boost**: Changing HDR intensity slider preserves metallic boost
- **Consistent loading**: Materials loaded after HDR get proper metallic boost

## Testing Recommendations

1. **Test Metallic Materials:**
   - Load a model with metallic materials (metalness > 0.3)
   - Apply HDR - verify metallic materials are brighter (1.5x intensity)
   - Change HDR intensity slider - verify metallic materials maintain 1.5x boost
   - Load new model with metallic materials - verify they get 1.5x boost

2. **Test Non-Metallic Materials:**
   - Load a model with non-metallic materials (metalness <= 0.3)
   - Apply HDR - verify materials use base intensity
   - Change HDR intensity slider - verify materials update correctly
   - Load new model - verify materials get correct intensity

3. **Test HDR Toggle:**
   - Enable HDR - verify all materials get correct intensity
   - Disable HDR - verify default environment applies with 2.0x boost
   - Re-enable HDR - verify materials restore to correct intensity

## Files Modified

1. `src/viewer/effects/HDRSystem.ts`
   - Fixed `updateIntensity()` method to use `calculateMaterialIntensity()`
   - Added proper change detection to optimize updates

2. `src/viewer/useViewer.ts`
   - Added import for `calculateMaterialIntensity`
   - Fixed material loading code to use `calculateMaterialIntensity()`
   - Applied fix to both material loading paths

## Related Code

- `src/viewer/utils/materialIntensityHelper.ts` - Contains `calculateMaterialIntensity()` function
- `src/viewer/effects/HDRSystem.ts` - Main HDR system implementation
- `src/viewer/useViewer.ts` - Material loading and HDR application


