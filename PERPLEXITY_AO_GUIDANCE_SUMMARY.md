# Perplexity Guidance Summary - SAOPass Black Screen Fix

## Key Findings from Perplexity

### How SAOPass Reads Depth
1. **SAOPass reads from `readBuffer.depthTexture`**
   - This is set by EffectComposer's RenderPass
   - RenderPass must render to readBuffer (not directly to screen)

2. **RenderPass Requirements:**
   - ✅ `renderToScreen: false` (we have this)
   - ✅ Render target must have depth texture configured (we have this)
   - ✅ Depth texture must be written by RenderPass during rendering

### Critical Insight
**SAOPass cannot reliably use a pre-created depth texture independently.** It expects depth from the actively rendered scene. The depth texture must be written by RenderPass during the render cycle.

## Our Current Implementation Status

### ✅ What We Have Correct
1. RenderPass has `renderToScreen = false`
2. Depth texture created and attached to render target
3. Depth texture connected to readBuffer
4. RenderPass override to ensure depth texture connection
5. SAOPass override to ensure depth texture connection

### ⚠️ Potential Issues
1. **Depth texture might not be written by RenderPass**
   - We create the depth texture, but does RenderPass actually write to it?
   - The depth texture needs to be populated during RenderPass.render()

2. **EffectComposer buffer swapping**
   - EffectComposer swaps buffers between passes
   - The depth texture might not be preserved during buffer swaps

3. **Depth texture format/type**
   - We use `UnsignedShortType` - is this correct?
   - Should we use a different format?

## Recommended Next Steps

1. **Verify depth texture is written:**
   - Check if RenderPass actually writes to the depth texture
   - Add debug logging to verify depth texture has data

2. **Check EffectComposer buffer management:**
   - Ensure depth texture is preserved during buffer swaps
   - Verify readBuffer has the depth texture when SAOPass renders

3. **Test with minimal setup:**
   - Create a simple test scene with basic geometry
   - Verify SAOPass works with minimal setup
   - Then test with complex model

4. **Check Three.js version compatibility:**
   - Verify SAOPass behavior with Three.js 0.162
   - Check if there are known issues with depth texture in this version

## Code Verification Needed

### Check if depth texture is populated:
```typescript
// After RenderPass renders, check if depth texture has data
const depthData = new Float32Array(width * height)
renderer.readRenderTargetPixels(
  renderTarget,
  0, 0, width, height,
  depthData
)
console.log('Depth texture has data:', depthData.some(v => v > 0))
```

### Verify readBuffer has depth texture:
```typescript
// Before SAOPass renders, verify readBuffer has depth texture
console.log('readBuffer.depthTexture:', readBuffer.depthTexture)
console.log('readBuffer.depthTexture type:', readBuffer.depthTexture?.type)
```












