// JavaScript to enable post-processing and AO for testing
// Run this in browser console

console.log('=== Enabling Post-Processing and AO ===');

// Try to access Zustand store
// The store might be accessible via React DevTools or window
let store = null;

// Method 1: Try direct window access (if exposed)
if (typeof window !== 'undefined') {
  // Try to find the store via React
  const root = document.querySelector('#root');
  if (root) {
    // Try to access via React Fiber
    const fiber = root._reactRootContainer?._internalRoot?.current;
    if (fiber) {
      console.log('Found React Fiber, trying to access store...');
    }
  }
  
  // Try common Zustand patterns
  if (window.useAppStore) {
    store = window.useAppStore.getState();
    console.log('✅ Found store via window.useAppStore');
  } else {
    // Try to find it in React component
    console.log('Store not directly accessible. Please enable manually:');
    console.log('1. Click "⚙️ Quality" button in toolbar');
    console.log('2. Enable "Post-Processing Enabled" checkbox');
    console.log('3. Enable "Enable AO" checkbox under Ambient Occlusion section');
  }
}

if (store) {
  try {
    // Enable post-processing
    if (store.setPostProcessingEnabled) {
      console.log('Enabling post-processing...');
      store.setPostProcessingEnabled(true);
      
      // Wait then enable AO
      setTimeout(() => {
        if (store.setAoEnabled) {
          console.log('Enabling AO...');
          store.setAoEnabled(true);
          console.log('✅ AO enabled! Check console for logs.');
        }
      }, 1000);
    }
  } catch (error) {
    console.error('Error enabling AO:', error);
  }
} else {
  console.log('⚠️ Could not access store. Please enable manually in UI.');
}












