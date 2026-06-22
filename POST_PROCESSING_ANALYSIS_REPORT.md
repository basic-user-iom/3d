# Post-Processing Effects Analysis Report
## AO, SSS, SSR, and Bloom Issues

**Generated:** 2025-01-27  
**Purpose:** Comprehensive analysis of post-processing effects issues for Perplexity AI assistance

---

## Executive Summary

Four post-processing effects have reported issues:
1. **Ambient Occlusion (AO)** - Effect not visible despite pass creation
2. **Screen Space Shadows (SSS)** - No visual changes occur
3. **Screen Space Reflections (SSR)** - No visual changes occur  
4. **Emissive Bloom** - Infrastructure exists but needs UI integration

All effects use Three.js `EffectComposer` with custom shader passes. AO uses `SAOPass`, while SSS/SSR use custom `ShaderPass` implementations.

---

## 1. Ambient Occlusion (AO) - Not Visible

### Problem
AO pass is created successfully, parameters are set correctly, but the effect is not visible on the model.

### Current Implementation

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**Initialization (lines 145-194):**
```typescript
if (this.config.ao?.enabled && this.scene && this.camera) {
  // Get dimensions with fallbacks
  let width = this.renderer.domElement.width
  let height = this.renderer.domElement.height
  if (width === 0 || height === 0) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    width = rect.width || window.innerWidth
    height = rect.height || window.innerHeight
  }
  if (width === 0 || height === 0) {
    width = 1920
    height = 1080
  }
  
  this.composer.setSize(width, height)
  this.aoPass = new (SAOPass as any)(this.scene, this.camera, width, height)
  this.updateAOParameters()
  this.aoPass.setSize(width, height)
  this.aoPass.renderToScreen = false
  this.composer.addPass(this.aoPass)
}
```

**Parameter Update (lines 593-796):**
```typescript
private updateAOParameters() {
  if (!this.aoPass || !this.config.ao) return
  
  const ao = this.config.ao
  const SAOPassOutput = (SAOPass as any).OUTPUT || {
    Default: 0,
    SAO: 1,
    Normal: 2
  }
  
  // Map UI output to SAOPass OUTPUT constant
  let saoOutput = SAOPassOutput.Default
  if (validOutput === 0) saoOutput = SAOPassOutput.Default // Beauty
  else if (validOutput === 2) saoOutput = SAOPassOutput.SAO // SAO Only
  else if (validOutput === 4) saoOutput = SAOPassOutput.Normal // Normal
  
  const passAny = this.aoPass as any
  const params = passAny.params
  
  if (params) {
    if ('output' in params) params.output = saoOutput
    if ('saoIntensity' in params) params.saoIntensity = clampedIntensity
    if ('saoScale' in params) params.saoScale = clampedScale
    if ('saoBias' in params) params.saoBias = clampedBias
    // ... other parameters
  }
  
  // Also try setting output directly
  if ('output' in passAny) {
    passAny.output = saoOutput
  }
}
```

### Issues Identified

1. **Output Mode Mapping**: UI uses 0-4, but SAOPass.OUTPUT only has 0, 1, 2. Mapping may be incorrect.
2. **Pass Order**: AO is added after RenderPass, but may need to be in correct position in chain.
3. **Parameter Application**: Parameters are set in `params` object, but SAOPass may need direct property access.
4. **Render Target**: SAOPass creates internal render targets - may not be properly connected to composer.

### Test Scenarios Needed

1. Test with `output = 2` (SAO Only) to see if AO is rendering but not blending correctly
2. Verify SAOPass is actually rendering (check render targets)
3. Check if AO output is being overwritten by later passes
4. Verify scene has geometry with proper normals for AO calculation

---

## 2. Screen Space Shadows (SSS) - No Visual Changes

### Problem
SSS pass is created and parameters are set, but no visual changes occur. SSS requires depth texture.

