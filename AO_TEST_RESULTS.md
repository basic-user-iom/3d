# AO Test Results

## Test Execution Date
2025-12-19

## Test Script
The test script `run-ao-tests.js` has been created and is ready to run in the browser console.

## How to Run Tests

### Step 1: Open Browser Console
1. Navigate to http://localhost:3000
2. Press F12 to open developer tools
3. Go to Console tab

### Step 2: Load and Run Test Script
Copy and paste the contents of `run-ao-tests.js` into the console, or run:

```javascript
// Quick test - enable post-processing and AO
const viewer = window.__viewer
if (viewer && viewer.postProcessingSystem) {
  const pp = viewer.postProcessingSystem
  pp.updateConfig({ enabled: true })
  pp.updateConfig({ ao: { ...pp.config.ao, enabled: true } })
  console.log('✅ Post-processing and AO enabled')
}
```

### Step 3: Test with Shadow Maps Disabled
```javascript
window.__testAOWithoutShadows = true
// Check if AO works now (no black screen)
```

### Step 4: Check Results
- Look at the 3D view - is the model black or normal?
- Check console for warnings about depth texture
- Check console for pass order information

## Expected Test Results

### Test 1: Post-Processing Status
- Should show post-processing enabled
- Should show AO enabled
- Should show AO pass exists

### Test 2: Pass Order
- Should show RenderPass at index 0
- Should show SAOPass at index 1 (immediately after RenderPass)
- Pass order should be CORRECT

### Test 3: Shadow Maps
- Should show shadow maps enabled
- Can test with `window.__testAOWithoutShadows = true`

### Test 4: Depth Texture
- Should show readBuffer exists
- Should show readBuffer.depthTexture exists
- If missing, will show warning

### Test 5: Material Properties
- Should show total materials count
- Should show materials with alphaTest
- Should show materials with depthTest=false
- Should show opaque materials with depthWrite=false

### Test 6: AO Enabled
- Should enable post-processing if not enabled
- Should enable AO if not enabled
- Should show AO is active

### Test 7: Shadow Maps Disabled Test
- Should set `window.__testAOWithoutShadows = true`
- Shadow maps will be disabled on next render
- Check if AO works (no black screen)

## Screenshots to Capture

1. **Initial State** - Before enabling AO
2. **With AO Enabled** - After enabling AO (check for black screen)
3. **Console Output** - All test results
4. **With Shadow Maps Disabled** - After setting test mode
5. **Console Warnings** - Any depth texture warnings

## Notes

- The test script will automatically enable post-processing and AO if they're not enabled
- The test script will set shadow map test mode
- Check the 3D view after each test to see if black screen persists
- Console will show detailed information about pass order, depth texture, and materials












