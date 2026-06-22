# Post-Processing Shadow and Color Fixes

## Issues Reported

### 1. ⚠️ Shadows Do Not Work Correctly in Post-Processing
- Shadows appear soft and indistinct
- Shadow maps may be disabled during post-processing render
- Traditional shadow maps not visible when post-processing is enabled

### 2. ⚠️ Colors Look Washed Out in Post-Processing
- Colors appear desaturated and muted
- Likely caused by double tone mapping or incorrect color space handling
- Tone mapping may be applied multiple times

---

## Root Cause Analysis

### Shadow Issues

**Problem 1: Shadow Maps Disabled During Render**
- Post-processing render may disable shadow maps
- RenderPass might not preserve shadow map state
- Shadow maps need to be rendered before post-processing

**Problem 2: Shadow Map Settings Not Preserved**
- Current code preserves settings but may not restore them correctly
- Shadow maps might be disabled by EffectComposer

### Color Issues

**Problem 1: Double Tone Mapping**
- Renderer has built-in tone mapping: `renderer.toneMapping`
- Custom ToneMappingShader also applies tone mapping
- OutputPass may apply tone mapping again
- Result: Colors are tone mapped multiple times → washed out

**Problem 2: Color Space Issues**
- Input colors may be in wrong color space
- Gamma correction applied multiple times
- sRGB/Linear color space conversion issues

**Problem 3: Pass Order**
- Tone mapping should come before color grading
- Current order: Render → AO → SSS → SSR → Bloom → LUT → ToneMapping → ColorGrading → Output
- LUT should come after tone mapping, not before

---

## Fixes Required

### Fix 1: Ensure Shadow Maps Are Enabled During RenderPass

**Issue**: RenderPass may disable shadow maps when rendering to texture.

**Solution**: Explicitly enable shadow maps before RenderPass renders.

### Fix 2: Prevent Double Tone Mapping

**Issue**: Multiple tone mapping passes causing washed out colors.

**Solution**:
1. Disable renderer tone mapping completely
2. Ensure OutputPass doesn't apply tone mapping
3. Only apply tone mapping once in ToneMappingShader

### Fix 3: Fix Color Space Handling

**Issue**: Colors may be in wrong color space.

**Solution**:
1. Ensure input is linear color space
2. Apply tone mapping in linear space
3. Convert to sRGB only at the end (in OutputPass or ToneMappingShader)

### Fix 4: Fix Pass Order

**Issue**: LUT comes before tone mapping, should come after.

**Solution**: Reorder passes: Render → AO → SSS → SSR → Bloom → ToneMapping → LUT → ColorGrading → Output

---

## Implementation Plan

1. **Shadow Map Fixes**:
   - Ensure shadow maps are enabled before RenderPass
   - Verify shadow maps are preserved through post-processing
   - Test with traditional shadow maps (not just SSS)

2. **Tone Mapping Fixes**:
   - Disable renderer tone mapping completely
   - Remove tone mapping from OutputPass
   - Ensure only ToneMappingShader applies tone mapping
   - Fix color space conversions

3. **Color Grading Fixes**:
   - Ensure color grading works in correct color space
   - Fix pass order (LUT after tone mapping)
   - Verify gamma correction is applied correctly

4. **Testing**:
   - Compare with Three.js official examples
   - Test shadow visibility
   - Test color vibrancy
   - Test tone mapping quality


























