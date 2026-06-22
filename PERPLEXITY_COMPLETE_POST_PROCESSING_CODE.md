# Complete Post-Processing Code for Perplexity Analysis

## Overview
This document contains the complete post-processing implementation for analysis. The system handles:
- Ambient Occlusion (AO)
- Screen Space Shadows (SSS)
- Screen Space Reflections (SSR)
- Bloom
- Tone Mapping
- Color Grading
- LUT (Look-Up Table)
- Anamorphic Lens Flares

---

## Critical Issues to Analyze

### 1. Shadow Maps Not Working
- Shadows disappear or appear incorrect when post-processing is enabled
- Need to verify depth buffer preservation
- Check RenderPass shadow handling

### 2. Colors Washed Out
- Colors appear desaturated
- Potential double tone mapping
- Potential double gamma correction
- Color space issues

### 3. Pass Order
- Verify correct order of passes
- Ensure dependencies are met

### 4. Performance
- Check for unnecessary texture updates
- Verify render target management
- Check for memory leaks

---

## Complete Code Files

### File 1: PostProcessingSystem.ts (1626 lines)

**Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`

**Complete Code**: [See file: src/viewer/postprocessing/PostProcessingSystem.ts]

**Key Components:**
- EffectComposer with custom render target (depth buffer enabled)
- RenderPass for base scene rendering
- SAOPass for Ambient Occlusion
- Custom SSS and SSR shader passes
- UnrealBloomPass for bloom
- Custom ToneMapping, ColorGrading, LUT, Anamorphic passes
- OutputPass for final sRGB conversion

**Key Methods:**
- `initialize()` (lines 132-352): Sets up all passes
- `render()` (lines 427-521): Main render loop
- `updateConfig()` (lines 897-1418): Dynamic pass management
- `updateSSSParameters()` (lines 560-671): SSS uniform updates
- `updateSSRParameters()` (lines 1549-1625): SSR uniform updates
- `updateAOParameters()` (lines 673-895): AO parameter updates
- `updateToneMappingParameters()` (lines 1478-1506): Tone mapping updates
- `updateColorGradingParameters()` (lines 1420-1476): Color grading updates
- `setSize()` (lines 523-558): Resize handling
- `dispose()` (lines 1508-1547): Resource cleanup

**Critical Code Sections:**

1. **Initialization (lines 132-352)**:
   - Creates render target with depth buffer
   - Sets up color space (LinearSRGBColorSpace)
   - Initializes all passes in correct order
   - Validates pass order

2. **Render Method (lines 427-521)**:
   - Preserves shadow map state
   - Renders depth/normal prepasses
   - Updates SSS/SSR parameters
   - Renders EffectComposer

3. **Update Methods**:
   - `updateSSSParameters()` (lines 560-671)
   - `updateSSRParameters()` (lines 1549-1625)
   - `updateAOParameters()` (lines 673-895)
   - `updateToneMappingParameters()` (lines 1478-1506)
   - `updateColorGradingParameters()` (lines 1420-1476)

4. **Config Updates (lines 897-1418)**:
   - Dynamically adds/removes passes
   - Updates parameters
   - Handles pass ordering

### File 2: ToneMappingShader.ts (126 lines)

**Location**: `src/viewer/postprocessing/ToneMappingShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/ToneMappingShader.ts]

**Features:**
- 5 tone mapping algorithms (Linear, Reinhard, Cineon, ACES Filmic, Uncharted 2)
- Exposure control
- NO gamma correction (removed to prevent double gamma - line 105)

### File 3: ColorGradingShader.ts (195 lines)

**Location**: `src/viewer/postprocessing/ColorGradingShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/ColorGradingShader.ts]

**Features:**
- Full color grading controls (exposure, contrast, highlights, shadows, whites, blacks, hue, saturation, vibrance, gamma)
- Artistic gamma (not color space conversion - line 161)
- HSV color space manipulation

### File 4: SSSShader.ts (149 lines)

**Location**: `src/viewer/postprocessing/SSSShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/SSSShader.ts]

**Features:**
- Screen-space shadow tracing
- Ray marching with depth comparison (lines 61-97)
- Light direction in world space (converted to screen space - lines 113-135)
- **BUG**: Intensity applied twice (lines 96, 142)

### File 5: SSRShader.ts (197 lines)

