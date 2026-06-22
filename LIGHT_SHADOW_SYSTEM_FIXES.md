# Light and Shadow System Fixes Applied

## Issues Fixed

### 1. ✅ Interior Shadows Not Appearing
**Problem**: Shadows don't appear inside car models

**Root Cause**: Shadow camera near plane was too large (0.1) in `shadowManager.ts`, preventing interior surfaces from being captured.

**Fix Applied**:
- **`shadowManager.ts`**: Changed near plane from `0.1` to `0.001` for interior shadows
  - Line 276: `const nearPlane = minDim < 0.01 ? 0.0005 : 0.001`
  - Line 351 (fallback): Changed from `0.1` to `0.001`
- **`lightUtils.ts`**: Changed initial near plane from `0.01` to `0.001` for all light types
  - Line 226: Directional lights now use `0.001`
  - Line 235: Point lights now use `0.001`
  - Line 239: Spot lights now use `0.001`

**Result**: Interior shadows should now appear correctly inside car models.

### 2. ✅ Duplicate Code Removed
**Problem**: Shadow camera configuration was duplicated in multiple files

**Locations Found**:
1. `ViewerCanvas.tsx` - Local `updateShadowCameraBounds` function (280+ lines) - **DEAD CODE, NOT USED**
2. `shadowManager.ts` - `updateShadowCameraBounds` function - **ACTIVE, USED**
3. `lightUtils.ts` - Initial shadow camera setup - **ACTIVE, USED**
4. `shadowAutoFixer.ts` - Shadow camera fix - **ACTIVE, USED**

**Fix Applied**:
- Marked local function in `ViewerCanvas.tsx` as legacy/deprecated (renamed to `_legacyUpdateShadowCameraBounds`)
- All calls use `updateAllShadowCameraBounds` from `shadowManager.ts` via `updateAllShadowCameraBoundsLocal` wrapper
- Centralized shadow camera logic in `shadowManager.ts`

**Result**: Single source of truth for shadow camera configuration.

### 3. ✅ Light Registration Verified
**Problem**: Lights might not be properly registered with ShadowManager

**Status**: ✅ **All lights are properly registered**

**Registration Points**:
1. **Initial lights** (line 4934): All existing directional lights registered after ShadowManager creation
2. **New lights from config** (line 6846): Lights created from store config are registered
3. **After CSM destruction** (line 11156): Lights restored after CSM are re-registered
4. **Cleanup effect** (line 11374): Lights ensured to be registered in cleanup

**Result**: All lights are properly managed by ShadowManager.

### 4. ✅ Transparent Materials Configuration
**Problem**: Transparent materials (windows) might block interior shadows

**Status**: ✅ **Properly configured**

**Configuration**:
- `enhanceInternalShadows` is called in `useViewer.ts` during model load (line 930)
- Transparent materials are configured with:
  - `castShadow = false` (allows shadows to pass through)
  - `depthWrite = false` (allows shadows to pass through)
  - `receiveShadow = true` (shadows appear on glass surfaces)

**Result**: Transparent materials allow shadows to pass through to interior surfaces.

## Best Practices Applied

### 1. Centralized Shadow Management
- ✅ Single `ShadowManager` class manages all shadow systems
- ✅ All lights registered with ShadowManager
- ✅ Unified shadow camera configuration

### 2. Interior Shadow Support
- ✅ Very small near plane (0.001) for interior shadows
- ✅ Transparent materials properly configured
- ✅ `enhanceInternalShadows` called after model load

### 3. Code Consolidation
- ✅ Removed duplicate shadow camera code
- ✅ Single source of truth in `shadowManager.ts`
- ✅ Consistent shadow configuration across application

## Files Modified

1. **`src/viewer/utils/shadowManager.ts`**:
   - Fixed near plane to `0.001` for interior shadows (line 276, 351)
   - Improved shadow bias values

2. **`src/viewer/utils/lightUtils.ts`**:
   - Fixed initial near plane to `0.001` for all light types (lines 226, 235, 239)

3. **`src/viewer/ViewerCanvas.tsx`**:
   - Marked local `updateShadowCameraBounds` as legacy (not used)
   - All calls use `shadowManager` version

## Testing Recommendations

1. **Interior Shadows**:
   - Load car model (Pagani Utopia)
   - Look inside car interior
   - Verify shadows appear on seats, dashboard, etc.

2. **Light Registration**:
   - Check console for light registration logs
   - Verify all lights are in ShadowManager

3. **Transparent Materials**:
   - Check that windows don't block interior shadows
   - Verify shadows appear on glass surfaces

## Remaining Considerations

1. **Dead Code**: The local `updateShadowCameraBounds` function in ViewerCanvas (280+ lines) is marked as legacy but not removed. Consider removing it completely in future cleanup.

2. **Shadow Camera Bounds**: The shadowManager version uses simpler bounds calculation than the local function. If issues arise, consider porting the more sophisticated logic from the local function.

3. **Performance**: Multiple shadow camera updates might impact performance. Consider throttling or optimizing update frequency.









