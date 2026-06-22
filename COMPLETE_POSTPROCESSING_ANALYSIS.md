# Complete Post-Processing & 3D Viewer Analysis

## Analysis Date
2025-12-19

## Executive Summary

After comprehensive analysis using Perplexity searches and codebase review, we've identified **multiple potential causes** for the SAOPass black screen issue. The problem is likely **multi-factorial**, involving depth texture handling, material properties, pass ordering, and potential conflicts with shadow maps.

## Key Findings from Perplexity

### 1. SAOPass Black Screen - Known Issue ✅
**Confirmed:** SAOPass black screen is a **well-documented issue** in Three.js.

**Root Causes Identified:**
- Depth texture conflicts when using EffectComposer with multiple passes
- Shadow map interference with depth texture that SAOPass depends on
- Improper RenderTarget configuration across multiple passes
- Shader compilation failures on certain GPUs (especially mobile/older hardware)
- Incorrect depth texture binding causing entire model to render as silhouette
- WebGL context incompatibilities between different browser implementations

### 2. Three.js 0.162 Specific Issues ✅
**Version-Specific Problems:**
- **Depth Pass Requirements:** SAOPass requires explicit depth texture setup that may not initialize properly
- **Shader Precision Issues:** lowp/mediump precision on mobile devices can cause rendering failures
- **RenderTarget Configuration:** Changes to how internal render targets are created/disposed

**Solutions:**
- Ensure `renderer.shadowMap.enabled = true`
- Verify depth texture is properly attached
- Check that scene has proper camera near/far planes set
- Reset SAOPass parameters to defaults and gradually adjust

### 3. EffectComposer Conflicts ✅
**Multiple Pass Interference:**
- **Depth Buffer Conflicts:** SAOPass requires depth texture, but RenderPass may not properly output depth by default
- **Multiple passes fighting** over the same depth buffer can cause visual artifacts
- **Shadow maps use their own depth textures**, creating conflicts when post-processing reads depth
- **Post-processing passes may read stale or incorrect depth data** if shadow maps aren't rendered first

**Correct Pass Order (Critical):**
1. RenderPass (renders scene with shadows)
2. Depth Pass (if needed)
3. SAOPass
4. Other passes (SSS, SSR, Bloom, etc.)
5. OutputPass (last, renders to screen)

### 4. Material Property Issues ✅
**Material Properties Causing Black Rendering:**

| Property | Issue | Fix |
|----------|-------|-----|
| `depthTest` | Disabled breaks depth | Keep enabled |
| `depthWrite` | Transparency issues | Enable for opaque objects |
| `alphaTest` | Creates black holes | Adjust threshold or disable |
| `side` | Double-sided culling | Use `DoubleSide` carefully |
| `transparent` | SAOPass doesn't handle well | May need special handling |

**Transparency Issues:**
- SAOPass doesn't properly handle transparent materials
- AlphaMap or transparent materials cause black artifacts
- Depth texture includes transparent objects incorrectly

### 5. Pass Order Issues ✅
**Critical Finding:** Pass order is **critical** for SAOPass to work correctly.

**Correct Setup:**
```javascript
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));  // MUST be first
const saoPass = new SAOPass(scene, camera, width, height);
composer.addPass(saoPass);  // MUST be after RenderPass
```

**Common Mistakes:**
- Adding SAOPass before RenderPass
- Incorrect `needsSwap` settings
- Wrong `renderToScreen` settings

## Codebase Analysis

### Material Configuration ✅
**Our Implementation:**
- ✅ Materials have `depthTest: true` (enforced in `useViewer.ts`)
- ✅ Opaque materials have `depthWrite: true` (enforced in `useViewer.ts`)
- ✅ Transparent materials have `depthWrite: false` (correctly configured)
- ✅ Materials are properly configured during model load

**Potential Issues:**
- Some materials may have `alphaTest` set, which could cause issues
- Transparent materials may interfere with SAOPass depth reading

### Post-Processing Setup ✅
**Our Implementation (After Simplification):**
- ✅ Render target has `depthBuffer: true`
- ✅ RenderPass is first pass
- ✅ SAOPass is added after RenderPass
- ✅ No manual depth texture creation (simplified)
- ✅ No render method overrides (simplified)

