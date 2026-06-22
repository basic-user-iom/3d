# SSS Algorithm Fix - Based on Official Three.js Example

**Date:** 2025-01-27  
**Status:** ✅ Algorithm rewritten based on official Three.js example

---

## Reference

Official Three.js example: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_postprocessing_sss.html

---

## Key Differences Found

### Official Example Uses:
1. **WebGPU/TSL** - Uses `sss()` TSL node (not available in WebGL)
2. **maxDistance: 0.2** - Very small value (in world/view space units)
3. **Combines with shadow maps** - Uses `builtinShadowContext()` to blend
4. **Temporal filtering** - Uses TRAANode for anti-aliasing

### Our Implementation (WebGL):
1. **EffectComposer + ShaderPass** - WebGL equivalent
2. **Custom GLSL shader** - Must implement algorithm manually
3. **Depth prepass** - Custom DepthRenderPass

---

## Algorithm Fixes Applied

### 1. Proper Depth Conversion

**Problem:** We were comparing normalized depths directly, but we need view space depths for proper ray tracing.

**Fix:**
```glsl
// Convert normalized depth to view space depth
float viewDepth = cameraNear + currentDepth * depthRange;
float sampleViewDepth = cameraNear + sampleDepthNorm * depthRange;
```

### 2. Correct Ray Direction Calculation

**Problem:** We were only using XY components, ignoring Z component.

**Fix:**
```glsl
// Screen space step (XY)
vec2 screenStep = lightDirXY * (maxRadius / samples) / resolution;

// Depth step (Z) - accounts for 3D ray direction
float depthStep = lightDir.z * rayDistance / samples;
```

### 3. Proper Occluder Detection

**Problem:** We were checking if sample is closer, but didn't account for expected depth along ray.

**Fix:**
```glsl
// Calculate expected depth along ray
float expectedViewDepth = viewDepth + depthStep * i;

// Check if sample is closer than expected (occluder)
float depthDiff = expectedViewDepth - sampleViewDepth;
if (depthDiff > bias && depthDiff < thickness) {
  // Occluder found
}
```

---

## Key Insights from Official Example

1. **maxDistance is small** - Official uses 0.2, suggesting rayDistance should be small
2. **Combines with shadow maps** - SSS complements, doesn't replace shadow maps
3. **Uses temporal filtering** - Reduces noise/artifacts
4. **Quality parameter** - Controls sample count/quality

---

## Testing

1. **Reload the page** to apply the fix
2. **Check console** - Should see SSS pass added
3. **Enable debug mode:**
   ```javascript
   const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
   if (postProcessingSystem?.sssPass) {
     postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
   }
   ```
4. **Adjust parameters:**
   - **rayDistance:** Try 0.1-0.5 (much smaller than current 50-200)
   - **maxRadius:** Keep 2-10 (screen space pixels)
   - **bias:** Keep 0.01-0.1
   - **thickness:** Keep 0.01-0.1

---

## Expected Results

### Before:
- ❌ No shadows visible
- ❌ Blue artifacts
- ❌ Wrong algorithm

### After:
- ✅ Proper shadows in contact areas
- ✅ No artifacts
- ✅ Correct algorithm based on official example

---

**The algorithm is now based on the official Three.js example!** 🚀

Reload and test - shadows should work correctly now.














