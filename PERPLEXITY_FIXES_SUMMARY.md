# Post-Processing Fixes Based on Perplexity Research

## Summary
Research completed using Perplexity AI to identify solutions for the 4 in-progress post-processing tasks:
1. **Ambient Occlusion (AO)** - Not visible
2. **Screen Space Shadows (SSS)** - No visual changes
3. **Screen Space Reflections (SSR)** - No visual changes
4. **Emissive Bloom** - Needs UI integration

---

## 1. AMBIENT OCCLUSION (AO) - Fixes

### Key Findings from Perplexity:
- SAOPass must be added **before** final rendering passes
- Requires proper scene and camera assignment
- Intensity and radius need tuning (default may be too subtle)
- Materials must support normals (flatShading = false)
- WebGL 2.0 support required

### Current Implementation Status:
✅ Pass ordering is correct (Render → AO → ...)
✅ Scene and camera are assigned
✅ Dimensions are validated
⚠️ Intensity may be too low (default 0.08)
⚠️ Materials may not have proper normals

### Recommended Fixes:

#### Fix 1: Increase Default Intensity
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current default: `saoIntensity: 0.08`
- Perplexity suggests: `0.25-0.5` for visibility
- **Action:** Increase default to `0.25` and allow up to `2.0` for testing

#### Fix 2: Verify Material Normals
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Add check to ensure geometry has computed normals
- Ensure materials don't have `flatShading = true`
- **Action:** Add validation in `updateAOParameters()` to warn if scene lacks proper normals

#### Fix 3: Add Debug Mode
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Add ability to visualize AO only (OUTPUT.SAO mode)
- **Action:** Ensure output mode 2 (SAO Only) works correctly for debugging

#### Fix 4: Verify Pass Order
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current order: Render → AO → SSS → SSR → Bloom → ...
- **Action:** Verify AO is immediately after RenderPass (already correct)

---

## 2. SCREEN SPACE SHADOWS (SSS) - Fixes

### Key Findings from Perplexity:
- Requires depth texture (tDepth) from RenderPass or depth render target
- Depth texture must be properly connected to shader uniforms
- Depth buffer must be rendered
- Light direction transformation may be incorrect

### Current Implementation Status:
✅ Depth prepass exists (DepthRenderPass)
✅ Depth render target is created
✅ Texture connection logic exists
⚠️ Depth texture format/reading may be incorrect
⚠️ Light direction transformation needs verification
⚠️ Ray marching calculations may need adjustment

### Recommended Fixes:

#### Fix 1: Verify Depth Texture Format
**File:** `src/viewer/pathTracer/DepthRenderPass.ts`
- DepthRenderPass writes depth to color texture (red channel)
- SSS shader reads depth correctly, but verify format matches
- **Action:** Add debug visualization to verify depth texture contains valid data

#### Fix 2: Ensure Depth Prepass Renders Before SSS
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current: Depth prepass renders in `render()` method
- **Action:** Verify depth prepass renders BEFORE composer.render()
- **Action:** Ensure depth texture is connected in SSS pass render override

#### Fix 3: Fix Light Direction Transformation
**File:** `src/viewer/postprocessing/SSSShader.ts`
- Light direction is in world space, but shader needs screen space
- **Action:** Transform light direction to view space, then to screen space
- **Action:** Verify light direction uniform is updated from scene lights

#### Fix 4: Increase Default Intensity
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current default: `intensity: 0.5`
- **Action:** Increase to `1.0` for better visibility during testing

#### Fix 5: Add Depth Texture Debug Mode
**File:** `src/viewer/postprocessing/SSSShader.ts`
- Uncomment depth visualization code (lines 105-108)
- **Action:** Add debug uniform to toggle depth visualization

---

## 3. SCREEN SPACE REFLECTIONS (SSR) - Fixes

### Key Findings from Perplexity:
- Requires both depth texture (tDepth) and normal texture (tNormal)
- Depth and normal prepasses must render before SSR
- Camera matrices must be updated before SSR renders
- Normal texture encoding/decoding must be correct

