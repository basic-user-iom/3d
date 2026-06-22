# Post-Processing Shadow and Color Issues - Perplexity Analysis Request

## Critical Issues

### 1. Shadows Do Not Work Correctly in Post-Processing
- Shadows appear soft and indistinct when post-processing is enabled
- Traditional shadow maps (from DirectionalLight) may not be visible
- Shadow maps may be disabled during RenderPass rendering

### 2. Colors Look Washed Out in Post-Processing
- Colors appear desaturated and muted
- Likely caused by double tone mapping or incorrect color space handling
- Tone mapping may be applied multiple times

---

## Current Implementation Analysis

### Shadow Handling

**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`

**Current Code (lines 377-464)**:
```typescript
render() {
  // CRITICAL: Preserve shadow map settings during post-processing render
  const shadowMapEnabled = this.renderer.shadowMap.enabled
  const shadowMapType = this.renderer.shadowMap.type
  const shadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
  
  // FIX: Ensure shadow maps are enabled before RenderPass renders
  if (!this.renderer.shadowMap.enabled) {
    console.warn('[PostProcessingSystem] ⚠️ Shadow maps are disabled! Enabling for post-processing render.')
    this.renderer.shadowMap.enabled = true
  }
  
  // ... render prepasses and composer ...
  
  if (this.composer && this.config.enabled) {
    this.composer.render()
  } else {
    this.renderer.render(this.scene, this.camera)
  }
  
  // CRITICAL: Restore shadow map settings after render
  this.renderer.shadowMap.enabled = shadowMapEnabled
  this.renderer.shadowMap.type = shadowMapType
  this.renderer.shadowMap.autoUpdate = shadowMapAutoUpdate
}
```

**Issue**: RenderPass may not preserve shadow maps when rendering to texture. Shadow maps need to be explicitly enabled and the depth buffer needs to be preserved.

### Color Space and Tone Mapping

**File**: `src/viewer/ViewerCanvas.tsx`

**Initial Renderer Setup (lines 359-365)**:
```typescript
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1
```

**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`

**Post-Processing Setup (lines 131-145)**:
```typescript
private initialize() {
  // Disable renderer tone mapping
  this.renderer.toneMapping = THREE.NoToneMapping
  this.renderer.toneMappingExposure = 1.0
  
  // FIX: Set output color space to LinearSRGB for post-processing pipeline
  if ('outputColorSpace' in this.renderer) {
    (this.renderer as any).outputColorSpace = THREE.LinearSRGBColorSpace
  }
  
  this.composer = new EffectComposer(this.renderer)
  this.renderPass = new RenderPass(this.scene, this.camera)
  // ...
}
```

**Issue**: There's a conflict - ViewerCanvas sets `SRGBColorSpace` but PostProcessingSystem sets `LinearSRGBColorSpace`. This may cause color space issues.

### Tone Mapping Shader

**File**: `src/viewer/postprocessing/ToneMappingShader.ts`

**Current Code (lines 84-108)**:
```typescript
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;

  // Apply tone mapping based on type
  if (toneMappingType == 0) { // LINEAR
    color = linearMapping(color);
  } else if (toneMappingType == 1) { // REINHARD
    color = reinhardMapping(color);
  } else if (toneMappingType == 2) { // CINEON
    color = cineonMapping(color);
  } else if (toneMappingType == 3) { // ACES_FILMIC
    color = acesFilmicMapping(color);
  } else if (toneMappingType == 4) { // UNCHARTED2
    color = uncharted2Mapping(color);
  } else {
    color = acesFilmicMapping(color);
  }

  // FIX: Do NOT apply gamma correction here - OutputPass will handle it
  // color = pow(color, vec3(1.0 / 2.2)); // REMOVED - causes double gamma

  gl_FragColor = vec4(color, texel.a);
}
```

**Issue**: Previously applied gamma correction here, which combined with OutputPass caused double gamma correction = washed out colors.

### OutputPass Configuration

**File**: `src/viewer/postprocessing/PostProcessingSystem.ts`

