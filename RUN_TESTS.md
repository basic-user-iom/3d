# How to Run Post-Processing Tests

## Method 1: Browser Console (Recommended)

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Open your app in the browser:**
   - Usually at `http://localhost:5173` or check your terminal for the port

3. **Open Browser Console:**
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Or `Cmd+Option+I` (Mac)
   - Go to the "Console" tab

4. **Run the tests:**
   ```javascript
   // Check if test suite is loaded
   window.postProcessingTests
   
   // Run all tests
   window.postProcessingTests.runAllTests()
   
   // Or run individual tests
   window.postProcessingTests.testShadowMaps()
   window.postProcessingTests.testColorSpace()
   ```

## Method 2: Test HTML Page

1. **Open the test page:**
   - Open `test-post-processing.html` in your browser
   - Or navigate to: `http://localhost:5173/test-post-processing.html`

2. **Click buttons:**
   - "Check Viewer Connection" - Verifies viewer is available
   - "Run All Tests" - Runs all 7 tests
   - "Run Individual Tests" - Runs tests one by one

3. **View results:**
   - Results display on the page
   - Also check browser console for detailed logs

## Method 3: Direct Console Commands

If the test suite is loaded, you can run these directly in the console:

```javascript
// Quick check
const viewer = window.__viewer || window.sharedViewer;
console.log('Viewer:', viewer);
console.log('Post-Processing:', viewer?.postProcessingSystem);

// Run all tests
window.postProcessingTests.runAllTests();

// Individual tests
window.postProcessingTests.testShadowMaps();
window.postProcessingTests.testColorSpace();
window.postProcessingTests.testSSSIntensity();
window.postProcessingTests.testSSRCameraMatrices();
window.postProcessingTests.testMemoryLeaks();
window.postProcessingTests.testTextureUpdates();
window.postProcessingTests.testPassOrderStability();
```

## Troubleshooting

### "Viewer not found"
- Make sure the app is fully loaded
- Load a scene/model first
- Check that viewer is initialized

### "Test suite not loaded"
- Check browser console for errors
- Verify `src/utils/postProcessingTestSuite.ts` is imported
- Look for: `✅ Post-processing test suite loaded`

### "Post-processing system not found"
- Enable post-processing in the UI
- Check that PostProcessingSystem was initialized
- Look for: `[PostProcessingSystem] Initialized Post-Processing System`

## Expected Output

When tests run successfully, you should see:

```
🧪 Running Post-Processing Test Suite...

=== Test 1: Shadow Map Preservation ===
Shadow maps enabled: true
Render target depth buffer: true
✅ Visual check: Shadows should be visible in scene

=== Test 2: Color Space and Tone Mapping ===
Output color space: 100903
Color space correct: true
Pass order correct: true
✅ Visual check: Colors should be vibrant, not washed out

... (more tests)

=== Test Results Summary ===
[Table showing all test results]

✅ Passed: 7/7
```

## Quick Test Command

Copy and paste this into your browser console:

```javascript
(async () => {
  const viewer = window.__viewer || window.sharedViewer;
  if (!viewer) {
    console.error('❌ Viewer not found');
    return;
  }
  if (!viewer.postProcessingSystem) {
    console.error('❌ Post-processing system not found');
    return;
  }
  if (!window.postProcessingTests) {
    console.error('❌ Test suite not loaded');
    return;
  }
  console.log('✅ All systems ready! Running tests...');
  window.postProcessingTests.runAllTests();
})();
```


