**Location**: `src/viewer/postprocessing/SSRShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/SSRShader.ts]

**Features:**
- Screen-space reflection tracing
- Uses depth and normal textures
- Binary search for intersection (lines 92-115)
- Ray marching (lines 117-149)
- View position reconstruction (lines 68-73)

### File 6: LUTShader.ts (52 lines)

**Location**: `src/viewer/postprocessing/LUTShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/LUTShader.ts]

**Features:**
- 3D LUT sampling (lines 25-38)
- Intensity blending (line 45)

### File 7: AnamorphicShader.ts (71 lines)

**Location**: `src/viewer/postprocessing/AnamorphicShader.ts`

**Complete Code**: [See file: src/viewer/postprocessing/AnamorphicShader.ts]

**Features:**
- Horizontal streak effect (lines 35-61)
- Brightness threshold (line 33)

### File 8: DepthRenderPass.ts (106 lines)

**Location**: `src/viewer/pathTracer/DepthRenderPass.ts`

**Complete Code**: [See file: src/viewer/pathTracer/DepthRenderPass.ts]

**Features:**
- Renders depth to color texture (red channel - line 31)
- Temporarily replaces materials (lines 42-56)
- Uses WeakMap to store original materials (line 45)

### File 9: NormalRenderPass.ts (104 lines)

**Location**: `src/viewer/pathTracer/NormalRenderPass.ts`

**Complete Code**: [See file: src/viewer/pathTracer/NormalRenderPass.ts]

**Features:**
- Renders normals to color texture (RGB channels - line 30)
- Encodes normals as 0-1 range (normal * 0.5 + 0.5 - line 30)
- Temporarily replaces materials (lines 42-55)

---

## Potential Bugs Found

### Bug 1: Shadow Intensity Applied Twice
**Location**: `SSSShader.ts:96, 142`
**Issue**: Shadow intensity multiplied in `traceShadow()` and again in `main()`
**Impact**: Shadows appear darker than intended
**Fix**: Remove one multiplication

### Bug 2: SSR Normal Texture Logging Every Frame
**Location**: `PostProcessingSystem.ts:1621`
**Issue**: `console.log` called every frame for normal texture
**Impact**: Console spam, performance hit
**Fix**: Remove or throttle logging

### Bug 3: Camera Matrices May Be Stale
**Location**: `PostProcessingSystem.ts:1568-1583`
**Issue**: Camera matrices updated in `updateSSRParameters()` but may be called before camera moves
**Impact**: Reflections may be incorrect
**Fix**: Update matrices in `render()` method before SSR pass

### Bug 4: Depth Prepass Rendered Even When Not Needed
**Location**: `PostProcessingSystem.ts:452-473`
**Issue**: Depth/normal prepasses rendered every frame even if SSS/SSR disabled
**Impact**: Unnecessary rendering overhead
**Fix**: Only render if SSS or SSR enabled

### Bug 5: Material Replacement Not Thread-Safe
**Location**: `DepthRenderPass.ts:42-56`, `NormalRenderPass.ts:42-55`
**Issue**: Material replacement may conflict if called concurrently
**Impact**: Visual artifacts or crashes
**Fix**: Add locking or ensure single-threaded access

### Bug 6: Pass Order Validation May Remove Passes
**Location**: `PostProcessingSystem.ts:376-425`
**Issue**: `validatePassOrder()` may incorrectly remove passes when reordering
**Impact**: Passes may disappear
**Fix**: Only reorder, don't remove passes

### Bug 7: Render Target Size Mismatch
**Location**: `PostProcessingSystem.ts:152-161`
**Issue**: Custom render target may not match composer's internal target
**Impact**: Rendering issues or artifacts
**Fix**: Let composer create its own target or ensure sizes match

### Bug 8: Color Grading Gamma May Conflict
**Location**: `ColorGradingShader.ts:163`
**Issue**: Gamma applied in color grading, OutputPass also applies gamma
**Impact**: Double gamma correction
**Fix**: Remove gamma from color grading or OutputPass

### Bug 9: LUT Sampling Assumes Tone Mapped Input
**Location**: `LUTShader.ts:44`
**Issue**: LUT expects tone-mapped colors but may receive HDR
**Impact**: Incorrect color grading
**Fix**: Ensure LUT comes after tone mapping (already fixed)

