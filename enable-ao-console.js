// Script to enable post-processing and AO from browser console
// This will be injected into the browser

console.log('=== Enabling Post-Processing and AO ===');

// Try to access Zustand store
let store = null;

// Method 1: Check if useAppStore is exposed on window
if (typeof window !== 'undefined' && (window as any).useAppStore) {
  store = (window as any).useAppStore.getState();
  console.log('✅ Found store via window.useAppStore');
}

// Method 2: Try React DevTools path
if (!store) {
  const root = document.querySelector('#root');
  if (root) {
    // Try to access React internals
    const reactRoot = (root as any)._reactRootContainer || (root as any)._reactInternalFiber;
    if (reactRoot) {
      console.log('Found React root, but store access not directly available');
    }
  }
}

// Method 3: Try to find the store via module exports (if available)
if (!store && typeof window !== 'undefined') {
  // Check if there's a global reference
  const globalStore = (window as any).__ZUSTAND_STORE__ || (window as any).__APP_STORE__;
  if (globalStore) {
    store = globalStore.getState ? globalStore.getState() : globalStore;
    console.log('✅ Found store via global reference');
  }
}

if (store) {
  try {
    console.log('Store methods:', Object.keys(store).filter(k => k.startsWith('set')));
    
    // Enable post-processing
    if (store.setPostProcessingEnabled) {
      console.log('Enabling post-processing...');
      store.setPostProcessingEnabled(true);
      console.log('✅ Post-processing enabled');
      
      // Wait then enable AO
      setTimeout(() => {
        if (store.setAoEnabled) {
          console.log('Enabling AO...');
          store.setAoEnabled(true);
          console.log('✅ AO enabled');
          console.log('=== Check console for AO-related logs ===');
        } else {
          console.error('❌ setAoEnabled not found');
        }
      }, 1000);
    } else {
      console.error('❌ setPostProcessingEnabled not found');
    }
  } catch (error) {
    console.error('❌ Error enabling AO:', error);
  }
} else {
  console.warn('⚠️ Store not accessible. Please enable manually:');
  console.log('1. Click "⚙️ Quality" button in toolbar');
  console.log('2. Enable "Post-Processing Enabled" checkbox');
  console.log('3. Enable "Enable AO" checkbox under Ambient Occlusion section');
}












