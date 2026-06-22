# AO Implementation Comparison - Our Code vs Official Documentation

## What We're Doing

### 1. Depth Texture Creation
```typescript
const depthTexture = new THREE.DepthTexture(composerWidth, composerHeight)
depthTexture.type = THREE.UnsignedShortType

this.composerRenderTarget = new THREE.WebGLRenderTarget(composerWidth, composerHeight, {
  depthBuffer: true,
  depthTexture: depthTexture,
  // ... other options
})
```

### 2. EffectComposer Setup
```typescript
this.composer = new EffectComposer(this.renderer, this.composerRenderTarget)
this.renderPass = new RenderPass(this.scene, this.camera)
this.renderPass.renderToScreen = false
this.composer.addPass(this.renderPass)
```

### 3. SAOPass Creation
```typescript
this.aoPass = new SAOPass(this.scene, this.camera, width, height)
this.aoPass.renderToScreen = false
// Insert after RenderPass
this.composer.passes.splice(renderPassIndex + 1, 0, this.aoPass)
```

### 4. Depth Texture Connection
```typescript
// Override RenderPass render
this.renderPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  originalRenderPassRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  // Connect depth texture after rendering
  if (writeBuffer) {
    writeBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
  // Also connect to composer's internal buffers
  composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  composerAny.renderTarget1.depthTexture = this.composerRenderTarget.depthTexture
}

// Override SAOPass render
this.aoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  // Connect depth texture before rendering
  if (readBuffer) {
    readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
  originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
}
```

## What Official Documentation Says

### Standard Setup (from Three.js examples)
```javascript
// 1. Create render target WITHOUT explicit depth texture
const renderTarget = new THREE.WebGLRenderTarget(width, height, {
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true  // Just depth buffer, not depth texture
})

// 2. Create EffectComposer
const composer = new EffectComposer(renderer, renderTarget)

// 3. Add RenderPass
const renderPass = new RenderPass(scene, camera)
renderPass.renderToScreen = false
composer.addPass(renderPass)

// 4. Add SAOPass
const saoPass = new SAOPass(scene, camera, width, height)
saoPass.renderToScreen = false
composer.addPass(saoPass)

// 5. Render
composer.render()
```

## Key Differences

### ❌ What We're Doing Wrong

1. **Creating Depth Texture Explicitly**
   - We create `THREE.DepthTexture` and attach it to render target
   - Official examples don't do this - they just use `depthBuffer: true`

2. **Overriding Render Methods**
   - We override both RenderPass and SAOPass render methods
   - Official examples don't do this - they rely on EffectComposer's automatic handling

3. **Manually Connecting Depth Texture**
   - We manually connect depth texture to readBuffer, renderTarget1, etc.
   - Official examples don't do this - EffectComposer handles it automatically

### ✅ What We Should Do

1. **Let EffectComposer Handle Depth**
   - Don't create depth texture explicitly
   - Just use `depthBuffer: true` in render target
   - EffectComposer will automatically make depth available to passes

2. **Don't Override Render Methods**
   - Let RenderPass and SAOPass work normally
   - EffectComposer handles buffer swapping and depth texture access

3. **Trust the Framework**
   - SAOPass is designed to work with EffectComposer
   - It automatically reads depth from the previous pass's output

## The Real Issue

**SAOPass reads depth from `readBuffer.depthTexture`, which EffectComposer automatically provides when:**
1. Render target has `depthBuffer: true`
2. RenderPass renders to that target
3. EffectComposer swaps buffers and makes depth available to next pass

**We're overcomplicating it by:**
- Creating depth texture explicitly
- Manually connecting it everywhere
- Overriding render methods

**The black screen might be caused by:**
- Depth texture not being properly written by RenderPass
- Our manual overrides interfering with EffectComposer's automatic handling
- Depth texture format/type mismatch

## Recommended Fix

1. **Remove explicit depth texture creation**
2. **Remove render method overrides**
3. **Let EffectComposer handle everything automatically**
4. **Just ensure render target has `depthBuffer: true`**












