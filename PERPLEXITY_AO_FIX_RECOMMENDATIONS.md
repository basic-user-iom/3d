# Perplexity AO Fix Recommendations

## Key Findings

### 1. RenderPass Configuration
- **CRITICAL**: `renderPass.renderToScreen = false` - RenderPass must NOT render to screen
- RenderPass must be the first pass in the composer
- RenderPass outputs depth to the render target, which SAOPass reads

### 2. SAOPass Configuration
- SAOPass should be added AFTER RenderPass
- SAOPass reads depth from RenderPass output (readBuffer)
- SAOPass should have `renderToScreen = true` if it's the last pass

### 3. Depth Texture Requirements
- Ensure renderer supports depth texture: `renderer.capabilities.isWebGL2`
- Don't use `THREE.UnsignedByteType` for depth buffer
- SAOPass requires `readPixels` capability

### 4. Parameter Settings
- `saoBias = 0.5`
- `saoIntensity = 0.25` (we're using 0.05 - very conservative)
- `saoScale = 10` (we're using 0.5 - very conservative)
- `saoKernelRadius = 100`
- `saoMinResolution = 0`
- `saoBlur = true`
- `saoBlurRadius = 8`

## Current Implementation Issues

### What We're Doing Right
1. ✅ Creating depth texture with `THREE.DepthTexture`
2. ✅ Using `THREE.UnsignedShortType` for depth texture
3. ✅ Connecting depth texture to render target
4. ✅ Overriding RenderPass and SAOPass render methods

### Potential Issues
1. ⚠️ Depth texture might not be getting written to by RenderPass
2. ⚠️ SAOPass might not be reading from the correct buffer
3. ⚠️ EffectComposer buffer swapping might disconnect depth texture
4. ⚠️ Parameters might be too conservative (intensity 0.05, scale 0.5)

## Recommended Fix

### Step 1: Verify RenderPass Configuration
```typescript
this.renderPass.renderToScreen = false; // CRITICAL
```

### Step 2: Ensure SAOPass Reads from Correct Buffer
SAOPass should automatically read from `readBuffer.depthTexture` when RenderPass writes to it.

### Step 3: Check Depth Texture is Written
The depth texture should be automatically populated when RenderPass renders to a render target with `depthBuffer: true` and `depthTexture` attached.

### Step 4: Verify Pass Order
```typescript
composer.addPass(renderPass);  // First
composer.addPass(saoPass);     // After RenderPass
// ... other passes
```

## Next Steps
1. Verify RenderPass is not rendering to screen
2. Check if depth texture is actually being written to
3. Ensure SAOPass is reading from the correct buffer
4. Test with slightly higher parameters (intensity 0.1, scale 1.0)












