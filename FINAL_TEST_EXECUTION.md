# Final AO Test Execution Guide

## Quick Start

### Step 1: Open Browser Console
1. Navigate to http://localhost:3000
2. Press **F12** to open Developer Tools
3. Go to **Console** tab

### Step 2: Copy and Paste This Script

```javascript
// Complete AO Test Script
(function() {
  console.log('%c=== AO Tests Starting ===', 'font-size: 16px; font-weight: bold; color: #4a9eff;');
  
  const viewer = window.__viewer;
  if (!viewer) {
    console.error('❌ Viewer not found');
    return;
  }
  console.log('✅ Viewer found');
  
  const pp = viewer.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found');
    return;
  }
  
  // Test 1: Status
  console.log('%c=== Test 1: Post-Processing Status ===', 'font-weight: bold;');
  console.log('Post-processing enabled:', pp.config?.enabled);
  console.log('AO enabled:', pp.config?.ao?.enabled);
  console.log('AO pass exists:', !!pp.aoPass);
  
  // Test 2: Pass Order
  console.log('%c=== Test 2: Pass Order ===', 'font-weight: bold;');
  if (pp.composer) {
    const passes = pp.composer.passes;
    const passNames = passes.map(p => p.constructor.name);
    console.log('Pass order:', passNames);
    
    const renderIndex = passNames.indexOf('RenderPass');
    const saoIndex = passNames.indexOf('SAOPass');
    
    if (renderIndex === -1) {
      console.error('❌ RenderPass not found!');
    } else {
      console.log('✅ RenderPass found at index:', renderIndex);
    }
    
    if (saoIndex === -1) {
      console.warn('⚠️ SAOPass not found (may not be enabled)');
    } else {
      console.log('✅ SAOPass found at index:', saoIndex);
      if (saoIndex === renderIndex + 1) {
        console.log('✅ Pass order is CORRECT');
      } else {
        console.error('❌ Pass order is WRONG! Expected SAOPass at', renderIndex + 1, 'but found at', saoIndex);
      }
    }
  }
  
  // Test 3: Shadow Maps
  console.log('%c=== Test 3: Shadow Maps ===', 'font-weight: bold;');
  const renderer = viewer.renderer;
  if (renderer) {
    console.log('Shadow maps enabled:', renderer.shadowMap.enabled);
    console.log('Shadow map type:', renderer.shadowMap.type);
  }
  
  // Test 4: Depth Texture
  console.log('%c=== Test 4: Depth Texture ===', 'font-weight: bold;');
  if (pp.composer) {
    const composerAny = pp.composer;
    if (composerAny.readBuffer) {
      console.log('✅ readBuffer exists');
      const hasDepthTexture = !!composerAny.readBuffer.depthTexture;
      console.log('Depth texture exists:', hasDepthTexture);
      if (!hasDepthTexture) {
        console.error('⚠️ WARNING: readBuffer.depthTexture is missing - SAOPass may not work!');
      }
    } else {
      console.error('❌ readBuffer not found');
    }
  }
  
  // Test 5: Enable AO
  console.log('%c=== Test 5: Enabling AO ===', 'font-weight: bold;');
  pp.updateConfig({ enabled: true });
  pp.updateConfig({ ao: { ...pp.config.ao, enabled: true } });
  console.log('✅ Post-processing and AO enabled - CHECK 3D VIEW FOR BLACK SCREEN');
  
  // Test 6: Test with shadow maps disabled
  console.log('%c=== Test 6: Testing with Shadow Maps Disabled ===', 'font-weight: bold;');
  window.__testAOWithoutShadows = true;
  console.log('✅ Shadow maps disabled (test mode) - CHECK IF AO WORKS NOW');
  
  console.log('%c=== Tests Complete ===', 'font-size: 16px; font-weight: bold; color: #4a9eff;');
  console.log('Check the 3D view to see if AO is working or causing black screen');
  console.log('To re-enable shadow maps: window.__testAOWithoutShadows = false');
  
  return {
    viewerFound: true,
    postProcessingEnabled: pp.config?.enabled,
    aoEnabled: pp.config?.ao?.enabled,
    aoPassExists: !!pp.aoPass,
    shadowMapsEnabled: renderer?.shadowMap?.enabled,
    testModeActive: window.__testAOWithoutShadows === true
  };
})();
```

### Step 3: Take Screenshots

After running the script, take screenshots of:

1. **Console Output** - All test results
2. **3D View with AO Enabled** - Check for black screen
3. **3D View with Shadow Maps Disabled** - Check if AO works

## What to Look For

### Console Output Should Show:
- ✅ Viewer found
- ✅ Post-processing enabled: true
- ✅ AO enabled: true
- ✅ AO pass exists: true
- ✅ Pass order is CORRECT (RenderPass at 0, SAOPass at 1)
- ✅ Depth texture exists: true

### Visual Check:
- **Before AO:** Model should look normal
- **After AO Enabled:** 
  - ❌ **Black screen** = BUG (this is what we're testing)
  - ✅ **Normal with subtle darkening** = WORKING
- **After Shadow Maps Disabled:**
  - ✅ **AO works** = Shadow maps are the issue
  - ❌ **Still black** = Issue is elsewhere

## Test Results Template

```
## Test Results - [Date]

### Test 1: Post-Processing Status
- Post-processing enabled: [true/false]
- AO enabled: [true/false]
- AO pass exists: [true/false]

### Test 2: Pass Order
- RenderPass index: [number]
- SAOPass index: [number]
- Pass order: [CORRECT/WRONG]

### Test 3: Shadow Maps
- Shadow maps enabled: [true/false]
- Shadow map type: [type]

### Test 4: Depth Texture
- readBuffer exists: [true/false]
- depthTexture exists: [true/false]

### Test 5: Visual Check (AO Enabled)
- Model appearance: [Normal/Black Screen/Other]

### Test 6: Visual Check (Shadow Maps Disabled)
- Model appearance: [Normal/Black Screen/Other]
- Conclusion: [Shadow maps are the issue/Issue is elsewhere]

## Screenshots
- [Attach screenshots here]
```

## Next Steps Based on Results

### If Shadow Maps Are the Issue:
- AO works when shadow maps disabled
- Need to fix shadow map interference with depth texture

### If Pass Order Is Wrong:
- Console shows incorrect pass order
- Need to verify pass insertion logic

### If Depth Texture Is Missing:
- Console shows "depthTexture is missing"
- Need to ensure EffectComposer creates depth texture

### If Materials Are the Issue:
- Console shows problematic materials
- Need to fix material properties

## Files Available

- `inject-test-script.js` - Complete test script (copy contents)
- `test-ao-debugging.js` - Comprehensive debugging script
- `run-ao-tests.js` - Automated test script
- `MANUAL_TEST_EXECUTION.md` - Detailed step-by-step guide












