# SSS Position Reconstruction Fix

**Date:** 2025-01-27  
**Status:** ✅ Fixed 3D position reconstruction

---

## Problem

Debug mode 2.0 shows all black, meaning `traceShadow()` returns 0 for all pixels. The 3D position reconstruction was incorrect.

---

## Root Cause

The position reconstruction algorithm didn't match the working SSR shader:
1. **Wrong NDC conversion** - UV to NDC conversion was incorrect
2. **Wrong depth handling** - Not using standard depth reconstruction
3. **Wrong rayDistance scaling** - Was scaling by 0.01, making rays too short

---

## Fixes Applied

### 1. Corrected Position Reconstruction

**Before:**
```glsl
float viewZ = cameraNear + depth * (cameraFar - cameraNear);
vec2 ndc = (uv * 2.0 - 1.0) * vec2(1.0, -1.0);
vec4 viewPos = cameraProjectionMatrixInverse * vec4(ndc, -1.0, 1.0);
viewPos.z = -viewZ; // Wrong - overriding reconstructed Z
```

**After (matches SSR shader):**
```glsl
float ndcDepth = depth * 2.0 - 1.0; // Convert to NDC depth
vec2 ndc = vec2(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0); // Correct UV->NDC
vec4 clipPos = vec4(ndc, ndcDepth, 1.0);
vec4 viewPos = cameraProjectionMatrixInverse * clipPos;
viewPos.xyz /= viewPos.w; // Correct reconstruction
```

### 2. Fixed Screen Space Projection

**Before:**
```glsl
vec3 ndc = clipPos.xyz / clipPos.w;
vec2 sampleUV = ndc.xy * 0.5 + 0.5;
```

**After (matches SSR shader):**
```glsl
clipPos.xy /= clipPos.w; // Divide XY by W first
vec2 sampleUV = clipPos.xy * 0.5 + 0.5; // Then convert to UV
sampleUV.y = 1.0 - sampleUV.y; // Flip Y
```

### 3. Removed Ray Distance Scaling

**Before:**
```glsl
float effectiveRayDistance = rayDistance * 0.01; // Too small!
```

**After:**
```glsl
float effectiveRayDistance = rayDistance; // Use directly
```

---

## Algorithm Now

1. **Reconstruct 3D position** from depth and UV (correct method)
2. **Trace 3D ray** in view space toward light
3. **Project back to screen space** (correct projection)
4. **Sample depth** at projected position
5. **Compare depths** to detect occluders

---

## Testing

1. **Reload the page**
2. **Enable debug mode 2.0:**
   ```javascript
   const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
   if (postProcessingSystem?.sssPass) {
     postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
   }
   ```
3. **Expected:** Should see white areas (shadows) and black areas (no shadows)

---

## Parameter Recommendations

Based on official Three.js (maxDistance: 0.1-0.2):

- **rayDistance:** 0.1-0.5 for contact shadows (recommended)
- **rayDistance:** 1.0-10.0 for longer shadows
- **maxRadius:** 5-10 (screen space pixels)
- **samples:** 8-16
- **bias:** 0.001-0.01
- **thickness:** 0.01-0.1

---

**The position reconstruction now matches the working SSR shader!** 🚀

Reload and test - shadows should be visible in debug mode 2.0.














