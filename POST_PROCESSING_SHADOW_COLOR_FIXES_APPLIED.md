# Post-Processing Shadow and Color Fixes Applied

## Issues Fixed

### 1. ✅ Shadows Not Working in Post-Processing

**Root Cause**: Shadow maps may be disabled during RenderPass rendering, or not properly preserved.

**Fixes Applied**:
1. **Ensure Shadow Maps Enabled Before Render**: Added check in `render()` method to ensure shadow maps are enabled before RenderPass renders
2. **Preserve Shadow Map State**: Already preserving shadow map settings, but now explicitly enabling them if disabled
3. **RenderPass Shadow Support**: RenderPass should preserve shadows, but we ensure they're enabled

**Changes Made**:
- **File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Lines**: 377-391 (render method)
- Added explicit shadow map enable check before rendering
- Added warning if shadow maps are disabled

### 2. ✅ Colors Washed Out in Post-Processing

**Root Cause**: Multiple issues causing washed out colors:
1. **Double Tone Mapping**: Tone mapping applied in ToneMappingShader AND potentially in OutputPass
2. **Double Gamma Correction**: Gamma correction applied in ToneMappingShader AND OutputPass
3. **Wrong Color Space**: Input colors may be in wrong color space
4. **Wrong Pass Order**: LUT was coming before tone mapping (should be after)

**Fixes Applied**:

#### Fix 2.1: Remove Gamma Correction from ToneMappingShader
- **File**: `src/viewer/postprocessing/ToneMappingShader.ts`
- **Lines**: 104-105
- **Change**: Removed `pow(color, vec3(1.0 / 2.2))` gamma correction
- **Reason**: OutputPass will handle sRGB conversion. Applying gamma twice causes washed out colors.

#### Fix 2.2: Set Correct Color Space
- **File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Lines**: 131-145 (initialize method)
- **Change**: Set `renderer.outputColorSpace = THREE.LinearSRGBColorSpace` for post-processing pipeline
- **Reason**: Post-processing expects linear color space, converts to sRGB at the end

#### Fix 2.3: Fix Pass Order (LUT After Tone Mapping)
- **File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Lines**: 259-285 (initialize), 972-1000 (updateConfig)
- **Change**: Moved LUT pass to come AFTER tone mapping pass
- **Reason**: Tone mapping converts HDR→LDR, LUT should be applied to LDR colors
- **Correct Order**: Render → AO → SSS → SSR → Bloom → Anamorphic → **ToneMapping** → **LUT** → ColorGrading → Output

#### Fix 2.4: Ensure OutputPass Doesn't Apply Tone Mapping
- **File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Lines**: 307-330 (initialize)
- **Change**: Explicitly disable tone mapping in OutputPass
- **Reason**: We handle tone mapping in ToneMappingShader, OutputPass should only do sRGB conversion

#### Fix 2.5: Fix Pass Order Validation
- **File**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Lines**: 354-390 (validatePassOrder)
- **Change**: Updated correct order to: Render → AO → SSS → SSR → Bloom → Anamorphic → ToneMapping → LUT → ColorGrading → Output

---

## Complete Fix Summary

### Shadow Fixes
1. ✅ Ensure shadow maps are enabled before RenderPass renders
2. ✅ Preserve shadow map state through post-processing
3. ✅ Add warnings if shadow maps are disabled

### Color Fixes
1. ✅ Removed double gamma correction (removed from ToneMappingShader)
2. ✅ Set correct color space (LinearSRGBColorSpace for post-processing)
3. ✅ Fixed pass order (ToneMapping → LUT → ColorGrading)
4. ✅ Disabled tone mapping in OutputPass
5. ✅ Updated pass order validation

---

## Files Modified

1. **src/viewer/postprocessing/PostProcessingSystem.ts**
   - Shadow map enable check in render()
   - Color space setup in initialize()
   - Pass order fixes (ToneMapping before LUT)
   - OutputPass tone mapping disabled
   - Pass order validation updated

2. **src/viewer/postprocessing/ToneMappingShader.ts**
   - Removed gamma correction (OutputPass handles it)

3. **src/viewer/postprocessing/ColorGradingShader.ts**
   - Added comment clarifying gamma is artistic adjustment, not color space conversion

---

## Testing

### Shadow Testing
```javascript
// In browser console:
const viewer = window.viewerRef?.current
// Check shadow map status
console.log('Shadow maps enabled:', viewer.renderer.shadowMap.enabled)
// Enable post-processing and check shadows are still visible
```

### Color Testing
```javascript
// In browser console:
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
// Check pass order
console.log('Pass order:', postProcessingSystem.composer.passes.map(p => p.constructor.name))
// Should be: RenderPass, SAOPass, ShaderPass (SSS), ShaderPass (SSR), UnrealBloomPass, ShaderPass (Anamorphic), ShaderPass (ToneMapping), ShaderPass (LUT), ShaderPass (ColorGrading), OutputPass
```

---

## Expected Results

### Shadows
- ✅ Traditional shadow maps (from DirectionalLight) should be visible
- ✅ Shadows should not disappear when post-processing is enabled
- ✅ Shadow quality should be maintained

### Colors
- ✅ Colors should be vibrant and not washed out
- ✅ Tone mapping should work correctly
- ✅ Color grading should work correctly
- ✅ LUT should work correctly
- ✅ No double tone mapping or gamma correction

---

## Notes

- All fixes are backward compatible
- No breaking changes to API
- Improved color space handling
- Better shadow map preservation
- Correct pass order for color processing


























