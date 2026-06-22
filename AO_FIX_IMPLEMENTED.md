# AO Fix Implemented - Based on Official Documentation

## Date: 2025-01-18

## Problem
AO (Ambient Occlusion) was causing the entire 3D model to render as a black silhouette when enabled, despite multiple attempts to fix it.

## Root Cause
After comparing our implementation with official Three.js examples and documentation, we discovered we were **overcomplicating the depth texture setup**. The standard Three.js approach is much simpler and relies on EffectComposer's automatic depth texture handling.

## What We Were Doing Wrong

1. **Creating explicit depth texture** - We were manually creating `THREE.DepthTexture` and attaching it to the render target
2. **Manually connecting depth texture** - We were manually connecting the depth texture to `readBuffer`, `renderTarget1`, and `renderTarget2` in multiple places
3. **Interfering with EffectComposer** - Our manual connections were potentially interfering with EffectComposer's automatic depth texture management

## What Official Examples Do

The standard Three.js approach (as seen in `ao-demo.html` and official documentation):

```javascript
// 1. Simple render target - just depth buffer, NO explicit depth texture
const renderTarget = new THREE.WebGLRenderTarget(width, height, {
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true  // That's it! No depthTexture property
})

// 2. Create composer with that target
const composer = new EffectComposer(renderer, renderTarget)

// 3. Add RenderPass
const renderPass = new RenderPass(scene, camera)
renderPass.renderToScreen = false
composer.addPass(renderPass)

// 4. Add SAOPass - that's it!
const saoPass = new SAOPass(scene, camera, width, height)
saoPass.renderToScreen = false
composer.addPass(saoPass)

// 5. Render - EffectComposer handles everything automatically
composer.render()
```

## Changes Made

### 1. Simplified Render Target Creation
**Before:**
```typescript
const depthTexture = new THREE.DepthTexture(composerWidth, composerHeight)
depthTexture.type = THREE.UnsignedShortType

this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  depthBuffer: true,
  depthTexture: depthTexture, // Manual depth texture
  // ...
})
```

**After:**
```typescript
this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true, // EffectComposer will automatically create depth texture from this
  stencilBuffer: false
})
```

### 2. Removed Manual Depth Texture Connection in render()
**Before:**
```typescript
if (this.config.ao?.enabled && this.aoPass && this.composer && this.composerRenderTarget?.depthTexture) {
  const composerAny = this.composer as any
  // Manual connection to readBuffer, renderTarget1, renderTarget2
  composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
  composerAny.renderTarget2.depthTexture = this.composerRenderTarget.depthTexture
}
```

**After:**
```typescript
// FIX: EffectComposer automatically handles depth texture - no manual connection needed
// When RenderPass renders to a render target with depthBuffer: true, EffectComposer
// automatically makes the depth available to subsequent passes via readBuffer.depthTexture
// SAOPass will automatically read from readBuffer.depthTexture when it renders
```

### 3. Simplified setSize() Method
**Before:**
```typescript
if (this.composerRenderTarget.depthTexture) {
  this.composerRenderTarget.depthTexture.image.width = width
  this.composerRenderTarget.depthTexture.image.height = height
  this.composerRenderTarget.depthTexture.needsUpdate = true
  // Manual reconnection to all buffers
  composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  // ...
}
```

**After:**
```typescript
if (this.composerRenderTarget) {
  this.composerRenderTarget.setSize(width, height)
}
// EffectComposer automatically handles depth texture resizing via composer.setSize()
```

## How EffectComposer Handles Depth

1. **When `depthBuffer: true` is set** on a render target, EffectComposer automatically creates and manages a depth texture
2. **When RenderPass renders**, it writes depth to the render target's depth buffer
3. **EffectComposer automatically** makes this depth available to subsequent passes via `readBuffer.depthTexture`
4. **SAOPass automatically** reads from `readBuffer.depthTexture` when it renders

## Why This Should Fix the Black Screen

1. **EffectComposer creates depth texture correctly** - It knows the right format/type for the platform
2. **Depth texture is properly written** - RenderPass writes to it automatically without interference
3. **SAOPass reads it correctly** - EffectComposer makes it available via `readBuffer.depthTexture` in the correct format
4. **No interference** - Our manual overrides won't interfere with automatic handling

## Testing

After this fix:
1. Enable AO in the UI
2. The 3D model should show ambient occlusion without turning black
3. AO should be visible as subtle darkening in corners and crevices

## Files Modified

- `src/viewer/postprocessing/PostProcessingSystem.ts`
  - Simplified render target creation (removed explicit depth texture)
  - Removed manual depth texture connections in `render()` method
  - Simplified `setSize()` method (removed manual depth texture resizing)

## References

- `ao-demo.html` - Working example of SAOPass setup
- `AO_DOCUMENTATION_COMPARISON.md` - Detailed comparison with official examples
- `AO_FIX_BASED_ON_DOCUMENTATION.md` - Recommended fix approach












