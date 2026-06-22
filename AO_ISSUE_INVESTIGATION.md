# AO Black Screen Issue - Deep Investigation

## Current Status
❌ **AO still causes black screen** even after multiple fixes:
- ✅ Depth texture created and attached to render target
- ✅ Depth texture connected to composer.readBuffer
- ✅ SAOPass render method overridden to ensure connection
- ✅ Very low intensity (0.05) and scale (0.5)
- ❌ **Still causes black screen**

## What We've Tried

### 1. Depth Texture Creation
- Created `DepthTexture` and attached to `composerRenderTarget`
- Set depth texture type to `UnsignedShortType`
- Updated depth texture size when render target resizes

### 2. Depth Texture Connection
- Connected depth texture to `composer.readBuffer.depthTexture`
- Also set on `composer.renderTarget1.depthTexture`
- Overrode SAOPass render method to ensure connection before each render

### 3. Parameter Tuning
- Reduced intensity from 0.25 → 0.05
- Reduced scale from 0.8 → 0.5
- Risk factor: 0.025 (well below 0.08 threshold)
- Still causes black screen

## Possible Root Causes

### Theory 1: SAOPass Needs Depth from RenderPass Output
SAOPass might need the depth to come from RenderPass's actual rendering output, not from a separate depth texture we create. The depth texture might not be getting written to during RenderPass rendering.

**Investigation needed:**
- Check if RenderPass actually writes to the depth texture
- Verify that the depth buffer is being written during scene rendering
- Check if we need to enable depth writing explicitly

### Theory 2: SAOPass Needs to Render Scene Itself
SAOPass creates its own `normalRenderTarget` and might need to render the scene itself to generate normals correctly. If it's not getting proper depth/normal data, it might fail.

**Investigation needed:**
- Check SAOPass source code to see how it reads depth
- Verify if SAOPass renders the scene internally
- Check if normal render target is being populated correctly

### Theory 3: Depth Texture Format Issue
The depth texture format might not be compatible with how SAOPass reads it. SAOPass might expect depth in a different format or location.

**Investigation needed:**
- Check SAOPass shader code to see how it samples depth
- Verify depth texture format matches SAOPass expectations
- Check if depth needs to be in a specific texture unit

### Theory 4: Three.js Version Compatibility
There might be a compatibility issue between our Three.js version and SAOPass implementation.

**Investigation needed:**
- Check Three.js version compatibility
- Look for known issues with SAOPass in our version
- Check if SAOPass API has changed

## Next Steps

1. **Examine SAOPass Source Code**
   - Look at how SAOPass actually reads depth
   - Check if it reads from `readBuffer.depthTexture` or somewhere else
   - Verify the expected depth texture format

2. **Test with Minimal Setup**
   - Create a minimal test case with just RenderPass + SAOPass
   - Verify if depth texture is actually being written
   - Check if SAOPass can read depth in isolation

3. **Alternative Solutions**
   - Consider using a different AO implementation
   - Implement a simpler AO shader that doesn't require depth texture
   - Use a post-processing AO that works differently

## Temporary Solution
AO is currently **automatically disabled** when enabled to prevent black screen. The car will render correctly, but AO effect won't be visible.

## Files Modified
- `src/viewer/postprocessing/PostProcessingSystem.ts` - All AO-related code
- `src/store/useAppStore.ts` - AO default values












