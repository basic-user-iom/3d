# Comprehensive Test Summary - External Objects Visibility Issue

## Problem
External objects (red boxes) are being drawn successfully according to logs, but are not visible in the Streets GL scene.

## Tests Performed

### 1. Shader Output Tests
- ✅ **Constant Red Color Test**: Modified shader to output constant pure red (1.0, 0.0, 0.0) with maximum brightness
  - Result: Objects still not visible
  - Conclusion: Shader is executing, but outputs may not be reaching final render

### 2. Material and Color Tests
- ✅ **Color Uniform Test**: Verified `objectColor` uniform is set correctly (r: 1, g: 0, b: 0)
- ✅ **Texture ID Test**: Set `textureId` to -1 to force solid color rendering
- ✅ **Material Binding Test**: Verified material is bound before drawing
- ✅ **Brightness Tests**: Increased brightness to 100x, 1000x, 10000x
- ✅ **Glow Tests**: Added glow with 100x, 500x, 10000x multipliers
- Result: All tests show objects are being drawn, but still not visible

### 3. Rendering Pipeline Tests
- ✅ **Depth Test**: Disabled depth test (set to `Always`) - objects should render regardless of depth
- ✅ **Face Culling**: Disabled face culling (`CullMode.None`)
- ✅ **Render Order**: Verified external objects render LAST (after terrain)
- ✅ **Lighting Bypass**: Modified shading pass to bypass lighting for external objects (use glow directly)
- Result: Objects still not visible

### 4. Geometry and Position Tests
- ✅ **Position Verification**: Objects are in front of camera (inFront=true, dot=0.998)
- ✅ **Scale Verification**: Objects are 1000m cubes (should be impossible to miss)
- ✅ **Height Verification**: Objects placed at correct height (center at 615m for 1000m cube)
- ✅ **Mesh Verification**: Mesh has valid attributes (position, normal, uv)
- ✅ **Vertex Count**: Mesh has vertices present
- Result: All geometry checks pass

### 5. G-buffer and Shader Tests
- ✅ **G-buffer Outputs**: Verified shader writes to all required outputs:
  - `outColor` (location 0) - Color attachment 0
  - `outGlow` (location 5) - Color attachment 5
  - `outNormal` (location 1) - Color attachment 1
  - `outRoughnessMetalnessF0` (location 2) - Color attachment 2
  - `outMotion` (location 3) - Color attachment 3
  - `outObjectId` (location 4) - Color attachment 4
- ✅ **Color Format**: Converted to sRGB before writing to G-buffer
- ✅ **Shader Compilation**: No shader compilation errors
- Result: Shader outputs are configured correctly

### 6. Viewport and Scissor Tests
- ⏳ **Viewport Check**: Added logging to check viewport settings (pending new build)
- ⏳ **Scissor Check**: Added logging to check scissor settings (pending new build)
- ⏳ **WebGL Errors**: Added error checking after draw calls (pending new build)

## Current Status

### What We Know Works:
1. ✅ Objects are being created and added to scene
2. ✅ Geometry is valid (positions, normals, UVs, indices)
3. ✅ Material is being set and bound
4. ✅ Objects are being drawn (logs confirm `draw()` is called)
5. ✅ Objects are in front of camera
6. ✅ Shader is configured to output constant red color
7. ✅ Depth test is disabled
8. ✅ Face culling is disabled
9. ✅ Objects render last (after terrain)

### What We're Testing:
1. ⏳ Viewport/scissor settings
2. ⏳ WebGL errors during rendering
3. ⏳ Mesh attribute details (vertex count, buffer sizes)
4. ⏳ Material binding verification

## Next Steps

1. Wait for build to complete and check comprehensive debug logs
2. Verify viewport/scissor settings are correct
3. Check for WebGL errors during rendering
4. Verify mesh.draw() is actually calling gl.drawArrays/drawElements
5. Check if G-buffer is being read correctly in shading pass

## Hypothesis

Given that:
- Objects are being drawn successfully
- Shader outputs constant red color
- Depth test is disabled
- Objects render last
- Objects are in front of camera

The issue is likely:
1. **Viewport/Scissor Issue**: Objects are being rendered outside the viewport
2. **G-buffer Read Issue**: The shading pass is not reading external objects correctly
3. **Shader Execution Issue**: The shader is not actually executing (despite being called)
4. **Framebuffer Issue**: Objects are being written to wrong framebuffer or attachment






