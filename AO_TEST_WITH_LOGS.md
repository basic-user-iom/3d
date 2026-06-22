# AO Test - Attempting to Enable and Capture Logs

## Current Status
- Post-processing: DISABLED
- Need to enable manually or via console

## Attempting Methods

### Method 1: Use Post-Processing Test Suite
The test suite has logic to auto-enable post-processing:
```javascript
window.postProcessingTests.runAllTests()
```

### Method 2: Manual UI
1. Click "⚙️ Quality" button in toolbar
2. Enable "Post-Processing Enabled" checkbox  
3. Enable "Enable AO" checkbox

### Method 3: Direct Store Access (if available)
```javascript
// Try to access store
const store = window.useAppStore?.getState();
if (store) {
  store.setPostProcessingEnabled(true);
  setTimeout(() => store.setAoEnabled(true), 1000);
}
```

## Expected Logs When AO Enabled
- `[PostProcessingSystem] ✅ Depth texture available for SAOPass`
- `[PostProcessingSystem] ✅ Depth texture connected to composer readBuffer for SAOPass`
- `[PostProcessingSystem] ✅ SAOPass render method overridden`
- `[PostProcessingSystem] ✅ AO pass added successfully`
- `[PostProcessingSystem] AO state check: {...}`

## Issues to Check
1. Does black screen occur?
2. Any WebGL errors?
3. Is depth texture properly connected?
4. Are there any SAOPass-specific errors?












