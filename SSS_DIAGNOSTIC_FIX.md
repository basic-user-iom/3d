# SSS Diagnostic and Additional Fixes

**Date:** 2025-01-27  
**Status:** Additional fixes applied

---

## Issue: SSS Enabled But No Shadows Visible

Despite SSS being enabled with intensity 2.0, no shadows are visible on the car or ground.

---

## Additional Fixes Applied

### Fix 1: tDiffuse Connection from RenderPass

**Problem:**
- SSS was getting `tDiffuse` from composer's `readBuffer`
- At the time SSS runs, `readBuffer` might not have the scene render yet
- Should use `RenderPass` output directly

**Solution:**
- Changed to get `tDiffuse` from `RenderPass.renderTarget.texture`
- This ensures SSS gets the actual scene render, not a previous pass output

**Files Modified:**
- `src/viewer/postprocessing/PostProcessingSystem.ts`
  - Line 372-375: Updated tDiffuse connection in render() method
  - Line 827-830: Updated tDiffuse connection in render override

---

### Fix 2: Light Direction Normalization

**Problem:**
- Light direction might not be normalized after matrix transformation
- Matrix transformation can change vector length

**Solution:**
- Added explicit normalization after view space transformation
- Added validation warning if light direction length is invalid

**Files Modified:**
- `src/viewer/postprocessing/PostProcessingSystem.ts`
  - Line 510-530: Added normalization and validation

---

## Diagnostic Steps

### Step 1: Enable Debug Mode to Visualize Depth

Open browser console and run:

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  // Debug mode 1.0: Visualize depth texture (grayscale)
  postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0
}
```

**Expected Result:**
- Should see grayscale depth visualization
- Near objects = dark
- Far objects = bright
- Background = white (depth >= 0.999)

**If depth texture is wrong:**
- All white = depth texture not working
- All black = depth texture not connected
- Random colors = depth format issue

---

### Step 2: Visualize Shadow Only

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  // Debug mode 2.0: Visualize shadow calculation only
  postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0
}
```

**Expected Result:**
- Should see white areas (shadows) and black areas (no shadows)
- Shadows should follow light direction

**If no shadows visible:**
- All black = shadow calculation not working
- All white = everything is shadowed (light direction wrong)

---

### Step 3: Check Light Direction

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  const lightDir = postProcessingSystem.sssPass.uniforms.lightDirection.value
  console.log('SSS Light Direction:', {
    x: lightDir.x.toFixed(3),
    y: lightDir.y.toFixed(3),
    z: lightDir.z.toFixed(3),
    length: lightDir.length().toFixed(3)
  })
}
```

**Expected Result:**
- Length should be ≈ 1.0 (normalized)
- Direction should match your light (e.g., if sun is above, Y should be negative)

**If light direction is wrong:**
- Length = 0 or very small = light direction not set
- Length > 1.5 = not normalized
- Wrong direction = light direction calculation issue

---

### Step 4: Check Depth Texture Connection

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  const depthTexture = postProcessingSystem.sssPass.uniforms.tDepth.value
  console.log('SSS Depth Texture:', {
    exists: !!depthTexture,
    width: depthTexture?.image?.width,
    height: depthTexture?.image?.height,
    format: depthTexture?.format,
    type: depthTexture?.type
  })
}
```

**Expected Result:**
- `exists: true`
- `width` and `height` should match screen size
- `format` should be `RGBAFormat` (1023)
- `type` should be `UnsignedByteType` (1009)

---

### Step 5: Check tDiffuse Connection

```javascript
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  const diffuseTexture = postProcessingSystem.sssPass.uniforms.tDiffuse.value
  console.log('SSS tDiffuse Texture:', {
    exists: !!diffuseTexture,
    width: diffuseTexture?.image?.width,
    height: diffuseTexture?.image?.height
  })
}
```

**Expected Result:**
- `exists: true`
- Should have valid width/height

---

## Common Issues and Solutions

### Issue 1: Depth Texture All White/Black

**Cause:** DepthRenderPass not rendering correctly

**Solution:**
- Check if depth prepass is running
- Verify camera near/far are set correctly
- Check depth material uniforms

### Issue 2: Light Direction Zero or Invalid

**Cause:** Light direction not set or transformation failed

**Solution:**
- Check light direction in UI (should be non-zero)
- Verify camera matrix is valid
- Check console for warnings

### Issue 3: Shadows Not Visible Even with Debug Mode 2.0

**Cause:** Shadow calculation logic issue

**Possible Solutions:**
- Increase `rayDistance` (try 200+)
- Increase `samples` (try 16+)
- Decrease `bias` (try 0.001)
- Increase `thickness` (try 0.05)

### Issue 4: Shadows Visible in Debug But Not in Final Render

**Cause:** Intensity too low or shadow application wrong

**Solution:**
- Check `effectiveIntensity` value
- Should be > 0.5 for visibility
- If shadow maps active, intensity is reduced by multiplier

---

## Testing Checklist

- [ ] Enable debug mode 1.0 - see depth visualization
- [ ] Enable debug mode 2.0 - see shadow visualization
- [ ] Check light direction is normalized (length ≈ 1.0)
- [ ] Check depth texture is connected
- [ ] Check tDiffuse texture is connected
- [ ] Verify intensity > 0.5
- [ ] Try increasing rayDistance to 200
- [ ] Try increasing samples to 16
- [ ] Check console for warnings

---

## Next Steps

1. **Reload the page** to apply fixes
2. **Enable debug mode 1.0** to check depth texture
3. **Enable debug mode 2.0** to check shadow calculation
4. **Check console** for light direction and texture info
5. **Report findings** - which debug mode shows what?

---

**The fixes should help, but we need diagnostic info to pinpoint the exact issue!**














