// Script to capture test results from console
// This will be injected to get test results

(function() {
  // Wait for viewer to be ready
  const checkViewer = setInterval(() => {
    const viewer = window.__viewer;
    if (viewer && viewer.postProcessingSystem) {
      clearInterval(checkViewer);
      
      // Run tests
      if (window.runAOTests) {
        console.log('🚀 Running AO tests...');
        window.runAOTests();
      } else {
        console.error('❌ runAOTests function not found');
      }
    }
  }, 500);
  
  // Timeout after 30 seconds
  setTimeout(() => {
    clearInterval(checkViewer);
    console.warn('⏱️ Timeout waiting for viewer');
  }, 30000);
})();












