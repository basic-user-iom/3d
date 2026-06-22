# Three.js SAOPass Black Screen Issue - Complete Summary for Perplexity

## Problem
When enabling Ambient Occlusion (AO) using Three.js SAOPass in an EffectComposer pipeline, the entire 3D model renders as a black silhouette, even with very conservative parameters (intensity: 0.05, scale: 0.5).

## Environment
- Three.js version: 0.162
- React + Vite application
- Using EffectComposer with RenderPass and SAOPass
- Model: Pagani Utopia 2023 (complex car model with 252 meshes)

## Current Implementation

### 1. Depth Texture Setup
```typescript
const depthTexture = new THREE.DepthTexture(composerWidth, composerHeight)
depthTexture.type = THREE.UnsignedShortType

this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  depthTexture: depthTexture,
  stencilBuffer: false
})

this.composer = new EffectComposer(this.renderer, this.composerRenderTarget)
```

### 2. RenderPass Configuration
```typescript
this.renderPass = new RenderPass(this.scene, this.camera)
this.renderPass.renderToScreen = false  // ✅ Correctly set
this.composer.addPass(this.renderPass)

// Override RenderPass render to ensure depth texture connection
const originalRenderPassRender = this.renderPass.render.bind(this.renderPass)
this.renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  
  // Connect depth texture to all buffers after RenderPass renders
  if (this.composerRenderTarget?.depthTexture && writeBuffer) {
    writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget1) composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget2) composerAny.renderTarget2.depthTexture = this.composerRenderTarget.depthTexture
  }
}
```

### 3. SAOPass Configuration
```typescript
this.aoPass = new SAOPass(this.scene, this.camera, this.composerRenderTarget.width, this.composerRenderTarget.height)

// Connect depth texture before adding pass
if (this.composerRenderTarget?.depthTexture) {
  const composerAny = this.composer as any
  if (composerAny.readBuffer) {
    composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
  if (composerAny.renderTarget1) {
    composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
  }
}

// Override SAOPass render method
const originalRender = this.aoPass.render.bind(this.aoPass)
this.aoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  // Ensure depth texture is connected before SAOPass renders
  if (this.composerRenderTarget?.depthTexture && readBuffer) {
    readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) {
      composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    }
  }
  originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
}

this.composer.addPass(this.aoPass)
```

### 4. SAOPass Parameters
```typescript
aoIntensity: 0.05  // Very conservative (was 0.08, still caused black screen)
aoScale: 0.5        // Very conservative (was 0.8, still caused black screen)
aoBias: 0.5
aoKernelRadius: 50
aoMinResolution: 0
aoBlur: true
aoBlurRadius: 8
aoBlurStdDev: 4.0
aoBlurDepthCutoff: 0.01
```

## Console Logs (When AO Enabled)
Expected logs (from code):
- `[PostProcessingSystem] ✅ Depth texture available for SAOPass`
- `[PostProcessingSystem] ✅ Depth texture connected to composer readBuffer for SAOPass`
- `[PostProcessingSystem] ✅ SAOPass render method overridden to ensure depth texture connection`
- `[PostProcessingSystem] ✅ AO pass added successfully`

## Attempted Fixes
1. ✅ Created DepthTexture and attached to render target
2. ✅ Connected depth texture to readBuffer and renderTarget1
3. ✅ Overrode RenderPass render to ensure depth texture connection
4. ✅ Overrode SAOPass render to ensure depth texture connection
5. ✅ Reduced intensity and scale to very conservative values
6. ✅ Verified RenderPass has `renderToScreen = false`

## Issue Persists
Despite all fixes, the black screen issue persists. The entire model renders as a black silhouette when AO is enabled.

## Questions for Perplexity
1. How does SAOPass actually read depth from readBuffer? Does it use `readBuffer.depthTexture` directly?
2. Does SAOPass need the depth texture to be written by RenderPass, or can it use a pre-created depth texture?
3. Are there any Three.js version compatibility issues with SAOPass and depth textures?
4. Could the issue be related to how SAOPass generates normals internally?
5. Should SAOPass be reading from RenderPass output directly, or from a separate depth texture?
6. Are there any known issues with SAOPass causing black screens in certain scenarios?












