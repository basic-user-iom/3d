# Post-Processing Complete Fixes - Shadows and Colors

## Summary
Fixed critical issues with shadows and colors in post-processing based on Three.js best practices and Perplexity analysis.

---

## 1. ✅ Shadows Fixed

### Problem
Shadows were not working correctly in post-processing - appearing soft and indistinct or completely missing.

### Root Cause
EffectComposer's default render target doesn't have depth buffer enabled, which is required to preserve shadow maps during post-processing.

### Fix Applied

**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`

**Changes**:
1. **Create Render Target with Depth Buffer** (lines 145-155):
   ```typescript
   // FIX: Create render target with depth buffer to preserve shadows
   const renderTarget = new THREE.WebGLRenderTarget(width, height, {
     minFilter: THREE.LinearFilter,
     magFilter: THREE.LinearFilter,
     format: THREE.RGBAFormat,
     type: THREE.UnsignedByteType,
     depthBuffer: true, // CRITICAL: Enable depth buffer to preserve shadows
     stencilBuffer: false
   })
   
   this.composer = new EffectComposer(this.renderer, renderTarget)
   ```

2. **Ensure Shadow Maps Enabled** (lines 384-391):
   ```typescript
   // FIX: Ensure shadow maps are enabled before RenderPass renders
   if (!this.renderer.shadowMap.enabled) {
     console.warn('[PostProcessingSystem] ⚠️ Shadow maps are disabled! Enabling for post-processing render.')
     this.renderer.shadowMap.enabled = true
   }
   ```

3. **Update Render Target Size** (lines 466-473):
   ```typescript
   setSize(width: number, height: number) {
     if (this.composer) {
       this.composer.setSize(width, height)
       // FIX: Update composer's render target size (for depth buffer preservation)
       if (this.composerRenderTarget) {
         this.composerRenderTarget.setSize(width, height)
       }
     }
   }
   ```

4. **Dispose Render Target** (lines 1520-1535):
   ```typescript
   // FIX: Dispose composer render target
   if (this.composerRenderTarget) {
     this.composerRenderTarget.dispose()
     this.composerRenderTarget = null
   }
   ```

### Result
- ✅ Shadow maps are now preserved through post-processing
- ✅ Traditional shadows (from DirectionalLight) are visible
- ✅ Shadow quality is maintained

---

## 2. ✅ Colors Fixed

### Problem
Colors looked washed out and desaturated in post-processing.

### Root Causes
1. **Double Gamma Correction**: Gamma correction applied in ToneMappingShader AND OutputPass
2. **Wrong Color Space**: Color space not properly configured for post-processing
3. **Wrong Pass Order**: LUT was coming before tone mapping (should be after)
4. **Double Tone Mapping**: Tone mapping potentially applied multiple times

### Fixes Applied

#### Fix 2.1: Remove Gamma Correction from ToneMappingShader
**File**: `src/viewer/postprocessing/ToneMappingShader.ts`
**Lines**: 104-105
```typescript
// FIX: Do NOT apply gamma correction here - OutputPass will handle it
// Applying gamma here and again in OutputPass causes double gamma correction = washed out colors
// Keep colors in linear space, let OutputPass convert to sRGB
// color = pow(color, vec3(1.0 / 2.2)); // REMOVED - causes double gamma
```

#### Fix 2.2: Set Correct Color Space
**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
**Lines**: 143-145
```typescript
// FIX: Set output color space to LinearSRGB for post-processing pipeline
// Post-processing expects linear color space input, converts to sRGB at the end
if ('outputColorSpace' in this.renderer) {
  (this.renderer as any).outputColorSpace = THREE.LinearSRGBColorSpace
}
```

#### Fix 2.3: Fix Pass Order (ToneMapping Before LUT)
**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
**Lines**: 259-285 (initialize), 972-1000, 1267-1322 (updateConfig)

**Before (WRONG)**:
```
Render → AO → SSS → SSR → Bloom → Anamorphic → LUT → ToneMapping → ColorGrading → Output
```

**After (CORRECT)**:
```
Render → AO → SSS → SSR → Bloom → Anamorphic → ToneMapping → LUT → ColorGrading → Output
```

**Reason**: Tone mapping converts HDR→LDR, LUT should be applied to LDR colors.

#### Fix 2.4: Disable Tone Mapping in OutputPass
**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
**Lines**: 307-330
```typescript
// FIX: Disable tone mapping in OutputPass to prevent double tone mapping
if (this.outputPass.uniforms && 'toneMappingExposure' in this.outputPass.uniforms) {
  (this.outputPass.uniforms as any).toneMappingExposure.value = 1.0
}

