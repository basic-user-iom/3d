// Test script to enable AO and capture logs
// Run this in browser console

console.log('=== Starting AO Test ===');

// Get the store
const store = window.__ZUSTAND_STORE__ || (window.useAppStore && window.useAppStore.getState());

if (!store) {
  console.error('Store not found. Trying alternative method...');
  // Try to find store via React DevTools or direct access
  const reactRoot = document.querySelector('#root')._reactRootContainer || document.querySelector('#root')._reactInternalFiber;
  console.log('React root:', reactRoot);
}

// Enable post-processing first
if (store && store.setPostProcessingEnabled) {
  console.log('Enabling post-processing...');
  store.setPostProcessingEnabled(true);
  
  // Wait a bit then enable AO
  setTimeout(() => {
    console.log('Enabling AO...');
    if (store.setAoEnabled) {
      store.setAoEnabled(true);
      console.log('✅ AO enabled via store');
    } else {
      console.error('setAoEnabled not found in store');
    }
  }, 500);
} else {
  console.error('Store not accessible. Please enable AO manually in the UI.');
  console.log('Look for "Rendering Quality" panel and enable "Enable AO" checkbox');
}

console.log('=== AO Test Complete ===');
console.log('Check console for any errors related to SAOPass or depth texture');