### Current Implementation

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**Initialization (lines 1112-1206):**
```typescript
if (shouldHaveSSS && !hasSSS) {
  this.sssPass = new ShaderPass(SSSShader)
  this.sssPass.renderToScreen = false
  
  // Override render method to ensure textures are connected
  const originalRender = this.sssPass.render.bind(this.sssPass)
  this.sssPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const uniforms = this.sssPass!.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
    }
    if (readBuffer && readBuffer.texture) {
      uniforms.tDiffuse.value = readBuffer.texture
    }
    originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  }
  
  // Ensure depth prepass exists
  if (!this.depthRenderPass && this.camera) {
    this.depthRenderPass = new DepthRenderPass(this.camera)
    this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    })
  }
  
  this.updateSSSParameters()
  // Insert after AO or render pass
  this.composer.passes.splice(insertIndex, 0, this.sssPass)
}
```

**Depth Prepass Rendering (lines 386-430):**
```typescript
if (this.config.enabled && (this.config.sss?.enabled || this.config.ssr?.enabled)) {
  if (this.depthRenderPass && this.depthRenderTarget) {
    // Update render target size
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    if (this.depthRenderTarget.width !== width || this.depthRenderTarget.height !== height) {
      this.depthRenderTarget.setSize(width, height)
    }
    // Render depth prepass - writes depth to color texture (red channel)
    this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
  }
  
  // Update SSS parameters AFTER rendering prepass
  if (this.sssPass && this.config.sss?.enabled) {
    const uniforms = this.sssPass.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
      this.depthRenderTarget.texture.needsUpdate = true
    }
    if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
      uniforms.tDiffuse.value = this.composer.readBuffer.texture
    }
    this.updateSSSParameters()
  }
}
```

**SSS Shader (src/viewer/postprocessing/SSSShader.ts):**
```typescript
export const SSSShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    lightDirection: { value: new THREE.Vector3(0, -1, 0) },
    intensity: { value: 0.5 },
    maxRadius: { value: 5.0 },
    samples: { value: 8 },
    rayDistance: { value: 50.0 },
    thickness: { value: 0.02 },
    bias: { value: 0.01 }
  },
  // ... shader code
}
```

**Depth Render Pass (src/viewer/pathTracer/DepthRenderPass.ts):**
```typescript
export class DepthRenderPass {
  private depthMaterial: THREE.ShaderMaterial
  
  constructor(camera: THREE.Camera) {
    this.depthMaterial = new THREE.ShaderMaterial({
      fragmentShader: `
        precision highp float;
        varying vec4 vViewPosition;
        void main() {
          float depth = gl_FragCoord.z; // 0 to 1
          gl_FragColor = vec4(depth, 0.0, 0.0, 1.0); // Pack in red channel
        }
      `
    })
  }
  
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
    // Replace materials, render, restore materials
  }
}
```

### Issues Identified

1. **Depth Texture Format**: Depth is packed in red channel, but shader reads it as `texture2D(tDepth, coord).x` - may need unpacking
2. **Light Direction**: Light direction is in world space, but shader may need screen space conversion
3. **Depth Reading**: `readDepth()` function converts NDC to linear depth, but may have precision issues
4. **Texture Connection Timing**: Depth texture may not be available when SSS pass renders

### Test Scenarios Needed

1. Enable debug mode: `sssPass.uniforms.debugMode.value = 1.0` to visualize depth
2. Verify depth texture has valid data (check render target)
3. Test with different light directions
4. Check if shadow calculation is working but intensity is too low

---

## 3. Screen Space Reflections (SSR) - No Visual Changes

### Problem
SSR pass is created and parameters are set, but no visual changes occur. SSR requires depth and normal textures.

### Current Implementation

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**Initialization (lines 1208-1237):**
```typescript
if (shouldHaveSSR && !hasSSR) {
  this.ssrPass = new ShaderPass(SSRShader)
  this.updateSSRParameters()
  // Insert after SSS or AO
  this.composer.passes.splice(insertIndex, 0, this.ssrPass)
}
```

**Normal Prepass Rendering (lines 400-409):**
```typescript
if (this.normalRenderPass && this.normalRenderTarget) {
  const width = this.renderer.domElement.width || 1
  const height = this.renderer.domElement.height || 1
  if (this.normalRenderTarget.width !== width || this.normalRenderTarget.height !== height) {
    this.normalRenderTarget.setSize(width, height)
  }
  // Render normal prepass
  this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
}

if (this.ssrPass && this.config.ssr?.enabled) {
  this.updateSSRParameters()
}
```

