# AO Test Execution - Complete Setup

## ✅ Auto-Run Tests Implemented

### What Was Done:
1. ✅ Added `runAOTests()` function to `window` object in `App.tsx`
2. ✅ Added auto-run capability via URL parameter `?runAOTests=true`
3. ✅ Tests will automatically run 2 seconds after viewer is ready

### How to Run Tests:

#### Method 1: URL Parameter (Auto-Run)
Navigate to: **http://localhost:3000?runAOTests=true**

Tests will automatically run when the viewer is ready.

#### Method 2: Manual Execution
1. Open http://localhost:3000
2. Press F12 (open console)
3. Run: `window.runAOTests()`

### What the Tests Do:

1. **Test 1: Post-Processing Status**
   - Checks if post-processing is enabled
   - Checks if AO is enabled
   - Checks if AO pass exists

2. **Test 2: Pass Order**
   - Verifies RenderPass is at index 0
   - Verifies SAOPass is at index 1 (immediately after RenderPass)
   - Reports if pass order is correct or wrong

3. **Test 3: Shadow Maps**
   - Checks if shadow maps are enabled
   - Reports shadow map type

4. **Test 4: Depth Texture**
   - Verifies readBuffer exists
   - Verifies depthTexture exists on readBuffer
   - Warns if depth texture is missing

5. **Test 5: Enable AO**
   - Enables post-processing
   - Enables AO
   - **CHECK 3D VIEW FOR BLACK SCREEN**

6. **Test 6: Test with Shadow Maps Disabled**
   - Sets `window.__testAOWithoutShadows = true`
   - Shadow maps will be disabled on next render
   - **CHECK IF AO WORKS NOW**

### Expected Console Output:

```
[AOTests] Auto-running AO tests...
=== AO Tests Starting ===
✅ Viewer found
=== Test 1: Post-Processing Status ===
Post-processing enabled: false
AO enabled: false
AO pass exists: false
=== Test 2: Pass Order ===
⚠️ SAOPass not found (may not be enabled)
=== Test 3: Shadow Maps ===
Shadow maps enabled: true
Shadow map type: 2
=== Test 4: Depth Texture ===
⚠️ Composer not found (post-processing not enabled yet)
=== Test 5: Enabling AO ===
✅ Post-processing and AO enabled - CHECK 3D VIEW FOR BLACK SCREEN
=== Test 6: Testing with Shadow Maps Disabled ===
✅ Shadow maps disabled (test mode) - CHECK IF AO WORKS NOW
=== Tests Complete ===
```

### Visual Checks:

1. **Before Tests:** Model should look normal
2. **After Test 5:** Check if model turns black (BUG) or looks normal (WORKING)
3. **After Test 6:** Check if AO works when shadow maps are disabled

### Screenshots to Take:

1. **Console Output** - All test results
2. **3D View Before AO** - Initial state
3. **3D View After AO Enabled** - Check for black screen
4. **3D View After Shadow Maps Disabled** - Check if AO works

### Next Steps:

1. Navigate to http://localhost:3000?runAOTests=true
2. Wait for tests to complete (check console)
3. Take screenshots
4. Document results

## Status: ✅ Ready to Test

All code is in place. Just navigate to the URL with the parameter and the tests will run automatically!












