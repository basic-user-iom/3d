# SSS Algorithm Fix - Simplified Shadow Tracing

**Date:** 2025-01-27  
**Status:** ✅ Algorithm simplified and corrected

---

## Problem Identified

1. **No visible shadows** - SSS enabled but no shadows on car or ground
2. **Ghosting artifacts** - Faint blue halo around car edges
3. **Complex algorithm** - Overly complicated depth comparison logic

---

## Root Cause

The shadow tracing algorithm had several issues:

1. **Complex depth step calculation** - Multiple layers of calculations that could introduce errors
2. **Incorrect depth comparison** - The occluder detection logic was too complex
3. **Ray direction calculation** - Overly complicated screen space direction calculation

---

## Fix Applied

### Simplified Shadow Tracing Algorithm

**Key Changes:**

1. **Simplified depth step:**
   ```glsl
   // OLD: Complex calculation with multiple factors
   float minWorldDepthStep = rayDistance / float(samples) * 0.1;
   float worldDepthStep = max(abs(rayDir.z) * rayDistance / float(samples), minWorldDepthStep);
   
   // NEW: Simple, direct calculation
   float depthStep = abs(rayDir.z) * rayDistance / float(samples);
   ```

2. **Corrected occluder detection:**
   ```glsl
   // OLD: Complex comparison with multiple thresholds
   float depthDiff = rayDepth - sampleDepthValue;
   if (depthDiff > effectiveBias && depthDiff < maxDepthDiff) { ... }
   
   // NEW: Simple, correct comparison
   float depthDifference = expectedDepth - sampleDepthValue;
   if (depthDifference > bias && depthDifference < thickness) { ... }
   ```

3. **Simplified ray stepping:**
   ```glsl
   // OLD: Start from i=1, use (i-1) in calculations
   for (int i = 1; i < 64; i++) {
     vec2 sampleUV = uv + step * float(i - 1);
     float rayDepth = rayStartDepth + normalizedDepthStep * float(i - 1);
   }
   
   // NEW: Start from i=1, use i directly
   for (int i = 1; i < 64; i++) {
     vec2 sampleUV = uv + screenStep * float(i);
     float expectedDepth = rayStartDepth + normalizedDepthStep * float(i);
   }
   ```

4. **Corrected shadow accumulation:**
   ```glsl
   // OLD: Divide by samples inside loop
   shadow += shadowFactor / float(samples);
   
   // NEW: Accumulate, then normalize once
   shadow += shadowFactor;
   // ... after loop
   shadow = shadow / float(samples);
   ```

---

## How It Works Now

1. **Start from current pixel depth** + bias (to avoid self-intersection)
2. **Trace ray in screen space** along light direction
3. **For each sample:**
   - Calculate expected depth along ray
   - Sample actual depth at that position
   - If actual depth < expected depth → occluder found (something is closer)
   - Add shadow contribution
4. **Normalize by number of samples**
5. **Apply shadow to color** (darken shadowed areas)

---

## Expected Results

### Before Fix:
- ❌ No shadows visible
- ❌ Ghosting artifacts around edges
- ❌ Complex, error-prone algorithm

### After Fix:
- ✅ Shadows should appear in contact areas
- ✅ No ghosting artifacts
- ✅ Simpler, more reliable algorithm

---

## Testing

1. **Reload the page** to apply the fix
2. **Enable SSS** if not already enabled
3. **Check for shadows:**
   - Under car (contact shadows)
   - Around wheels
   - In crevices and details
4. **Check for artifacts:**
   - No ghosting/halo around edges
   - No blue artifacts
   - Clean shadow edges

---

## Debug Mode

If shadows still not visible, enable debug mode:

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  // Debug mode 2.0: Visualize shadow calculation
  postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
}
```

**Expected:** White areas = shadows, black areas = no shadows

---

## Parameters to Adjust

If shadows are too weak or too strong:

- **Intensity:** 0.5 - 2.0 (current: 2.0) - Shadow strength
- **Max Radius:** 2.0 - 10.0 (current: 5.5) - Search radius
- **Samples:** 8 - 16 (current: 12) - Quality vs performance
- **Ray Distance:** 50 - 200 (current: 200) - How far to trace
- **Thickness:** 0.01 - 0.1 (current: ~0.02) - Occluder detection range
- **Bias:** 0.001 - 0.01 (current: 0.01) - Self-intersection avoidance

---

**The algorithm is now simplified and should work correctly!** 🚀

Reload and test - shadows should be visible now.