**SSR Shader (src/viewer/postprocessing/SSRShader.ts):**
```typescript
export const SSRShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
    cameraViewMatrixInverse: { value: new THREE.Matrix4() },
    thickness: { value: 0.01 },
    maxDistance: { value: 100.0 },
    maxSteps: { value: 20 },
    maxBinarySearchSteps: { value: 8 },
    intensity: { value: 1.0 },
    roughnessFade: { value: 1.0 },
    fadeDistance: { value: 10.0 },
    fadeMargin: { value: 0.05 }
  },
  // ... shader code with ray marching and binary search
}
```

**Normal Render Pass (src/viewer/pathTracer/NormalRenderPass.ts):**
```typescript
export class NormalRenderPass {
  private normalMaterial: THREE.ShaderMaterial
  
  constructor() {
    this.normalMaterial = new THREE.ShaderMaterial({
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        void main() {
          vec3 normal = normalize(vNormal);
          gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); // Encode in RGB
        }
      `
    })
  }
}
```

### Issues Identified

1. **Normal Texture**: Normal prepass renders view-space normals, but SSR shader may need world-space or screen-space normals
2. **Camera Matrices**: `cameraProjectionMatrixInverse` and `cameraViewMatrixInverse` may not be updated
3. **Resolution Uniform**: `resolution` uniform may not match actual render size
4. **Texture Connection**: Both depth and normal textures must be connected before SSR pass renders

### Test Scenarios Needed

1. Verify normal texture has valid data (should show colored normals)
2. Check if camera matrices are being updated
3. Test with reflective materials (metallic surfaces)
4. Verify ray marching is finding intersections

---

## 4. Emissive Bloom - Needs UI Integration

### Problem
Infrastructure exists (UnrealBloomPass), but needs full integration with UI controls and state management.

### Current Implementation

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**Initialization (lines 229-241):**
```typescript
if (this.config.bloom?.enabled) {
  const resolution = new THREE.Vector2(
    this.renderer.domElement.width,
    this.renderer.domElement.height
  )
  this.bloomPass = new UnrealBloomPass(
    resolution,
    this.config.bloom.strength,
    this.config.bloom.radius,
    this.config.bloom.threshold
  )
  this.composer.addPass(this.bloomPass)
}
```

**Update Config (lines 856-891):**
```typescript
if (this.composer && this.config.bloom) {
  const shouldHaveBloom = this.config.enabled && this.config.bloom.enabled
  const hasBloom = this.bloomPass !== null
  
  if (shouldHaveBloom && !hasBloom) {
    this.bloomPass = new UnrealBloomPass(resolution, strength, radius, threshold)
    const outputPassIndex = this.composer.passes.length - 1
    this.composer.passes.splice(outputPassIndex, 0, this.bloomPass)
  } else if (!shouldHaveBloom && hasBloom) {
    // Remove bloom pass
    this.bloomPass.dispose()
    this.bloomPass = null
  } else if (hasBloom && this.bloomPass && this.config.bloom) {
    // Update parameters
    this.bloomPass.strength = this.config.bloom.strength
    this.bloomPass.radius = this.config.bloom.radius
    this.bloomPass.threshold = this.config.bloom.threshold
  }
}
```

**UI State (src/components/RenderingQualityPanel.tsx):**
```typescript
bloomEnabled,
bloomStrength,
bloomRadius,
bloomThreshold,
setBloomEnabled,
setBloomStrength,
setBloomRadius,
setBloomThreshold,
```

### Issues Identified

1. **Emissive Materials**: Bloom works on bright pixels, but emissive materials may not be bright enough
2. **Threshold**: Default threshold may be too high, filtering out emissive materials
3. **UI Integration**: Controls exist but may not be properly connected to post-processing system
4. **Material Emissive Property**: Materials need `emissive` color set to high values for bloom to work

### Test Scenarios Needed

1. Create test scene with emissive materials (emissive color > threshold)
2. Lower bloom threshold to see if it picks up emissive materials
3. Verify UI controls update bloom parameters in real-time
4. Test with different emissive intensities

---

## Common Issues Across All Effects

### 1. Pass Order
Effects must be in correct order: Render → AO → SSS → SSR → Bloom → Anamorphic → LUT → ToneMapping → ColorGrading → Output

### 2. Render Target Sizing
All render targets must match canvas size. Current code updates sizes, but may have timing issues.

### 3. Texture Connection
Depth/normal textures must be connected before passes that need them render.

### 4. Parameter Updates
Parameters are updated in `updateConfig()`, but may not be applied if passes are created before config is set.

---

## Files Involved

1. **src/viewer/postprocessing/PostProcessingSystem.ts** - Main post-processing system
2. **src/viewer/postprocessing/SSSShader.ts** - Screen Space Shadows shader
3. **src/viewer/postprocessing/SSRShader.ts** - Screen Space Reflections shader
4. **src/viewer/pathTracer/DepthRenderPass.ts** - Depth prepass
5. **src/viewer/pathTracer/NormalRenderPass.ts** - Normal prepass
6. **src/components/RenderingQualityPanel.tsx** - UI controls
7. **src/store/useAppStore.ts** - State management

---

## Recommended Fixes (For Perplexity Analysis)

1. **AO**: Verify SAOPass.OUTPUT constants, check pass order, test with output=2 (SAO Only mode)
2. **SSS**: Verify depth texture format, check light direction conversion, enable debug mode
3. **SSR**: Verify normal texture format, update camera matrices, check resolution uniform
4. **Bloom**: Lower threshold, verify emissive materials, check UI connection

---

## Complete Code Files for Perplexity

### File 1: PostProcessingSystem.ts (Main System)
**Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`
**Key Methods:**
- `initialize()` - Sets up EffectComposer and all passes
- `render()` - Renders depth/normal prepasses and composer
- `updateAOParameters()` - Updates AO pass parameters (lines 593-796)
- `updateSSSParameters()` - Updates SSS pass parameters (lines 480-591)
- `updateSSRParameters()` - Updates SSR pass parameters (lines 1420-1478)
- `updateConfig()` - Handles dynamic pass addition/removal (lines 798-1294)

