# Final AO Fix Request - Complete Issue Summary

## Problem
Three.js SAOPass causes entire 3D model to render as black silhouette when enabled, even with very low intensity (0.05) and scale (0.5).

## Environment
- Three.js version: 0.162
- Using EffectComposer with RenderPass and SAOPass
- Depth texture created and attached to render target
- All connections verified in console logs

## Current Code

### Render Target with Depth Texture
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

### RenderPass Override
```typescript
const originalRenderPassRender = this.renderPass.render.bind(this.renderPass)
this.renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  if (writeBuffer && !writeBuffer.depthTexture && this.composerRenderTarget?.depthTexture) {
    writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
  originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  if (this.composerRenderTarget?.depthTexture) {
    if (writeBuffer) writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
    const composerAny = this.composer as any
    if (composerAny.readBuffer) composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget1) composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
    if (composerAny.renderTarget2) composerAny.renderTarget2.depthTexture = this.composerRenderTarget.depthTexture
  }
}
```

### SAOPass Override
```typescript
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

## Console Verification
All logs show depth texture is connected:
- ✅ Depth texture available
- ✅ Connected to readBuffer
- ✅ SAOPass render override active
- ✅ AO pass added successfully

## Critical Questions

1. **Does RenderPass automatically write to depthTexture when attached to render target?**
   - Or do we need to explicitly enable something?

2. **How does SAOPass access the depth texture?**
   - Through readBuffer.depthTexture?
   - Through a shader uniform?
   - Through internal render target?

3. **Is there a timing issue?**
   - Should depth texture be set before or after RenderPass renders?
   - Does EffectComposer swap buffers in a way that breaks the connection?

4. **Is the depth texture format correct?**
   - UnsignedShortType correct?
   - Should it be a different format?

5. **Are there known bugs in Three.js 0.162 with SAOPass?**
   - Should we upgrade?
   - Is there a workaround?

## Request
Please provide:
1. Complete working code example
2. Explanation of how SAOPass reads depth
3. Fix for black screen issue
4. Any version-specific considerations












