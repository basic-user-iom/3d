# SSR (Screen Space Reflections) Fix Summary

**Date:** 2025-01-27  
**Status:** ✅ Fixed depth reading and depth comparison

---

## Problems Fixed

1. **Depth format mismatch** - SSR was reading depth incorrectly
2. **Depth comparison bug** - Comparing normalized depth (0-1) with view space Z coordinates
3. **Binary search depth comparison** - Same issue in binary search

---

## Fixes Applied

### 1. Fixed Depth Reading (Critical Fix)

**Before:**
```glsl
// SSR was trying to convert from NDC depth to linear depth
float readDepth(sampler2D depthSampler, vec2 coord) {
  float fragCoordZ = texture2D(depthSampler, coord).x;
  float n = cameraNear;
  float f = cameraFar;
  float z_ndc = fragCoordZ * 2.0 - 1.0;
  float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
  return (z_eye - n) / (f - n);
}
```

**After (matches DepthRenderPass output):**
```glsl
// DepthRenderPass outputs normalized linear depth (0-1) directly
float readDepth(sampler2D depthSampler, vec2 coord) {
  return texture2D(depthSampler, coord).r;
}
```

**Why:** `DepthRenderPass` already outputs normalized linear depth (0 = near, 1 = far) in the red channel, just like SSS uses. SSR was trying to convert it again, causing incorrect depth values.

### 2. Fixed Depth Comparison in Ray Marching

**Before:**
```glsl
depth = readDepth(tDepth, projectedCoord);
float depthDiff = hitCoord.z - depth; // WRONG: comparing view space Z with normalized depth (0-1)
```

**After:**
```glsl
float sampleDepth = readDepth(tDepth, projectedCoord);
vec3 sampleViewPos = getViewPos(projectedCoord, sampleDepth);
float depthDiff = hitCoord.z - sampleViewPos.z; // CORRECT: comparing view space Z coordinates
```

**Why:** We need to compare view space Z coordinates, not normalized depth values. The ray's position (`hitCoord.z`) is in view space, so we must reconstruct the surface position from depth and compare Z coordinates.

### 3. Fixed Binary Search Depth Comparison

**Before:**
```glsl
depth = readDepth(tDepth, projectedCoord);
float depthDiff = hitCoord.z - depth; // WRONG
```

**After:**
```glsl
float sampleDepth = readDepth(tDepth, projectedCoord);
vec3 sampleViewPos = getViewPos(projectedCoord, sampleDepth);
float depthDiff = hitCoord.z - sampleViewPos.z; // CORRECT
```

**Why:** Same issue - must compare view space Z coordinates, not normalized depth.

---

## Algorithm Now

1. **Read normalized linear depth** (0-1) from depth texture
2. **Reconstruct view space position** from depth and UV
3. **Compare view space Z coordinates** to detect intersections
4. **Ray march** in view space, project to screen space for sampling
5. **Binary search** to refine intersection point

---

## Testing

1. **Reload the page** (Ctrl+R or F5)
2. **Enable post-processing and SSR** via UI or console:
   ```javascript
   const store = window.useAppStore?.getState?.();
   if (store) {
     store.setPostProcessingEnabled(true);
     store.setSsrEnabled(true);
   }
   ```
3. **Check console** for SSR pass creation logs
4. **Look for reflections** on reflective surfaces (should see scene content reflected)

---

## Expected Results

- **Reflections visible** on surfaces with normals facing the camera
- **Reflections fade** with distance (controlled by `fadeDistance`)
- **Reflections respect** surface roughness (controlled by `roughnessFade`)
- **No artifacts** from incorrect depth comparison

---

## Files Modified

1. `src/viewer/postprocessing/SSRShader.ts` - Fixed depth reading and depth comparison

---

## Next Steps

1. Test SSR in browser
2. Adjust parameters if needed:
   - `maxDistance`: How far to trace reflections (default: 100)
   - `maxSteps`: Number of ray marching steps (default: 20)
   - `thickness`: Depth tolerance for intersection (default: 0.01)
   - `intensity`: Reflection strength (default: 1.0)
   - `fadeDistance`: Distance at which reflections fade (default: 10.0)

---

**All fixes are complete! Ready for testing.** 🚀














