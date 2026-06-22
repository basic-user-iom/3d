// Test script to enable post-processing and AO, then capture logs
console.log('=== Starting AO Test ===');

// Try to access the Zustand store
let store = null;

// Method 1: Try window access
if (window.useAppStore) {
  store = window.useAppStore.getState();
  console.log('✅ Found store via window.useAppStore');
} else if (window.__ZUSTAND_STORE__) {
  store = window.__ZUSTAND_STORE__;
  console.log('✅ Found store via window.__ZUSTAND_STORE__');
} else {
  // Method 2: Try React DevTools
  const root = document.querySelector('#root');
  if (root && root._reactRootContainer) {
    console.log('Found React root, but store access not available');
  }
  console.warn('⚠️ Store not accessible. Please enable post-processing and AO manually in the UI.');
  console.log('Look for "Rendering Quality" panel and enable:');
  console.log('1. Post-Processing Enabled checkbox');
  console.log('2. Ambient Occlusion (AO) -> Enable AO checkbox');
}

if (store) {
  console.log('Enabling post-processing...');
  if (store.setPostProcessingEnabled) {
    store.setPostProcessingEnabled(true);
    console.log('✅ Post-processing enabled');
    
    // Wait a bit then enable AO
    setTimeout(() => {
      console.log('Enabling AO...');
      if (store.setAoEnabled) {
        store.setAoEnabled(true);
        console.log('✅ AO enabled');
        console.log('=== AO Test Complete ===');
        console.log('Check console for any errors related to SAOPass or depth texture');
      } else {
        console.error('❌ setAoEnabled not found in store');
      }
    }, 500);
  } else {
    console.error('❌ setPostProcessingEnabled not found in store');
  }
}