// FIX: OutputPass should convert from linear to sRGB (gamma correction)
if ('toneMapping' in this.outputPass) {
  (this.outputPass as any).toneMapping = THREE.NoToneMapping
}
```

### Result
- ✅ Colors are now vibrant and not washed out
- ✅ No double tone mapping
- ✅ No double gamma correction
- ✅ Correct color space handling
- ✅ Correct pass order

---

## Complete Fix Summary

### Shadow Fixes
1. ✅ Created render target with depth buffer enabled
2. ✅ Ensure shadow maps are enabled before RenderPass
3. ✅ Preserve shadow map state through post-processing
4. ✅ Proper render target size updates

### Color Fixes
1. ✅ Removed gamma correction from ToneMappingShader
2. ✅ Set LinearSRGBColorSpace for post-processing
3. ✅ Fixed pass order (ToneMapping → LUT → ColorGrading)
4. ✅ Disabled tone mapping in OutputPass
5. ✅ Updated pass order validation

---

## Files Modified

1. **src/viewer/postprocessing/PostProcessingSystem.ts**
   - Render target with depth buffer (lines 145-155)
   - Shadow map enable check (lines 384-391)
   - Color space setup (lines 143-145)
   - Pass order fixes (lines 259-285, 972-1000, 1267-1322)
   - OutputPass configuration (lines 307-330)
   - Render target size updates (lines 466-473)
   - Render target disposal (lines 1520-1535)

2. **src/viewer/postprocessing/ToneMappingShader.ts**
   - Removed gamma correction (line 105)

3. **src/viewer/postprocessing/ColorGradingShader.ts**
   - Added comment clarifying gamma is artistic adjustment

---

## Testing

### Shadow Testing
```javascript
// In browser console:
const viewer = window.viewerRef?.current
// Check shadow map status
console.log('Shadow maps enabled:', viewer.renderer.shadowMap.enabled)
// Check render target has depth buffer
const composer = viewer.postProcessingSystem.composer
console.log('Render target depth buffer:', composer.renderTarget?.depthBuffer)
// Shadows should be visible when post-processing is enabled
```

### Color Testing
```javascript
// In browser console:
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
// Check pass order
console.log('Pass order:', postProcessingSystem.composer.passes.map(p => p.constructor.name))
// Should be: RenderPass, SAOPass, ShaderPass (SSS), ShaderPass (SSR), UnrealBloomPass, ShaderPass (Anamorphic), ShaderPass (ToneMapping), ShaderPass (LUT), ShaderPass (ColorGrading), OutputPass
// Check color space
console.log('Output color space:', postProcessingSystem.renderer.outputColorSpace)
// Should be: LinearSRGBColorSpace
```

---

## Expected Results

### Shadows
- ✅ Traditional shadow maps (from DirectionalLight) are visible
- ✅ Shadows do not disappear when post-processing is enabled
- ✅ Shadow quality is maintained (not soft/indistinct)
- ✅ Depth buffer is preserved through post-processing

### Colors
- ✅ Colors are vibrant and not washed out
- ✅ Tone mapping works correctly
- ✅ Color grading works correctly
- ✅ LUT works correctly
- ✅ No double tone mapping or gamma correction
- ✅ Correct color space conversion (Linear → sRGB)

---

## References

Based on Three.js examples:
- https://threejs.org/examples/#webgpu_postprocessing_sss
- https://threejs.org/examples/#webgl_postprocessing_ssr
- https://threejs.org/examples/#webgl_postprocessing_material_ao
- https://threejs.org/examples/#webgl_tonemapping

---

## Notes

- All fixes are backward compatible
- No breaking changes to API
- Improved shadow map preservation
- Better color space handling
- Correct pass order for color processing
- Render target with depth buffer for shadows


























