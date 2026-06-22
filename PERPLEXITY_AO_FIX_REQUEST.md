# Three.js SAOPass Black Screen - Request for Fix

## Problem Summary
When enabling Ambient Occlusion (AO) using Three.js SAOPass in an EffectComposer pipeline, the entire 3D model renders as a black silhouette, even with very conservative parameters (intensity: 0.05, scale: 0.5).

## Current Implementation Details

### 1. Render Target Setup
```typescript
const depthTexture = new THREE.DepthTexture(composerWidth, composerHeight)
depthTexture.type = THREE.UnsignedShortType

this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  depthTexture: depthTexture,  // Depth texture attached
  stencilBuffer: false
})

this.composer = new EffectComposer(this.renderer, this.composerRenderTarget)
```

### 2. RenderPass Override
```typescript
const originalRenderPassRender = this.renderPass.render.bind(this.renderPass)
this.renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  // Before rendering, ensure depth texture is on writeBuffer
  if (writeBuffer && !writeBuffer.depthTexture && this.composerRenderTarget?.depthTexture) {
    writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
  
  originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  
  // After rendering, connect depth texture to all buffers
  if (this.composerRenderTarget?.depthTexture) {
    if (writeBuffer) writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget1) composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget2) composerAny.renderTarget2.depthTexture = this.composerRenderTarget.depthTexture
  }
}
```

### 3. SAOPass Setup
```typescript
this.aoPass = new SAOPass(this.scene, this.camera, width, height)
this.aoPass.renderToScreen = false

// Override SAOPass render to ensure depth texture connection
const originalRender = this.aoPass.render.bind(this.aoPass)
this.aoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  if (this.composerRenderTarget?.depthTexture) {
    if (readBuffer) readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget1) composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
  }
  originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
}
```

### 4. Pass Order
- RenderPass (index 0) - renders scene
- SAOPass (index 1) - applies AO
- Other passes...
- OutputPass (last) - final output

## Console Logs (What We See)
```
[PostProcessingSystem] ✅ Depth texture available for SAOPass: {
  hasDepthTexture: true,
  depthTextureType: 'DepthTexture',
  depthTextureSize: {width: 2018, height: 1018}
}
[PostProcessingSystem] ✅ Depth texture connected to composer readBuffer for SAOPass
[PostProcessingSystem] ✅ SAOPass render method overridden to ensure depth texture connection
[PostProcessingSystem] ✅ AO pass added successfully
```

## What We've Verified
1. ✅ Depth texture is created and attached to render target
2. ✅ Depth texture is connected to composer.readBuffer.depthTexture
3. ✅ Depth texture is connected to composer.renderTarget1.depthTexture
4. ✅ RenderPass override connects depth texture after rendering
5. ✅ SAOPass override connects depth texture before rendering
6. ✅ SAOPass is properly sized and initialized
7. ✅ Parameters are set correctly (very low intensity: 0.05, scale: 0.5)

## Questions for Perplexity

1. **How does SAOPass internally read the depth texture?**
   - Does it read from `readBuffer.depthTexture` directly?
   - Does it access it through a shader uniform?
   - Does it need the depth texture to be on a specific property?

2. **Is the depth texture actually being written to during RenderPass?**
   - When we attach `depthTexture` to a WebGLRenderTarget, does RenderPass automatically write to it?
   - Do we need to explicitly enable depth writing in the renderer?

3. **What's the correct timing for depth texture connection?**
   - Should it be connected before RenderPass renders?
   - Should it be connected after RenderPass renders?
   - Should it be connected in both places?

4. **Are there known issues with SAOPass and depth textures in Three.js 0.162?**
   - Should we use a different approach?
   - Is there a compatibility issue?

5. **What's the minimal working example for SAOPass with depth texture?**
   - Can you provide a complete working code example?

## Expected vs Actual Behavior

**Expected:**
- AO adds subtle darkening in corners and crevices
- Model remains visible with AO applied
- AO intensity controls effect strength

**Actual:**
- Entire model renders as black silhouette
- No visible geometry
- Occurs even with very low intensity (0.05)

## Request
Please provide:
1. A complete working example of SAOPass with depth texture in EffectComposer
2. Explanation of how SAOPass reads depth texture
3. Any known issues or workarounds
4. Recommended fix for the black screen issue