### Bug 10: WeakMap Not Cleared on Dispose
**Location**: `DepthRenderPass.ts:45-46`, `NormalRenderPass.ts:44-45`
**Issue**: WeakMap may hold references preventing garbage collection
**Impact**: Memory leak
**Fix**: Clear WeakMap on dispose

---

## Performance Issues

1. **Unnecessary Texture Updates**: Lines 483, 1590
   - `needsUpdate = true` set every frame
   - Should only set when texture actually changes

2. **Parameter Updates Every Frame**: Lines 501, 505
   - `updateSSSParameters()` and `updateSSRParameters()` called every frame
   - Should only update when parameters change

3. **Pass Order Validation**: Line 351
   - Called in `initialize()` but may not be needed
   - Should only validate when passes change

4. **Console Logging in Hot Path**: Multiple locations
   - Console.log calls in render loop
   - Should be removed or heavily throttled

5. **Texture Dimension Validation**: Lines 485-494, 1592-1600
   - Validation in render loop
   - Should be cached or removed

6. **Depth/Normal Prepasses**: Lines 452-473
   - Rendered every frame even if not needed
   - Should only render if SSS/SSR enabled

---

## Test Cases

### Test 1: Shadow Map Preservation
```javascript
// Test that shadows are visible with post-processing enabled
const viewer = window.viewerRef?.current
const renderer = viewer.renderer
const pp = viewer.postProcessingSystem

// Enable post-processing
pp.updateConfig({ enabled: true })

// Check shadow maps are enabled
console.assert(renderer.shadowMap.enabled === true, 'Shadow maps should be enabled')

// Check render target has depth buffer
const composer = pp.composer
const renderTarget = composer.renderTarget || (composer as any)._renderTarget
console.assert(renderTarget?.depthBuffer === true, 'Render target should have depth buffer')

// Visual check: shadows should be visible
```

### Test 2: Color Space and Tone Mapping
```javascript
// Test that colors are not washed out
const pp = viewer.postProcessingSystem

// Enable post-processing with tone mapping
pp.updateConfig({
  enabled: true,
  toneMapping: { type: 'aces-filmic', exposure: 1.0, whitePoint: 1.0 }
})

// Check color space
console.assert(renderer.outputColorSpace === THREE.LinearSRGBColorSpace, 'Should be LinearSRGBColorSpace')

// Check pass order
const passes = pp.composer.passes
const passNames = passes.map(p => p.constructor.name)
console.log('Pass order:', passNames)

// Find indices
const renderIndex = passNames.indexOf('RenderPass')
const toneMappingIndex = passes.findIndex(p => p === pp.toneMappingPass)
const lutIndex = passes.findIndex(p => p === pp.lutPass)
const colorGradingIndex = passes.findIndex(p => p === pp.colorGradingPass)
const outputIndex = passes.findIndex(p => p === pp.outputPass)

// Verify order
console.assert(toneMappingIndex > renderIndex, 'Tone mapping should come after render')
console.assert(lutIndex > toneMappingIndex, 'LUT should come after tone mapping')
console.assert(colorGradingIndex > lutIndex, 'Color grading should come after LUT')
console.assert(outputIndex === passes.length - 1, 'Output should be last')

// Visual check: colors should be vibrant, not washed out
```

### Test 3: SSS Shadow Intensity
```javascript
// Test that shadow intensity is not applied twice
const pp = viewer.postProcessingSystem
pp.updateConfig({ enabled: true, sss: { enabled: true, intensity: 0.5 } })

const sssUniforms = pp.sssPass.uniforms
console.assert(sssUniforms.intensity.value === 0.5, 'SSS intensity should be 0.5')

// Check shader code doesn't apply intensity twice
// Visual check: shadows should not be too dark
```

### Test 4: SSR Camera Matrices
```javascript
// Test that camera matrices are updated
const pp = viewer.postProcessingSystem
pp.updateConfig({ enabled: true, ssr: { enabled: true } })

// Move camera
viewer.camera.position.set(10, 10, 10)
viewer.camera.updateMatrixWorld()

// Render
pp.render()

// Check matrices are updated
const ssrUniforms = pp.ssrPass.uniforms
const projMatrix = viewer.camera.projectionMatrix.clone().invert()
const viewMatrix = viewer.camera.matrixWorldInverse.clone().invert()

// Matrices should match (within floating point precision)
const projMatch = ssrUniforms.cameraProjectionMatrixInverse.value.equals(projMatrix)
const viewMatch = ssrUniforms.cameraViewMatrixInverse.value.equals(viewMatrix)

console.assert(projMatch, 'Projection matrix should be updated')
console.assert(viewMatch, 'View matrix should be updated')
```

