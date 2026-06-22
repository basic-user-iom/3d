# Complete Post-Processing Analysis Results from Perplexity

## Analysis Date
2025-12-19

## Key Findings from Perplexity Searches

### 1. SAOPass Black Screen - Known Issue
**Finding:** SAOPass black screen is a **well-documented issue** in Three.js, typically caused by:
- **Depth texture conflicts** when using EffectComposer with multiple passes
- **Shadow map interference** with depth texture that SAOPass depends on
- **Improper RenderTarget configuration** across multiple passes

**Solutions Identified:**
- Ensure proper depth texture handling
- Configure WebGLRenderer and EffectComposer correctly
- Verify pass order in EffectComposer

### 2. Three.js 0.162 Known Issues
**Finding:** Version 0.162 has specific problems:
- **Shader compilation failures** on certain GPUs (especially mobile/older hardware)
- **Incorrect depth texture binding** causing entire model to render as silhouette
- **WebGL context incompatibilities** between different browser implementations
- **Depth Pass Requirements** - SAOPass requires explicit depth texture setup that may not initialize properly
- **Shader Precision Issues** - lowp/mediump precision on mobile devices can cause rendering failures

**Solutions:**
- Ensure `renderer.shadowMap.enabled = true`
- Verify depth texture is properly attached: `composer.addPass(depthPass)` before SAOPass
- Check that scene has proper camera near/far planes set
- Reset SAOPass parameters to defaults and gradually adjust

### 3. EffectComposer Conflicts
**Finding:** Multiple post-processing passes can conflict:
- **Depth Buffer Conflicts:** SAOPass requires depth texture, but RenderPass may not properly output depth by default
- **Multiple passes fighting** over the same depth buffer can cause visual artifacts
- **Shadow maps use their own depth textures**, creating conflicts when post-processing reads depth
- **Post-processing passes may read stale or incorrect depth data** if shadow maps aren't rendered first

**Solutions:**
1. Enable Depth Texture in RenderPass
2. Use DepthPass for Accurate Depth
3. Configure SAOPass Properly
4. Correct Pass Order: RenderPass → Depth → SAOPass → Other passes

### 4. Material Property Issues
**Finding:** Material properties can cause black rendering:
- **Transparency issues:** SAOPass doesn't properly handle transparent materials
- **AlphaMap or transparent materials** cause black artifacts
- **Depth texture includes transparent objects incorrectly**

**Material Properties to Check:**
| Property | Issue | Fix |
|----------|-------|-----|
| `depthTest` | Disabled breaks depth | Keep enabled |
| `depthWrite` | Transparency issues | Enable for opaque objects |
| `alphaTest` | Creates black holes | Adjust threshold or disable |
| `side` | Double-sided culling | Use `DoubleSide` carefully |

**Solutions:**
- Set transparent materials to `renderOrder` appropriately
- Disable SAO on transparent objects
- Ensure `depthTest: true` and `depthWrite: true` for opaque objects

### 5. Best Practices (Limited Results)
**Finding:** Search results didn't provide comprehensive best practices, but common recommendations:
- Consult official Three.js documentation and examples
- Check Three.js post-processing effects repository
- Review specialized Three.js tutorials and forums

## Potential Issues in Our Implementation

### 1. Shadow Map Interference
- **Issue:** Shadow maps may be interfering with depth texture that SAOPass needs
- **Check:** Verify shadow maps are rendered before post-processing
- **Fix:** Ensure RenderPass renders shadows correctly

### 2. Material Properties
- **Issue:** Some materials may have `depthTest: false` or `depthWrite: false`
- **Check:** Verify all materials have proper depth settings
- **Fix:** Ensure materials have `depthTest: true` and `depthWrite: true` (for opaque)

### 3. Pass Order
- **Issue:** Pass order may be incorrect
- **Check:** Verify RenderPass is first, SAOPass is second
- **Fix:** Ensure correct pass order

### 4. Depth Texture Not Written
- **Issue:** Depth texture may not be written by RenderPass
- **Check:** Verify RenderPass writes depth correctly
- **Fix:** Ensure render target has `depthBuffer: true` and RenderPass renders correctly

### 5. Shader Compilation Issues
- **Issue:** SAOPass shader may fail to compile on some GPUs
- **Check:** Check browser console for WebGL errors
- **Fix:** May need to adjust shader precision or use alternative AO implementation

## Recommended Next Steps

1. **Check WebGL Errors:** Look for shader compilation errors in browser console
2. **Verify Material Properties:** Ensure all materials have proper depth settings
3. **Test with Simple Scene:** Create minimal test scene to isolate issue
4. **Check Pass Order:** Verify passes are in correct order
5. **Test Shadow Maps:** Disable shadow maps temporarily to see if conflict exists
6. **Check Camera Settings:** Verify camera near/far planes are set correctly












