# Auto-Run Test Instructions

Since I cannot directly execute JavaScript in the browser console, here's how to automatically run the tests:

## Method 1: Browser Console (Manual)

1. Open browser console (F12)
2. Paste this command:

```javascript
window.postProcessingTests.runAllTests()
```

## Method 2: Inject Script via Console

Paste this into the browser console to auto-run:

```javascript
(function() {
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
  console.log('✅ All systems ready! Running tests...\n');
  window.postProcessingTests.runAllTests();
})();
```

## Method 3: Bookmarklet

Create a bookmark with this URL (paste in browser console first to test):

```javascript
javascript:(function(){const v=window.__viewer||window.sharedViewer;if(!v){alert('Viewer not found');return;}if(!v.postProcessingSystem){alert('Post-processing not found');return;}if(!window.postProcessingTests){alert('Test suite not loaded');return;}window.postProcessingTests.runAllTests();})();
```

## Current Status

✅ App loaded at http://localhost:3000
✅ Test suite loaded: `window.postProcessingTests`
✅ Post-processing system initialized
✅ Model loaded (Pagani Utopia 2023)

**Ready to test!** Just run the command in the browser console.


























