# Manual Test Execution Guide

## Prerequisites
- Dev server running at http://localhost:3000
- Browser with developer tools (F12)

## Test Procedure

### Step 1: Initial State Check
1. Open http://localhost:3000 in browser
2. Press F12 to open developer tools
3. Go to Console tab
4. Take screenshot of initial 3D view
5. Note: Post-processing should be disabled by default

### Step 2: Enable Post-Processing via UI
1. Look for "Rendering Quality" panel in the UI (usually on the right side)
2. Find "Post-Processing" section
3. Check "Enable Post-Processing" checkbox
4. Take screenshot of 3D view
5. Check console for any errors

### Step 3: Enable AO via UI
1. In the same panel, find "Ambient Occlusion (AO)" section
2. Check "Enable AO" checkbox
3. **CRITICAL:** Take screenshot immediately - check if model turns black
4. Check console for warnings

### Step 4: Run Console Tests
Copy and paste this into browser console:

```javascript
// Complete AO Test
(async function() {
  console.log('=== AO Tests Starting ===\n')
  
  const viewer = window.__viewer
  if (!viewer) {
    console.error('❌ Viewer not found')
    return
  }
  
  const pp = viewer.postProcessingSystem
  if (!pp) {
    console.error('❌ Post-processing not found')
    return
  }
  
  // Test 1: Status
  console.log('=== Test 1: Status ===')
  console.log('Post-processing enabled:', pp.config?.enabled)
  console.log('AO enabled:', pp.config?.ao?.enabled)
  console.log('AO pass exists:', !!pp.aoPass)
  
  // Test 2: Pass Order
  console.log('\n=== Test 2: Pass Order ===')
  if (pp.composer) {
    const passes = pp.composer.passes
    const passNames = passes.map(p => p.constructor.name)
    console.log('Pass order:', passNames)
    const renderIndex = passNames.indexOf('RenderPass')
    const saoIndex = passNames.indexOf('SAOPass')
    console.log('RenderPass index:', renderIndex)
    console.log('SAOPass index:', saoIndex)
    if (saoIndex === renderIndex + 1) {
      console.log('✅ Pass order CORRECT')
    } else {
      console.error('❌ Pass order WRONG')
    }
  }
  
  // Test 3: Shadow Maps
  console.log('\n=== Test 3: Shadow Maps ===')
  console.log('Shadow maps enabled:', viewer.renderer.shadowMap.enabled)
  
  // Test 4: Depth Texture
  console.log('\n=== Test 4: Depth Texture ===')
  if (pp.composer) {
    const composerAny = pp.composer
    if (composerAny.readBuffer) {
      console.log('readBuffer exists: ✅')
      console.log('depthTexture exists:', !!composerAny.readBuffer.depthTexture)
      if (!composerAny.readBuffer.depthTexture) {
        console.warn('⚠️ depthTexture MISSING!')
      }
    }
  }
  
  // Test 5: Test with Shadow Maps Disabled
  console.log('\n=== Test 5: Disable Shadow Maps ===')
  window.__testAOWithoutShadows = true
  console.log('✅ Shadow maps will be disabled on next render')
  console.log('Check 3D view - does AO work now?')
  
  console.log('\n=== Tests Complete ===')
  console.log('Check 3D view and console for results')
})()
```

### Step 5: Test with Shadow Maps Disabled
1. After running the script, check the 3D view
2. Does the model still appear black?
3. If AO works now (no black screen), shadow maps are the issue
4. Take screenshot

### Step 6: Re-enable Shadow Maps
```javascript
window.__testAOWithoutShadows = false
```

## What to Capture

### Screenshots
1. **01-initial-state.png** - Before enabling anything
2. **02-post-processing-enabled.png** - After enabling post-processing
3. **03-ao-enabled.png** - After enabling AO (check for black screen)
4. **04-console-output.png** - Console with test results
5. **05-shadow-maps-disabled.png** - With shadow maps disabled

### Console Logs
- Copy all console output
- Look for warnings about depth texture
- Look for pass order information
- Look for any errors

## Expected Results

### If Shadow Maps Are the Issue
- AO works when shadow maps are disabled
- Black screen appears when shadow maps are enabled
- Console shows depth texture exists

### If Pass Order Is Wrong
- Console shows SAOPass is not immediately after RenderPass
- Console shows incorrect pass order

### If Depth Texture Is Missing
- Console shows warning: "readBuffer.depthTexture is missing"
- This indicates EffectComposer is not creating depth texture

### If Materials Are the Issue
- Console shows materials with problematic properties
- May need to check specific materials

## Next Steps Based on Results

1. **If shadow maps are the issue:** Need to fix shadow map interference
2. **If pass order is wrong:** Need to fix pass order
3. **If depth texture is missing:** Need to ensure depth texture is created
4. **If materials are the issue:** Need to fix material properties