### Test 5: Memory Leaks
```javascript
// Test that resources are properly disposed
const pp = viewer.postProcessingSystem

// Enable all effects
pp.updateConfig({
  enabled: true,
  ao: { enabled: true },
  sss: { enabled: true },
  ssr: { enabled: true },
  bloom: { enabled: true }
})

// Get initial memory
const initialMemory = performance.memory?.usedJSHeapSize || 0

// Disable and dispose
pp.updateConfig({ enabled: false })
pp.dispose()

// Check that all resources are disposed
console.assert(pp.composer === null, 'Composer should be null')
console.assert(pp.aoPass === null, 'AO pass should be null')
console.assert(pp.sssPass === null, 'SSS pass should be null')
console.assert(pp.composerRenderTarget === null, 'Render target should be null')

// Check memory (may take time for GC)
setTimeout(() => {
  const finalMemory = performance.memory?.usedJSHeapSize || 0
  console.log('Memory change:', finalMemory - initialMemory)
  // Memory should decrease or stay similar
}, 1000)
```

### Test 6: Texture Updates
```javascript
// Test that textures are updated correctly
const pp = viewer.postProcessingSystem
pp.updateConfig({ enabled: true, sss: { enabled: true } })

// Check depth texture is connected
const sssUniforms = pp.sssPass.uniforms
console.assert(sssUniforms.tDepth.value !== null, 'Depth texture should be connected')

// Check texture dimensions
const depthTexture = sssUniforms.tDepth.value
if (depthTexture.image) {
  const img = depthTexture.image
  const width = img.width || img.naturalWidth || 0
  const height = img.height || img.naturalHeight || 0
  console.assert(width > 0 && height > 0, 'Depth texture should have valid dimensions')
  console.assert(width === renderer.domElement.width, 'Depth texture width should match renderer')
  console.assert(height === renderer.domElement.height, 'Depth texture height should match renderer')
}
```

### Test 7: Pass Order Stability
```javascript
// Test that pass order doesn't change unexpectedly
const pp = viewer.postProcessingSystem
pp.updateConfig({ enabled: true })

const initialOrder = pp.composer.passes.map(p => p.constructor.name)

// Enable/disable effects
pp.updateConfig({ ao: { enabled: true } })
pp.updateConfig({ sss: { enabled: true } })
pp.updateConfig({ ssr: { enabled: true } })
pp.updateConfig({ bloom: { enabled: true } })

const finalOrder = pp.composer.passes.map(p => p.constructor.name)

// Verify order is still correct
console.assert(finalOrder[0] === 'RenderPass', 'RenderPass should be first')
console.assert(finalOrder[finalOrder.length - 1] === 'OutputPass', 'OutputPass should be last')

// Verify tone mapping comes before LUT
const toneMappingIndex = finalOrder.findIndex((name, i) => pp.composer.passes[i] === pp.toneMappingPass)
const lutIndex = finalOrder.findIndex((name, i) => pp.composer.passes[i] === pp.lutPass)
console.assert(toneMappingIndex < lutIndex, 'Tone mapping should come before LUT')
```

---

## Questions for Perplexity

1. **Shadow Maps**: How do Three.js examples ensure shadow maps are preserved in RenderPass? Should we use a custom render target with depth buffer?

2. **Color Space**: What is the correct color space setup for post-processing? Should we use LinearSRGBColorSpace or SRGBColorSpace?

3. **Tone Mapping**: How do Three.js examples prevent double tone mapping? Should OutputPass handle sRGB conversion or should we do it manually?

4. **Pass Order**: What is the correct order for tone mapping, LUT, and color grading in Three.js post-processing?

5. **Gamma Correction**: Where should gamma correction be applied - in ToneMappingShader, OutputPass, or both?

6. **SSS Light Direction**: How should world-space light direction be converted to screen space for SSS?

7. **SSR Camera Matrices**: Should camera matrices be updated every frame or only when camera moves?

8. **Material Replacement**: Is there a better way to render depth/normals without replacing materials?

