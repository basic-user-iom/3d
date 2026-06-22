# AO Testing Instructions

## Quick Test: Shadow Maps Disabled

### Step 1: Enable Test Mode
Open browser console and run:
```javascript
window.__testAOWithoutShadows = true
```

### Step 2: Enable Post-Processing and AO
1. Open the post-processing panel in the UI
2. Enable "Post-Processing"
3. Enable "Ambient Occlusion (AO)"
4. Check if the black screen persists

### Step 3: Interpret Results
- **If AO works (no black screen):** Shadow maps are interfering with SAOPass
- **If AO still black:** Issue is elsewhere (materials, pass order, or depth texture)

### Step 4: Re-enable Shadow Maps
```javascript
window.__testAOWithoutShadows = false
```

## Comprehensive Testing

### Run Debugging Script
1. Load `test-ao-debugging.js` in browser console
2. Run: `window.testAODebugging()`
3. Review all test results

### Individual Tests
```javascript
// Check pass order
window.testAOPassOrder()

// Disable shadow maps for testing
window.testAOShadowMaps()

// Check material properties
window.testAOMaterials()
```

## What to Look For

### Console Warnings
- `⚠️ readBuffer.depthTexture is missing` - Depth texture not being created
- `⚠️ CONFLICT: AO pass exists but is not in composer passes array` - Pass order issue
- `🧪 TEST MODE: Shadow maps disabled for AO testing` - Test mode active

### Expected Behavior
- AO should add subtle darkening in corners and crevices
- Should NOT cause entire model to turn black
- Should work with or without shadow maps (if shadow maps are the issue, disabling them should fix it)

## Next Steps Based on Results

### If Shadow Maps Are the Issue
- Need to ensure shadow maps don't interfere with depth texture
- May need to render shadows separately
- May need to adjust shadow map configuration

### If Materials Are the Issue
- Check for materials with `alphaTest` set
- Verify all opaque materials have `depthWrite: true`
- Check for transparent materials interfering

### If Pass Order Is Wrong
- Verify SAOPass is second pass (after RenderPass)
- Check that no other passes are inserted between RenderPass and SAOPass

### If Depth Texture Is Missing
- Verify render target has `depthBuffer: true`
- Check if EffectComposer is creating depth texture
- May need to explicitly create depth texture