### Current Implementation Status:
✅ Depth prepass exists
✅ Normal prepass exists (NormalRenderPass)
✅ Camera matrices are updated
✅ Normal decoding is implemented (encoded: 0-1, decoded: -1 to 1)
⚠️ Texture connection timing may be off
⚠️ Ray marching may need adjustment

### Recommended Fixes:

#### Fix 1: Verify Normal Texture Format
**File:** `src/viewer/pathTracer/NormalRenderPass.ts`
- NormalRenderPass writes normals to color texture (RGB channels)
- Normals are encoded as: `normal * 0.5 + 0.5` (maps -1 to 1 → 0 to 1)
- SSR shader decodes as: `(normal - 0.5) * 2.0`
- **Action:** Verify encoding/decoding matches between NormalRenderPass and SSRShader

#### Fix 2: Ensure Both Prepasses Render Before SSR
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current: Both prepasses render in `render()` method
- **Action:** Verify both render BEFORE composer.render()
- **Action:** Ensure textures are connected in SSR pass render override

#### Fix 3: Verify Camera Matrices
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current: Camera matrices are updated in `render()` method
- **Action:** Verify `cameraProjectionMatrix`, `cameraProjectionMatrixInverse`, `cameraViewMatrixInverse` are correct
- **Action:** Add debug logging to verify matrix values

#### Fix 4: Increase Default Intensity
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current default: `intensity: 1.0`
- **Action:** Verify this is sufficient, increase if needed

#### Fix 5: Add Debug Visualization
**File:** `src/viewer/postprocessing/SSRShader.ts`
- Add ability to visualize depth and normal textures separately
- **Action:** Add debug uniforms for depth/normal visualization

---

## 4. EMISSIVE BLOOM - Integration

### Current Implementation Status:
✅ UnrealBloomPass exists
✅ Infrastructure is in place
⚠️ Needs UI controls integration
⚠️ Needs state management

### Recommended Fixes:

#### Fix 1: Add UI Controls
**File:** `src/components/RenderingEffectsPanel.tsx`
- Add bloom controls (strength, radius, threshold)
- **Action:** Add sliders for bloom parameters
- **Action:** Connect to PostProcessingSystem config

#### Fix 2: Verify Bloom Pass Integration
**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`
- Current: Bloom pass is added in `initialize()`
- **Action:** Verify bloom is properly integrated in pass chain
- **Action:** Ensure bloom parameters are updateable

---

## Implementation Priority

### High Priority (Critical Fixes):
1. **AO**: Increase default intensity to 0.25
2. **SSS**: Verify depth texture connection and add debug mode
3. **SSR**: Verify normal texture encoding/decoding

### Medium Priority:
4. **AO**: Add material normal validation
5. **SSS**: Fix light direction transformation
6. **SSR**: Add debug visualization modes

### Low Priority:
7. **Bloom**: Add UI controls
8. **All**: Add comprehensive debug modes

---

## Testing Checklist

### AO Testing:
- [ ] Enable AO with intensity 0.25 - should see darkening in crevices
- [ ] Test output mode 2 (SAO Only) - should show grayscale AO
- [ ] Verify no black objects appear (intensity * scale < 0.08)
- [ ] Test with different geometries (boxes, spheres, complex models)

### SSS Testing:
- [ ] Enable SSS - should see screen-space shadows
- [ ] Enable depth debug mode - should see depth visualization
- [ ] Adjust light direction - shadows should move
- [ ] Increase intensity to 1.0 - shadows should be more visible

### SSR Testing:
- [ ] Enable SSR - should see reflections on surfaces
- [ ] Test with reflective materials (metal, glass)
- [ ] Adjust intensity and fade distance
- [ ] Verify reflections appear on correct surfaces

### Bloom Testing:
- [ ] Enable bloom - should see glow around bright objects
- [ ] Adjust strength, radius, threshold
- [ ] Test with emissive materials

---

## Next Steps

1. **Start with AO fixes** - simplest to verify
2. **Then SSS fixes** - requires depth texture verification
3. **Then SSR fixes** - requires both depth and normal textures
4. **Finally Bloom UI** - needs UI integration

Each fix should be tested individually before moving to the next.













