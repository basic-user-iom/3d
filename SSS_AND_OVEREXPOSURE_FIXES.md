# SSS Visibility and Overexposure Fixes

**Date:** 2025-01-27  
**Status:** ✅ Fixes applied

---

## Issues Identified

### 1. SSS Not Visible / Background Artifacts
- **Root Cause:** DepthRenderPass was using `gl_FragCoord.z` (screen-space depth) instead of linear depth
- **Impact:** SSS shader couldn't properly trace shadows because depth values were incorrect
- **Symptom:** Only background artifacts visible, no actual shadows on objects

### 2. Post-Processing Overexposure
- **Root Cause:** Renderer's tone mapping was still active when post-processing was enabled
- **Impact:** Double tone mapping (renderer + custom ToneMappingShader) caused overexposure
- **Symptom:** Scene becomes too bright when post-processing is enabled

---

## Fixes Applied

### Fix 1: Depth Texture - Linear Depth Calculation

**File:** `src/viewer/pathTracer/DepthRenderPass.ts`

**Problem:**
- Used `gl_FragCoord.z` which is screen-space (perspective-corrected) depth
- SSS shader expects normalized linear depth (0 = near, 1 = far)

**Solution:**
- Calculate linear depth from view space Z position
- Use `vViewPosition.z` to get view space depth
- Normalize using camera near/far planes

**Code Change:**
```glsl
// OLD (incorrect):
float depth = gl_FragCoord.z; // Screen-space depth

// NEW (correct):
float viewZ = -vViewPosition.z; // View space Z
float normalizedLinearDepth = (viewZ - cameraNear) / (cameraFar - cameraNear);
```

**Impact:**
- Depth texture now contains proper linear depth values
- SSS can correctly trace shadows in screen space
- Background artifacts should disappear

---

### Fix 2: SSS Light Direction Validation

**File:** `src/viewer/postprocessing/SSSShader.ts`

**Problem:**
- No validation for zero/invalid light direction
- Ray direction calculation could fail silently

**Solution:**
- Check light direction length before processing
- Validate screen space direction (can't be zero)
- Early return if light direction is invalid

**Code Changes:**
- Added light direction length check
- Added screen space direction validation
- Better error handling for edge cases

**Impact:**
- Prevents artifacts from invalid light directions
- Better debugging (early returns show issues clearly)

---

### Fix 3: Renderer Tone Mapping Disabled

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**Problem:**
- Renderer's tone mapping was still active when post-processing enabled
- Custom ToneMappingShader + renderer tone mapping = double application
- Caused overexposure

**Solution:**
- Disable renderer tone mapping in `render()` method when post-processing is enabled
- Set `renderer.toneMapping = THREE.NoToneMapping`
- Set `renderer.toneMappingExposure = 1.0`

**Code Change:**
```typescript
// In render() method, before composer.render():
if (this.config.enabled) {
  this.renderer.toneMapping = THREE.NoToneMapping
  this.renderer.toneMappingExposure = 1.0
}
```

**Impact:**
- Prevents double tone mapping
- Fixes overexposure issue
- Custom ToneMappingShader now has full control

---

### Fix 4: Depth Texture Uniform Updates

**File:** `src/viewer/pathTracer/DepthRenderPass.ts`

**Problem:**
- Camera near/far uniforms not updated during render
- Depth calculation could use wrong values

**Solution:**
- Update camera uniforms in `render()` method
- Use actual camera near/far values

**Code Change:**
```typescript
if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
  this.depthMaterial.uniforms.cameraNear.value = camera.near
  this.depthMaterial.uniforms.cameraFar.value = camera.far
}
```

**Impact:**
- Depth calculation uses correct camera parameters
- Works with different camera configurations

---

## Testing Instructions

### Test SSS Visibility

1. **Enable SSS:**
   - Go to **Quality → Effects → SSS**
   - Check "Enable SSS"
   - Set intensity to **1.0 or higher**

2. **Check Console:**
   - Look for: `[PostProcessingSystem] ✅ SSS pass added`
   - Verify: `hasDepthTexture: true`
   - Check: `effectiveIntensity` value (should be > 0.4)

3. **Enable Debug Mode:**
   ```javascript
   const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
   if (postProcessingSystem?.sssPass) {
     // Debug mode 1.0: Visualize depth texture
     postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0
     
     // Debug mode 2.0: Visualize shadow only
     // postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
   }
   ```

4. **Visual Check:**
   - Should see shadows in contact areas (where objects meet)
   - Shadows should follow light direction
   - No background artifacts

### Test Overexposure Fix

1. **Enable Post-Processing:**
   - Go to **Quality → Effects**
   - Enable post-processing

2. **Check Brightness:**
   - Scene should NOT become overexposed
   - Brightness should match scene without post-processing
   - Adjust tone mapping exposure if needed (default: 1.0)

3. **Adjust Exposure:**
   - If still too bright, reduce tone mapping exposure
   - Go to **Quality → Effects → Tone Mapping**
   - Lower exposure value (try 0.8 or 0.6)

---

## Expected Results

### Before Fixes:
- ❌ SSS shows only background artifacts
- ❌ No visible shadows on objects
- ❌ Post-processing causes overexposure
- ❌ Scene becomes too bright

### After Fixes:
- ✅ SSS shows proper shadows in contact areas
- ✅ Shadows follow light direction correctly
- ✅ No background artifacts
- ✅ Post-processing maintains correct brightness
- ✅ Tone mapping exposure works as expected

---

## Debugging Tips

### If SSS Still Not Visible:

1. **Check Light Direction:**
   ```javascript
   const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
   console.log('Light Direction:', postProcessingSystem?.sssPass?.uniforms.lightDirection.value)
   ```
   - Should be non-zero vector
   - Should be normalized (length ≈ 1.0)

2. **Check Depth Texture:**
   - Enable debug mode 1.0 (see above)
   - Should see grayscale depth visualization
   - Near objects = dark, far objects = bright

3. **Check Intensity:**
   - Increase intensity to 2.0 or higher
   - Check if shadows become visible
   - If yes, intensity was too low

### If Still Overexposed:

1. **Check Renderer Tone Mapping:**
   ```javascript
   const renderer = window.viewerRef?.current?.renderer
   console.log('Tone Mapping:', renderer.toneMapping)
   console.log('Exposure:', renderer.toneMappingExposure)
   ```
   - Should be `NoToneMapping` (0)
   - Exposure should be 1.0

2. **Reduce Tone Mapping Exposure:**
   - Lower exposure in UI (try 0.7-0.8)
   - Or adjust in code if needed

---

## Files Modified

1. `src/viewer/pathTracer/DepthRenderPass.ts`
   - Fixed depth calculation to use linear depth
   - Added camera uniform updates

2. `src/viewer/postprocessing/SSSShader.ts`
   - Added light direction validation
   - Improved ray direction calculation
   - Better error handling

3. `src/viewer/postprocessing/PostProcessingSystem.ts`
   - Disable renderer tone mapping when post-processing enabled
   - Ensure tone mapping is disabled in render() method

---

**Ready for testing!** 🚀

Reload the page and test SSS visibility and post-processing exposure.














