# Duplicate Light Sources Fix - Complete

## Problem Summary
When Dynamic Sky was enabled, multiple light sources were active simultaneously, causing:
1. **Duplicate sun lights**: Both Three.js sun light AND CSM lights were active
2. **Unconnected light source**: Ambient light at full intensity (0.6) creating "leftover" lighting
3. **Objects disappearing**: CSM material setup was causing shader compilation errors

## Complete Fix Summary

### 1. CSM Material Setup Error Handling ✅
**File**: `src/viewer/effects/CSMShadowSystem.ts`

**Problem**: CSM's `setupMaterial()` was causing shader compilation errors on some materials, breaking rendering.

**Solution**:
- Skip `ShaderMaterial` instances (custom shaders conflict with CSM)
- Skip materials with custom `onBeforeCompile` hooks
- Wrap `setupMaterial()` calls in try-catch to prevent rendering failures
- Materials that fail will render without CSM shadows (fallback to standard shadows)

**Result**: Objects no longer disappear when Dynamic Sky is enabled.

### 2. Disable Three.js Sun Light When CSM Active ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7101)

**Problem**: When Dynamic Sky is enabled, CSM adds its own directional lights, but Three.js sun light was still active (only shadows disabled).

**Solution**:
- Set `light.visible = false` and `light.intensity = 0` when CSM is active
- Only CSM lights are active (no duplicate sun light)
- Position still updated for consistency

**Result**: No duplicate sun lights when Dynamic Sky is enabled.

### 3. Reduce Ambient Light When Dynamic Sky Enabled ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~6623)

**Problem**: Ambient light was always at full intensity (0.6), creating "leftover" lighting that wasn't connected to the sun.

**Solution**:
- Reduce ambient light to 30% when Dynamic Sky is enabled
- This ensures CSM shadows are visible and scene doesn't look flat
- Ambient light returns to normal when Dynamic Sky is disabled

**Result**: No "leftover" ambient light source.

### 4. Re-enable Sun Light When Dynamic Sky Disabled ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~7296)

**Problem**: When Dynamic Sky is disabled, sun light needs to be restored, BUT only if Streets GL is not active.

**Solution**:
- Check if Streets GL is active before re-enabling sun light
- If Streets GL is active, keep sun light disabled (Streets GL has its own sun)
- Restore intensity and visibility from store
- Re-enable shadows (CSM is no longer active)

**Result**: Proper light state management when toggling Dynamic Sky.

### 5. Streets GL Integration ✅
**File**: `src/viewer/ViewerCanvas.tsx` (line ~6786)

**Already Fixed**: When Streets GL is active, Three.js sun light is disabled (line ~6809-6810).

**Result**: No conflicts between Streets GL and Dynamic Sky systems.

## Test Scenarios

### Scenario 1: Dynamic Sky Only (No Streets GL)
- ✅ Three.js sun light: **DISABLED** (CSM provides lighting)
- ✅ CSM lights: **ACTIVE** (3 cascades)
- ✅ Ambient light: **30% intensity**
- ✅ Shadows: **CSM shadows** (high quality)

### Scenario 2: Streets GL Only (No Dynamic Sky)
- ✅ Three.js sun light: **DISABLED** (Streets GL provides lighting)
- ✅ CSM lights: **NOT ACTIVE**
- ✅ Ambient light: **Normal intensity**
- ✅ Shadows: **Streets GL shadows**

### Scenario 3: Both Streets GL AND Dynamic Sky
- ✅ Three.js sun light: **DISABLED** (both systems disable it)
- ✅ CSM lights: **ACTIVE** (for Three.js scene)
- ✅ Ambient light: **30% intensity**
- ✅ Shadows: **CSM shadows** (for Three.js scene) + **Streets GL shadows** (for Streets GL scene)

### Scenario 4: Neither Active
- ✅ Three.js sun light: **ACTIVE** (normal operation)
- ✅ CSM lights: **NOT ACTIVE**
- ✅ Ambient light: **Normal intensity**
- ✅ Shadows: **Standard Three.js shadows**

## Files Modified

1. **`src/viewer/effects/CSMShadowSystem.ts`**
   - Added error handling in `setupSceneMaterials()`
   - Skip incompatible materials
   - Prevent shader compilation errors

2. **`src/viewer/ViewerCanvas.tsx`**
   - Disable Three.js sun light when CSM is active (line ~7101)
   - Reduce ambient light when Dynamic Sky is enabled (line ~6623)
   - Re-enable sun light when Dynamic Sky is disabled, but only if Streets GL is not active (line ~7296)

3. **`src/viewer/useViewer.ts`**
   - Setup CSM materials for newly loaded models (both `loadFromFile` and `loadFromUrl`)

## Verification

All fixes are complete and tested:
- ✅ No duplicate light sources
- ✅ No "leftover" ambient light
- ✅ Objects don't disappear when Dynamic Sky is enabled
- ✅ Proper light state management when toggling features
- ✅ No conflicts between Streets GL and Dynamic Sky
- ✅ No linter errors

## Status: **COMPLETE** ✅


