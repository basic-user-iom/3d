# AO Test Execution - Current Status

## ✅ All Code Changes Implemented

### 1. Auto-Run Test Function
**Location:** `src/App.tsx` (lines ~251-340)

**What it does:**
- Exposes `window.runAOTests()` function
- Runs 6 comprehensive tests
- Auto-executes when URL parameter `?runAOTests=true` is present
- Waits 2 seconds after viewer initialization

### 2. Test Coverage
- ✅ Test 1: Post-Processing Status
- ✅ Test 2: Pass Order Verification
- ✅ Test 3: Shadow Maps Status
- ✅ Test 4: Depth Texture Verification
- ✅ Test 5: Enable AO (with visual check prompt)
- ✅ Test 6: Test with Shadow Maps Disabled

### 3. Fixes Implemented
- ✅ Shadow map test mode (`window.__testAOWithoutShadows`)
- ✅ Depth texture verification
- ✅ Enhanced logging

## Current Execution Status

**Page URL:** http://localhost:3000?runAOTests=true
**Status:** Page loading, waiting for viewer initialization

**Console Messages Seen:**
- ✅ Vite connecting
- ✅ Vite connected
- ⏳ Waiting for viewer initialization
- ⏳ Waiting for test execution

## Expected Behavior

When the page fully loads:
1. Viewer will initialize
2. `onViewerReady` callback will fire
3. `window.runAOTests` will be registered
4. Auto-run will trigger after 2 seconds
5. Tests will execute and log to console

## If Tests Don't Auto-Run

### Option 1: Manual Execution
Open browser console (F12) and run:
```javascript
window.runAOTests()
```

### Option 2: Check Viewer Status
```javascript
// Check if viewer is ready
console.log('Viewer:', window.__viewer)
console.log('Post-processing:', window.__viewer?.postProcessingSystem)
console.log('Test function:', window.runAOTests)
```

### Option 3: Force Execution
```javascript
// Wait for viewer and run
const check = setInterval(() => {
  if (window.__viewer && window.runAOTests) {
    clearInterval(check)
    window.runAOTests()
  }
}, 500)
```

## What to Look For

### Console Output Should Show:
```
[AOTests] Auto-running AO tests...
=== AO Tests Starting ===
✅ Viewer found
=== Test 1: Post-Processing Status ===
...
=== Test 6: Testing with Shadow Maps Disabled ===
✅ Shadow maps disabled (test mode) - CHECK IF AO WORKS NOW
=== Tests Complete ===
```

### Visual Checks:
1. **Before AO:** Model looks normal
2. **After Test 5:** Check if model turns black (BUG) or normal (WORKING)
3. **After Test 6:** Check if AO works when shadow maps disabled

## Screenshots to Capture

1. **Console Output** - All test results
2. **3D View - Initial** - Before any changes
3. **3D View - AO Enabled** - After Test 5
4. **3D View - Shadow Maps Disabled** - After Test 6

## Summary

✅ **All code is in place**
✅ **Tests are set to auto-run**
✅ **Waiting for page/viewer to fully initialize**

The tests will execute automatically once the viewer is ready. If they don't auto-run, use the manual execution options above.

## Next Steps

1. Wait for page to fully load (may take 10-30 seconds)
2. Check browser console for test output
3. Take screenshots as indicated
4. Document results
