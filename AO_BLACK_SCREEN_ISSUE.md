# AO Black Screen Issue - Status & Fix

## Problem
Ambient Occlusion (AO) is causing the entire scene to render black, even with:
- Very low intensity (0.05) and scale (0.5)
- Depth texture properly created and attached to render target
- All safety checks in place

## Current Status
✅ **Depth texture is created** - `DepthTexture` is attached to `composerRenderTarget`
✅ **Depth texture is detected** - Console shows: `✅ Depth texture available for SAOPass`
❌ **SAOPass still causes black screen** - Even with depth texture available

## Root Cause
SAOPass in Three.js needs to read the depth texture from the **composer's readBuffer**, not directly from the render target. The depth texture exists, but SAOPass may not be accessing it correctly.

## Temporary Fix Applied
AO is now **automatically disabled** when enabled to prevent black screen. The safety check removes AO from the composer passes if it's causing issues.

## Next Steps to Fix Properly

### Option 1: Ensure Depth Texture is on readBuffer
SAOPass reads depth from `composer.readBuffer.depthTexture`. We need to ensure the depth texture is copied to the readBuffer:

```typescript
// After RenderPass renders, ensure depth texture is available
if (this.composerRenderTarget.depthTexture) {
  // Copy depth texture to readBuffer if needed
  const composerAny = this.composer as any
  if (composerAny.readBuffer) {
    composerAny.readBuffer.depthTexture = this.composerRenderTarget.depthTexture
  }
}
```

### Option 2: Use SAOPass with explicit depth texture
Some versions of SAOPass allow passing depth texture explicitly. Check if SAOPass constructor or methods support this.

### Option 3: Alternative AO Implementation
Consider using a different AO implementation that doesn't require depth texture, or implement a simpler AO shader.

## Files Modified
- `src/viewer/postprocessing/PostProcessingSystem.ts`
  - Added depth texture creation in `initialize()`
  - Added depth texture size update in `setSize()`
  - Added temporary AO disable in `render()` method

## Testing
1. ✅ Depth texture is created and attached
2. ✅ Depth texture is detected in console
3. ❌ AO still causes black screen (temporarily disabled)
4. ⏳ Need to fix SAOPass depth texture connection

## References
- Perplexity research: SAOPass requires depth texture, not just depth buffer
- Three.js SAOPass documentation: Should automatically read from render target
- Issue: Depth texture exists but SAOPass may not be reading it correctly












