# SSS Complete Rewrite - Based on Perplexity Research

**Date:** 2025-01-27  
**Status:** ✅ Complete rewrite applied

---

## Problem

Blue geometric artifacts appearing instead of shadows when SSS is enabled.

---

## Root Causes Identified (from Perplexity)

1. **Complex ray direction calculation** - Overly complicated 3D ray calculation
2. **Incorrect depth comparison** - Wrong logic for occluder detection
3. **Depth step calculation** - Unnecessary complexity
4. **Y-axis flipping** - Potential texture coordinate issues

---

## Solution: Complete Rewrite

### Key Changes

1. **Simplified to pure screen-space tracing:**
   - Only uses XY components of light direction (screen space)
   - Ignores Z component (depth) for ray direction
   - Standard SSS approach

2. **Corrected depth comparison:**
   - Checks for depth discontinuities
   - If sample depth is significantly different (closer), it's an occluder
   - Uses simple depth difference check

3. **Removed complex calculations:**
   - No more "expected depth along ray"
   - No more complex depth step calculations
   - Simple screen-space stepping

4. **Simplified shadow application:**
   - Direct shadow multiplication
   - No complex intensity calculations in shader

---

## New Algorithm

```glsl
// 1. Get current pixel depth
float currentDepth = sampleDepth(uv);

// 2. Trace in screen space along light direction (XY only)
vec2 step = lightDirScreen * (maxRadius / samples);

// 3. For each sample:
for (int i = 1; i < samples; i++) {
  vec2 sampleUV = uv + step * i;
  float sampleDepth = sampleDepth(sampleUV);
  
  // 4. Check if sample is an occluder (closer depth)
  float depthDiff = sampleDepth - currentDepth;
  if (depthDiff < -bias && abs(depthDiff) < thickness) {
    // Occluder found - add shadow
    shadow += shadowFactor;
  }
}

// 5. Normalize and apply
shadow = shadow / samples;
color.rgb *= (1.0 - shadow * intensity);
```

---

## Expected Results

### Before:
- ❌ Blue geometric artifacts
- ❌ No proper shadows
- ❌ Complex, error-prone algorithm

### After:
- ✅ Proper shadows in contact areas
- ✅ No blue artifacts
- ✅ Simple, reliable algorithm

---

## Testing

1. **Reload the page** to apply the rewrite
2. **Check for shadows:**
   - Under car (contact shadows)
   - Around wheels
   - In crevices
3. **Check for artifacts:**
   - No blue shapes
   - No ghosting
   - Clean rendering

---

## Debug Mode

If shadows still not visible:

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  // Debug mode 2.0: Visualize shadow calculation
  postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
}
```

**Expected:** White areas = shadows, black areas = no shadows

---

## Parameters

Current settings from your UI:
- **Intensity:** 2.00 (high - should be very visible)
- **Max Radius:** 2.4 (reasonable)
- **Samples:** 33 (high quality)
- **Ray Distance:** 132 (good)
- **Thickness:** 0.451 (reasonable)
- **Bias:** 0.37 (might be too high - try 0.01-0.1)
- **Light Direction:** (0, -1, 0) - downward light (correct)

**Recommendation:** Try reducing **Bias** to 0.01-0.1 if shadows are too weak or artifacts appear.

---

**The algorithm is now completely rewritten based on standard SSS practices!** 🚀

Reload and test - the blue artifacts should be gone, and proper shadows should appear.