**Remaining Potential Issues:**
- Pass order may still be incorrect if other passes are added before SAOPass
- Shadow maps may interfere with depth texture
- Material properties may need adjustment

## Potential Root Causes (Ranked by Likelihood)

### 1. Shadow Map Interference (HIGH PROBABILITY)
**Issue:** Shadow maps may be interfering with depth texture that SAOPass needs.

**Evidence:**
- Perplexity confirms shadow maps use their own depth textures
- Can create conflicts when post-processing reads depth
- Our scene has shadow maps enabled

**Test:**
- Temporarily disable shadow maps
- Check if AO works without shadows
- If it works, shadow maps are the issue

### 2. Material Properties (MEDIUM PROBABILITY)
**Issue:** Some materials may have properties that cause black rendering.

**Evidence:**
- Perplexity confirms material properties can cause black rendering
- Our scene has 130 materials with various properties
- Some materials may have `alphaTest` or other problematic properties

**Test:**
- Check all materials for `alphaTest` values
- Verify all opaque materials have `depthWrite: true`
- Test with simple scene with basic materials

### 3. Pass Order (MEDIUM PROBABILITY)
**Issue:** Pass order may be incorrect if other passes are added.

**Evidence:**
- Perplexity confirms pass order is critical
- We have multiple passes (SSS, SSR, Bloom, etc.)
- SAOPass must be immediately after RenderPass

**Test:**
- Verify SAOPass is second pass (after RenderPass)
- Temporarily disable other passes
- Test with only RenderPass + SAOPass

### 4. Shader Compilation (LOW PROBABILITY)
**Issue:** SAOPass shader may fail to compile on some GPUs.

**Evidence:**
- Perplexity confirms shader compilation failures on certain GPUs
- Version 0.162 has known shader precision issues

**Test:**
- Check browser console for WebGL errors
- Test on different GPUs/browsers
- Check WebGL capabilities

### 5. Depth Texture Not Written (LOW PROBABILITY)
**Issue:** Depth texture may not be written by RenderPass.

**Evidence:**
- We simplified to let EffectComposer handle depth automatically
- Should work, but may need verification

**Test:**
- Verify depth texture exists after RenderPass renders
- Check if depth texture has valid data
- Use WebGL inspector to verify

## Recommended Actions

### Immediate Actions
1. **Test with Shadow Maps Disabled**
   - Temporarily disable shadow maps
   - Check if AO works
   - If it works, shadow maps are the issue

2. **Verify Pass Order**
   - Ensure SAOPass is second pass (after RenderPass)
   - Temporarily disable other passes
   - Test with minimal setup

3. **Check Material Properties**
   - Verify all materials have correct depth settings
   - Check for `alphaTest` values
   - Test with simple scene

4. **Check WebGL Errors**
   - Look for shader compilation errors
   - Check for WebGL context errors
   - Verify WebGL capabilities

### Debugging Steps
1. **Create Minimal Test Scene**
   - Simple geometry (box, sphere)
   - Basic materials
   - No shadows
   - Only RenderPass + SAOPass
   - Test if AO works

2. **Gradually Add Complexity**
   - Add shadows
   - Add more materials
   - Add other passes
   - Identify what breaks AO

3. **Check Depth Texture**
   - Use WebGL inspector
   - Verify depth texture exists
   - Check if it has valid data
   - Verify SAOPass can read it

## Alternative Solutions

### 1. Use SSAOPass Instead
- SSAOPass may be more stable
- Different implementation
- May avoid SAOPass bugs

### 2. Use Custom AO Implementation
- Implement custom AO shader
- Full control over depth reading
- Avoid SAOPass issues

### 3. Use Alternative AO Library
- N8AO (mentioned in Perplexity results)
- More stable and feature-rich
- Better documentation

## Conclusion

The black screen issue is likely caused by **multiple factors**:
1. Shadow map interference (most likely)
2. Material properties (medium likelihood)
3. Pass order issues (medium likelihood)
4. Shader compilation (low likelihood)
5. Depth texture not written (low likelihood)

**Recommended approach:**
1. Test with shadow maps disabled
2. Verify pass order
3. Check material properties
4. Create minimal test scene
5. Consider alternative AO implementation if issues persist












