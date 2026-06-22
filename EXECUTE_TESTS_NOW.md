# Execute AO Tests Now - Quick Guide

## ✅ All Code Ready

The test function is implemented and ready to run. Here's how to execute it:

## Method 1: Auto-Run (Recommended)

1. **Navigate to:** http://localhost:3000?runAOTests=true
2. **Wait** for page to fully load (30-60 seconds)
3. **Open Console** (F12) to see test output
4. **Check 3D view** for visual results

## Method 2: Manual Execution

1. **Navigate to:** http://localhost:3000
2. **Wait** for page to load
3. **Open Console** (F12)
4. **Run this command:**
   ```javascript
   window.runAOTests()
   ```

## Method 3: Force Execution (If Viewer Not Ready)

If the viewer isn't ready yet, use this:

```javascript
// Wait for viewer and run tests
const checkViewer = setInterval(() => {
  if (window.__viewer && window.__viewer.postProcessingSystem) {
    clearInterval(checkViewer);
    if (window.runAOTests) {
      window.runAOTests();
    } else {
      console.error('runAOTests function not found');
    }
  }
}, 500);

// Timeout after 30 seconds
setTimeout(() => {
  clearInterval(checkViewer);
  console.warn('Timeout waiting for viewer');
}, 30000);
```

## What You'll See

### Console Output:
- Test 1: Post-Processing Status
- Test 2: Pass Order
- Test 3: Shadow Maps
- Test 4: Depth Texture
- Test 5: AO Enabled (check 3D view!)
- Test 6: Shadow Maps Disabled (check 3D view!)

### Visual Checks:
1. **Before AO:** Normal model appearance
2. **After Test 5:** Check for black screen (BUG) or normal (WORKING)
3. **After Test 6:** Check if AO works with shadow maps disabled

## Quick Test Commands

```javascript
// Check if everything is ready
console.log('Viewer:', !!window.__viewer);
console.log('Post-processing:', !!window.__viewer?.postProcessingSystem);
console.log('Test function:', !!window.runAOTests);

// Run tests
window.runAOTests();

// Check current state
const pp = window.__viewer?.postProcessingSystem;
console.log('Post-processing enabled:', pp?.config?.enabled);
console.log('AO enabled:', pp?.config?.ao?.enabled);
```

## Expected Results

### If Shadow Maps Are the Issue:
- ✅ AO works when shadow maps disabled
- ❌ Black screen when shadow maps enabled
- **Solution:** Fix shadow map interference

### If Pass Order Is Wrong:
- ❌ Console shows incorrect pass order
- **Solution:** Verify pass insertion logic

### If Depth Texture Missing:
- ❌ Console shows "depthTexture is missing"
- **Solution:** Ensure EffectComposer creates depth texture

## Status Check

Run this to see current status:
```javascript
const viewer = window.__viewer;
if (viewer) {
  console.log('✅ Viewer ready');
  const pp = viewer.postProcessingSystem;
  if (pp) {
    console.log('✅ Post-processing ready');
    console.log('Enabled:', pp.config?.enabled);
    console.log('AO enabled:', pp.config?.ao?.enabled);
  } else {
    console.log('⏳ Post-processing not ready yet');
  }
} else {
  console.log('⏳ Viewer not ready yet');
}
```

## Ready to Test! 🚀

All code is in place. Just run `window.runAOTests()` in the console or navigate to the URL with the parameter.
