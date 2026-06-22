# Perplexity Guidance Request - Three.js SAOPass Black Screen

## Issue
Three.js SAOPass causes entire 3D model to render as black silhouette when enabled, even with very low intensity (0.05) and scale (0.5).

## Current Setup
- EffectComposer with RenderPass (renderToScreen = false)
- Depth texture created and attached to render target
- Depth texture connected to readBuffer and renderTarget1
- SAOPass added after RenderPass
- Both RenderPass and SAOPass render methods overridden to ensure depth texture connection

## Key Questions
1. **How does SAOPass read depth?** Does it use `readBuffer.depthTexture` directly, or does it need depth from RenderPass output?
2. **Depth texture source:** Should the depth texture be written by RenderPass, or can SAOPass use a pre-created depth texture?
3. **Three.js version:** Are there known compatibility issues with SAOPass and depth textures in Three.js 0.162?
4. **Normal generation:** Does SAOPass need to generate normals internally, and could this be causing the black screen?
5. **Buffer swapping:** Does EffectComposer buffer swapping affect how SAOPass reads depth?

## Code Snippets

### Depth Texture Setup
```typescript
const depthTexture = new THREE.DepthTexture(width, height)
depthTexture.type = THREE.UnsignedShortType
renderTarget = new THREE.WebGLRenderTarget(width, height, {
  depthBuffer: true,
  depthTexture: depthTexture
})
```

### SAOPass Creation
```typescript
const saoPass = new SAOPass(scene, camera, width, height)
// Depth texture connected to readBuffer before adding pass
composer.addPass(saoPass)
```

## Expected Behavior
- AO should add subtle darkening in crevices and corners
- Model should remain visible with AO applied

## Actual Behavior
- Entire model renders as black silhouette
- No visible model details
- Issue persists even with very low parameters












