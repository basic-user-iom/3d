# Post-Processing Test Suite

## Overview
This test suite validates the post-processing system implementation, including shadow preservation, color space handling, and performance optimizations.

## Running the Tests

### Method 1: Browser Console (Recommended)
Once the app is running, open the browser console and run:

```javascript
window.postProcessingTests.runAllTests()
```

### Method 2: Individual Tests
You can also run individual tests:

```javascript
// Test shadow map preservation
window.postProcessingTests.testShadowMaps()

// Test color space and tone mapping
window.postProcessingTests.testColorSpace()

// Test SSS shadow intensity
window.postProcessingTests.testSSSIntensity()

// Test SSR camera matrices
window.postProcessingTests.testSSRCameraMatrices()

// Test memory leaks
window.postProcessingTests.testMemoryLeaks()

// Test texture updates
window.postProcessingTests.testTextureUpdates()

// Test pass order stability
window.postProcessingTests.testPassOrderStability()
```

## Test Descriptions

### Test 1: Shadow Map Preservation
- **Purpose**: Verifies that shadow maps are preserved when post-processing is enabled
- **Checks**:
  - Shadow maps are enabled on renderer
  - Render target has depth buffer
- **Visual Check**: Shadows should be visible in the scene

### Test 2: Color Space and Tone Mapping
- **Purpose**: Validates color space setup and pass order
- **Checks**:
  - Output color space is LinearSRGBColorSpace
  - Pass order: Render → ToneMapping → LUT → ColorGrading → Output
- **Visual Check**: Colors should be vibrant, not washed out

### Test 3: SSS Shadow Intensity
- **Purpose**: Verifies SSS shadow intensity is applied correctly (not twice)
- **Checks**:
  - Intensity uniform value matches expected value
- **Visual Check**: Shadows should not be too dark

### Test 4: SSR Camera Matrices
- **Purpose**: Ensures SSR camera matrices update correctly
- **Checks**:
  - Projection matrix inverse matches camera
  - View matrix inverse matches camera
- **Note**: Moves camera temporarily, then restores it

### Test 5: Memory Leaks
- **Purpose**: Checks for memory leaks in post-processing system
- **Checks**:
  - All passes are properly disposed
  - Render targets are cleaned up
- **Note**: Memory check may take time (1 second delay)

### Test 6: Texture Updates
- **Purpose**: Validates texture connections and dimensions
- **Checks**:
  - Depth texture is connected to SSS pass
  - Texture dimensions match renderer dimensions

### Test 7: Pass Order Stability
- **Purpose**: Ensures pass order remains correct when enabling/disabling effects
- **Checks**:
  - RenderPass is first
  - OutputPass is last
  - ToneMapping comes before LUT

## Expected Results

All tests should return `true` when the post-processing system is working correctly.

## Troubleshooting

### Viewer Not Found
If you see "Viewer not found", ensure:
1. The app is fully loaded
2. A scene/model is loaded
3. The viewer is initialized

The test suite tries multiple ways to access the viewer:
- `window.__viewer`
- `window.sharedViewer`
- `window.viewerRef?.current`

### Post-Processing System Not Found
If you see "Post-processing system not found":
1. Ensure post-processing is enabled in the UI
2. Check that the PostProcessingSystem was initialized

### THREE Not Defined
If you see errors about THREE:
- The test suite should handle this automatically
- THREE is typically available globally when using Three.js

## Integration

The test suite is automatically loaded when the viewer is ready. You should see this message in the console:

```
✅ Post-processing test suite loaded. Run window.postProcessingTests.runAllTests() to test.
```

## Files

- **TypeScript Version**: `src/utils/postProcessingTestSuite.ts` (integrated into app)
- **JavaScript Version**: `POST_PROCESSING_TEST_SUITE.js` (standalone, can be pasted into console)

Both versions are functionally equivalent.


