9. **Performance**: How can we optimize the post-processing pipeline for better performance?

10. **Memory Management**: Are there any memory leaks in the current implementation?

---

## Integration Points

### ViewerCanvas.tsx
- **Line 7335**: PostProcessingSystem initialized
- **Line 7349-7438**: Config updated via useEffect
- **Line 5273-5280**: Render called every frame

**Potential Issues:**
1. Config updated on every state change (may cause reinitialization)
2. No cleanup if viewer is recreated
3. Shadow map re-enabling after post-processing (line 5277-5280)

---

## Default Configuration

From `useAppStore.ts` (lines 1140-1190):
- Post-processing: disabled by default
- AO: disabled, intensity 0.8, scale 2.0
- SSS: disabled, intensity 0.5, samples 8
- SSR: disabled, intensity 1.0, maxSteps 20
- Tone mapping: ACES Filmic, exposure 1.0
- Color grading: disabled

---

## Summary

The post-processing system is complex with multiple passes and dependencies. Key issues identified:
1. Shadow map preservation needs verification
2. Color space handling may cause washed out colors
3. Pass order must be correct for proper color processing
4. Performance optimizations needed (unnecessary updates)
5. Memory management needs review (WeakMap cleanup)
6. Several bugs found in shader code and parameter updates

---

## Critical Code Snippets

### Shadow Map Preservation
```typescript
// PostProcessingSystem.ts:150-163
this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true, // CRITICAL: Enable depth buffer to preserve shadows
  stencilBuffer: false
})
this.composer = new EffectComposer(this.renderer, this.composerRenderTarget)
```

### SSS Shadow Intensity Bug
```glsl
// SSSShader.ts:96 - Intensity applied in traceShadow
return min(shadow * intensity, 1.0);

// SSSShader.ts:142 - Intensity applied again in main
float finalShadow = shadow * intensity;
color.rgb *= (1.0 - finalShadow);
```

### SSR Camera Matrices Update
```typescript
// PostProcessingSystem.ts:1568-1583
// Calculate inverse projection matrix
const projMatrix = this.camera.projectionMatrix.clone()
uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()

// Calculate inverse view matrix
const viewMatrix = this.camera.matrixWorldInverse.clone()
uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
```

### Color Space Setup
```typescript
// PostProcessingSystem.ts:143-148
if ('outputColorSpace' in this.renderer) {
  (this.renderer as any).outputColorSpace = THREE.LinearSRGBColorSpace
}
```

### Pass Order
```typescript
// PostProcessingSystem.ts:290-320
// Phase 3: Tone mapping (MUST come FIRST after geometry effects)
if (this.config.toneMapping) {
  this.toneMappingPass = new ShaderPass(ToneMappingShader)
  this.composer.addPass(this.toneMappingPass)
}

// Phase 4: LUT (comes AFTER tone mapping)
if (this.config.lut?.enabled && this.config.lut.lut) {
  this.lutPass = new ShaderPass(LUTShader)
  this.composer.addPass(this.lutPass)
}

// Phase 5: Color grading (comes after tone mapping and LUT)
if (this.config.colorGrading?.enabled) {
  this.colorGradingPass = new ShaderPass(ColorGradingShader)
  this.composer.addPass(this.colorGradingPass)
}
```

---

## Test Suite

A complete test suite is available in `POST_PROCESSING_TEST_SUITE.js`. Run in browser console:
```javascript
window.postProcessingTests.runAllTests()
```

---

## Files Reference

All code files are in the repository:
- `src/viewer/postprocessing/PostProcessingSystem.ts` (1626 lines)
- `src/viewer/postprocessing/ToneMappingShader.ts` (126 lines)
- `src/viewer/postprocessing/ColorGradingShader.ts` (195 lines)
- `src/viewer/postprocessing/SSSShader.ts` (149 lines)
- `src/viewer/postprocessing/SSRShader.ts` (197 lines)
- `src/viewer/postprocessing/LUTShader.ts` (52 lines)
- `src/viewer/postprocessing/AnamorphicShader.ts` (71 lines)
- `src/viewer/pathTracer/DepthRenderPass.ts` (106 lines)
- `src/viewer/pathTracer/NormalRenderPass.ts` (104 lines)
- `src/viewer/postprocessing/shared/CommonShaders.ts` (25 lines)

---

Please analyze the code and provide recommendations for fixes.


























