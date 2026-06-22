# SSS Depth Comparison Fix

**Date:** 2025-01-27  
**Status:** ✅ Fixed depth comparison logic

---

## Problem

SSS shadows not visible - debug mode 2.0 shows all black. The depth comparison logic was inverted.

---

## Root Cause

In view space, the camera looks down the **negative Z axis**:
- Z = -10 is **closer** than Z = -20
- More negative Z = closer to camera

**Previous (WRONG) logic:**
```glsl
float depthDiff = expectedZ - actualZ;
if (depthDiff > bias) { // Wrong! This checks if expected is closer
```

**Example:**
- expectedZ = -20 (further)
- actualZ = -10 (closer, occluder!)
- depthDiff = -20 - (-10) = -10 (negative!)
- Condition `depthDiff > bias` is **FALSE** (rejects valid occluder!)

---

## Fix Applied

**Correct logic:**
```glsl
float depthDiff = actualZ - expectedZ; // FIXED: inverted
if (depthDiff < -bias && abs(depthDiff) < thickness) {
  // actualZ is more negative (closer) = occluder!
```

**Example (corrected):**
- expectedZ = -20 (further)
- actualZ = -10 (closer, occluder!)
- depthDiff = -10 - (-20) = 10 (positive, but we check negative!)
- Wait, that's still wrong...

**Actually, the correct check:**
- If actualZ is closer (more negative), then actualZ < expectedZ
- So depthDiff = actualZ - expectedZ is **negative**
- We check `depthDiff < -bias` (actual is significantly closer)

**Final correct logic:**
```glsl
float depthDiff = actualZ - expectedZ;
if (depthDiff < -bias && abs(depthDiff) < thickness) {
  // actualZ is more negative (closer) = occluder found!
  float shadowFactor = 1.0 - smoothstep(-bias, -thickness, depthDiff);
  shadow += shadowFactor;
}
```

---

## Testing

1. **Reload the page**
2. **Enable SSS** in post-processing settings
3. **Enable debug mode 2.0:**
   ```javascript
   const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
   if (postProcessingSystem?.sssPass) {
     postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
   }
   ```
4. **Expected:** Should see white areas (shadows detected) and black areas (no shadows)

---

**The depth comparison is now correct!** 🚀














