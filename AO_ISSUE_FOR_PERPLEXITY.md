# Three.js SAOPass Black Screen Issue - Request for Fix

## Problem
When enabling Ambient Occlusion (AO) using Three.js SAOPass, the entire 3D model renders as a black silhouette. This occurs even with very conservative parameters (intensity: 0.05, scale: 0.5).

## Current Implementation

### Setup
1. **Depth Texture Creation:**
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

2. **RenderPass Setup:**
```typescript
this.renderPass = new RenderPass(this.scene, this.camera)
this.renderPass.renderToScreen = false

// Override RenderPass render to ensure depth texture is connected
const originalRenderPassRender = this.renderPass.render.bind(this.renderPass)
this.renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  
  // After RenderPass renders, ensure depth texture is connected
  if (this.composerRenderTarget?.depthTexture && writeBuffer) {
    writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) {
      composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    }
    if (composerAny.renderTarget1) {
      composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
    }
  }
}
```

3. **SAOPass Setup:**
```typescript
this.aoPass = new SAOPass(this.scene, this.camera, width, height)
this.aoPass.renderToScreen = false

// Override SAOPass render to ensure depth texture is connected
const originalRender = this.aoPass.render.bind(this.aoPass)
this.aoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  if (this.composerRenderTarget?.depthTexture) {
    if (readBuffer) {
      readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    }
    const composerAny = this.composer as any
    if (composerAny.readBuffer) {
      composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    }
    if (composerAny.renderTarget1) {
      composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
    }
  }
  originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
}
```

4. **Pass Order:**
- RenderPass (index 0)
- SAOPass (index 1)
- Other passes...
- OutputPass (last)

## What We've Tried

1. ✅ Created DepthTexture and attached to render target
2. ✅ Connected depth texture to composer.readBuffer.depthTexture
3. ✅ Connected depth texture to composer.renderTarget1.depthTexture
4. ✅ Overrode RenderPass render to connect depth after rendering
5. ✅ Overrode SAOPass render to ensure connection before rendering
6. ✅ Verified depth texture exists and is accessible
7. ✅ Used very low intensity (0.05) and scale (0.5)
8. ✅ Verified SAOPass is properly sized and initialized

## Console Logs
```
[PostProcessingSystem] ✅ Depth texture available for SAOPass: {hasDepthTexture: true, depthTextureType: 'DepthTexture', depthTextureSize: {...}}
[PostProcessingSystem] ✅ Depth texture connected to composer readBuffer for SAOPass
[PostProcessingSystem] ✅ SAOPass render method overridden to ensure depth texture connection
[PostProcessingSystem] ✅ AO pass added successfully
```

## Questions for Perplexity

1. **Is the depth texture actually being written to by RenderPass?** 
   - We attach it to the render target, but does RenderPass automatically write to it?
   - Do we need to explicitly enable depth writing?

2. **How does SAOPass read the depth texture?**
   - Does it read from `readBuffer.depthTexture` directly?
   - Does it need the depth texture to be on a specific buffer?
   - Does it read from the render target's depth texture or from readBuffer?

3. **Are we connecting the depth texture at the right time?**
   - Should it be connected before RenderPass renders?
   - Should it be connected after RenderPass renders but before SAOPass renders?
   - Should it be connected in both places?

4. **Is there a compatibility issue with Three.js version?**
   - We're using Three.js 0.162
   - Are there known issues with SAOPass and depth textures in this version?

5. **What's the correct way to ensure SAOPass can read depth?**
   - Should we use a different approach?
   - Is there a specific render target configuration needed?

## Expected Behavior
- AO should add subtle darkening in corners and crevices
- Model should remain visible with AO applied
- AO intensity should control the strength of the effect

## Actual Behavior
- Entire model renders as black silhouette
- No visible geometry
- Effect occurs even with very low intensity (0.05)












