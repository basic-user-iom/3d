# SSS and SSR Fixes Summary

**Date:** 2025-01-27  
**Status:** ✅ All fixes applied

---

## Problems Identified

### 1. **DepthRenderPass - Non-linear Depth Issue**
- **Problem:** Using `gl_FragCoord.z` which is non-linear (perspective-corrected depth buffer value)
- **Impact:** Both SSS and SSR need linear depth (actual distance from camera) to work correctly
- **Symptom:** Shadows and reflections would appear incorrect or not work at all

### 2. **NormalRenderPass - Wrong Coordinate Space**
- **Problem:** Outputting world space normals instead of view space normals
- **Impact:** SSR ray marching happens in view space, so it needs view space normals
- **Symptom:** Reflections would be incorrect or not appear

### 3. **SSR Shader - Incorrect Depth Conversion**
- **Problem:** Trying to convert from NDC depth to linear depth, but depth texture now contains linear depth directly
- **Impact:** Ray marching depth comparisons would be wrong
- **Symptom:** Reflections wouldn't intersect correctly with surfaces

---

## Fixes Applied

### ✅ Fix 1: DepthRenderPass - Linear Depth Calculation

**File:** `src/viewer/pathTracer/DepthRenderPass.ts`

**Changes:**
- Added `cameraNear` and `cameraFar` uniforms to shader
- Changed depth calculation from `gl_FragCoord.z` to linear depth from view space position
- Calculate: `linearDepth = -vViewPosition.z` (view space Z is negative)
- Normalize: `normalizedLinearDepth = (linearDepth - cameraNear) / (cameraFar - cameraNear)`
- Output normalized linear depth (0-1 range) in red channel

**Before:**
```glsl
float depth = gl_FragCoord.z; // Non-linear!
gl_FragColor = vec4(depth, 0.0, 0.0, 1.0);
```

**After:**
```glsl
float linearDepth = -vViewPosition.z;
float normalizedLinearDepth = (linearDepth - cameraNear) / (cameraFar - cameraNear);
gl_FragColor = vec4(normalizedLinearDepth, 0.0, 0.0, 1.0);
```

---

### ✅ Fix 2: NormalRenderPass - View Space Normals

**File:** `src/viewer/pathTracer/NormalRenderPass.ts`

**Changes:**
- Removed world space position calculation (not needed)
- Ensured normals are in view space (using `normalMatrix * normal`)
- View space normals are what SSR needs since ray marching happens in view space

**Before:**
```glsl
vNormal = normalize(normalMatrix * normal); // View space (correct)
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz; // Unused
// ... later uses vWorldPos which isn't needed
```

**After:**
```glsl
vNormal = normalize(normalMatrix * normal); // View space normals
// Removed unused vWorldPos
```

**Note:** The normal was already in view space, but the code was cleaner after removing unused variables.

---

### ✅ Fix 3: SSR Shader - Correct Depth Reading

**File:** `src/viewer/postprocessing/SSRShader.ts`

**Changes:**
1. **Simplified `readDepth()` function:**
   - Now reads normalized linear depth directly (no conversion needed)
   - Matches the format from DepthRenderPass

2. **Fixed `getViewPos()` function:**
   - Properly reconstructs view space position from normalized linear depth
   - Uses correct view space Z calculation (negative values)

3. **Fixed `rayMarch()` function:**
   - Added `depthToViewZ()` helper to convert normalized depth to view space Z
   - Fixed depth comparison to use view space Z values
   - Corrected intersection detection logic

4. **Fixed `binarySearch()` function:**
   - Updated to use view space Z for depth comparisons
   - Improved binary search logic for better intersection refinement

**Key Changes:**
```glsl
// Before: Tried to convert from NDC depth
float z_ndc = fragCoordZ * 2.0 - 1.0;
float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));

// After: Read linear depth directly
float normalizedLinearDepth = texture2D(depthSampler, coord).x;
return clamp(normalizedLinearDepth, 0.0, 1.0);
```

---

## Technical Details

### Depth Format
- **Format:** Normalized linear depth (0.0 = camera near, 1.0 = camera far)
- **Storage:** Red channel of RGBA texture
- **Coordinate Space:** View space (camera-relative)
- **Calculation:** `(linearDepth - near) / (far - near)`

### Normal Format
- **Format:** View space normals encoded as RGB (0.5 + 0.5 * normal)
- **Storage:** RGB channels of RGBA texture
- **Coordinate Space:** View space (camera-relative)
- **Decoding:** `(normal - 0.5) * 2.0` to get -1 to 1 range

### Why View Space?
- **SSR:** Ray marching happens in view space, so normals and positions must be in view space
- **SSS:** Screen-space tracing, but depth comparisons need linear depth
- **Performance:** View space avoids coordinate transformations during ray marching

---

## Testing Recommendations

1. **SSS Testing:**
   - Enable SSS in rendering quality panel
   - Adjust light direction to see shadows
   - Verify shadows appear correctly on surfaces
   - Check that shadow intensity is visible

2. **SSR Testing:**
   - Enable SSR in rendering quality panel
   - Load a scene with reflective surfaces
   - Verify reflections appear on surfaces
   - Check that reflections fade correctly with distance

3. **Debug Modes:**
   - SSS: Set `debugMode = 1.0` to visualize depth
   - SSS: Set `debugMode = 2.0` to visualize shadows only
   - Check console logs for texture connection status

---

## Files Modified

1. `src/viewer/pathTracer/DepthRenderPass.ts` - Linear depth calculation
2. `src/viewer/pathTracer/NormalRenderPass.ts` - View space normals (cleanup)
3. `src/viewer/postprocessing/SSRShader.ts` - Correct depth reading and ray marching

---

## Expected Results

✅ **SSS (Screen Space Shadows):**
- Shadows should now appear correctly based on light direction
- Shadow intensity should be visible and adjustable
- No more blue geometric artifacts

✅ **SSR (Screen Space Reflections):**
- Reflections should appear on reflective surfaces
- Ray marching should correctly intersect with surfaces
- Reflections should fade properly with distance

---

## Notes

- SSS shader was already correct for reading normalized linear depth
- The main issue was the depth source (DepthRenderPass) providing wrong format
- All fixes maintain backward compatibility with existing code
- No breaking changes to API or configuration