### File 2: SSSShader.ts (Screen Space Shadows Shader)
**Location:** `src/viewer/postprocessing/SSSShader.ts`
**Key Features:**
- Depth texture reading (`readDepth()` function)
- Ray marching in screen space
- Light direction conversion
- Shadow calculation and application

### File 3: SSRShader.ts (Screen Space Reflections Shader)
**Location:** `src/viewer/postprocessing/SSRShader.ts`
**Key Features:**
- Depth and normal texture reading
- View position reconstruction
- Ray marching with binary search
- Reflection color blending

### File 4: DepthRenderPass.ts (Depth Prepass)
**Location:** `src/viewer/pathTracer/DepthRenderPass.ts`
**Key Features:**
- Renders depth to red channel of RGBA texture
- Uses `gl_FragCoord.z` for depth
- Material replacement system

### File 5: NormalRenderPass.ts (Normal Prepass)
**Location:** `src/viewer/pathTracer/NormalRenderPass.ts`
**Key Features:**
- Renders view-space normals to RGB channels
- Encodes normals as `normal * 0.5 + 0.5`
- Material replacement system

### File 6: RenderingQualityPanel.tsx (UI Controls)
**Location:** `src/components/RenderingQualityPanel.tsx`
**Key Features:**
- UI controls for AO, SSS, SSR, Bloom
- State management via Zustand store
- Real-time parameter updates

---

## Test Commands

```javascript
// In browser console:
const postProcessingSystem = window.__postProcessingSystem

// Test AO
postProcessingSystem.aoPass.params.output = 2 // SAO Only mode
postProcessingSystem.aoPass.params.saoIntensity = 2.0

// Test SSS
postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0 // Visualize depth
postProcessingSystem.sssPass.uniforms.intensity.value = 1.0

// Test SSR
postProcessingSystem.ssrPass.uniforms.intensity.value = 1.0
postProcessingSystem.ssrPass.uniforms.maxDistance.value = 100.0

// Test Bloom
postProcessingSystem.bloomPass.threshold = 0.1 // Lower threshold
postProcessingSystem.bloomPass.strength = 2.0
```


