**Current Code (lines 307-330)**:
```typescript
this.outputPass = new OutputPass()

// FIX: Disable tone mapping in OutputPass
if (this.outputPass.uniforms && 'toneMappingExposure' in this.outputPass.uniforms) {
  (this.outputPass.uniforms as any).toneMappingExposure.value = 1.0
}

// FIX: OutputPass should convert from linear to sRGB (gamma correction)
if ('toneMapping' in this.outputPass) {
  (this.outputPass as any).toneMapping = THREE.NoToneMapping
}

this.renderer.toneMapping = THREE.NoToneMapping
this.renderer.toneMappingExposure = 1.0

this.outputPass.renderToScreen = true
this.composer.addPass(this.outputPass)
```

**Issue**: Need to ensure OutputPass only does sRGB conversion, not tone mapping.

### Pass Order

**Current Order** (WRONG):
Render → AO → SSS → SSR → Bloom → Anamorphic → **LUT** → **ToneMapping** → ColorGrading → Output

**Correct Order** (FIXED):
Render → AO → SSS → SSR → Bloom → Anamorphic → **ToneMapping** → **LUT** → ColorGrading → Output

**Reason**: Tone mapping converts HDR→LDR, LUT should be applied to LDR colors.

---

## Three.js Examples Reference

### 1. Screen Space Shadows (SSS)
**URL**: https://threejs.org/examples/#webgpu_postprocessing_sss
- Shows how to implement screen space shadows
- Uses depth texture for shadow calculation
- Light direction conversion

### 2. Screen Space Reflections (SSR)
**URL**: https://threejs.org/examples/#webgl_postprocessing_ssr
- Shows SSR implementation
- Uses depth and normal textures
- Camera matrices handling

### 3. Ambient Occlusion (AO)
**URL**: https://threejs.org/examples/#webgl_postprocessing_material_ao
- Shows SAOPass usage
- Output mode handling
- Parameter application

### 4. Tone Mapping
**URL**: https://threejs.org/examples/#webgl_tonemapping
- Shows correct tone mapping implementation
- Color space handling
- Exposure control

---

## Questions for Perplexity

1. **Shadows**: How do Three.js examples ensure shadow maps are preserved in RenderPass? Should we use a custom render target with depth buffer?

2. **Color Space**: What is the correct color space setup for post-processing? Should we use LinearSRGBColorSpace or SRGBColorSpace?

3. **Tone Mapping**: How do Three.js examples prevent double tone mapping? Should OutputPass handle sRGB conversion or should we do it manually?

4. **Pass Order**: What is the correct order for tone mapping, LUT, and color grading in Three.js post-processing?

5. **Gamma Correction**: Where should gamma correction be applied - in ToneMappingShader, OutputPass, or both?

---

## Complete Code Files

### File 1: PostProcessingSystem.ts (Main System)
- Shadow map handling (lines 377-464)
- Color space setup (lines 131-145)
- Pass order management (lines 259-330, 972-1322)
- OutputPass configuration (lines 307-330)

### File 2: ToneMappingShader.ts
- Tone mapping algorithms (lines 30-82)
- Gamma correction (line 105 - REMOVED)

### File 3: ColorGradingShader.ts
- Color adjustments (lines 84-190)
- Gamma correction (line 161 - artistic, not color space)

### File 4: ViewerCanvas.tsx
- Renderer initialization (lines 359-365)
- Color space and tone mapping setup

---

## Fixes Already Applied

1. ✅ Removed gamma correction from ToneMappingShader
2. ✅ Set LinearSRGBColorSpace for post-processing
3. ✅ Fixed pass order (ToneMapping before LUT)
4. ✅ Disabled tone mapping in OutputPass
5. ✅ Added shadow map enable check

---

## Additional Fixes Needed (From Perplexity)

Please analyze the Three.js examples and provide:
1. Correct shadow map preservation in RenderPass
2. Correct color space configuration
3. Verification of pass order
4. Any additional fixes for shadow and color issues


























