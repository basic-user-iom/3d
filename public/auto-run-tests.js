// Auto-run post-processing tests
// This script will automatically run tests when the page loads

(function() {
  console.log('🔧 Auto-test script loaded');
  
  function runTests() {
    // Wait for everything to be ready
    const checkInterval = setInterval(() => {
      const viewer = window.__viewer || window.sharedViewer;
      const hasPostProcessing = viewer?.postProcessingSystem;
      const hasTestSuite = window.postProcessingTests;
      
      if (viewer && hasPostProcessing && hasTestSuite) {
        clearInterval(checkInterval);
        console.log('✅ All systems ready! Auto-running tests...\n');
        
        // Small delay to ensure everything is fully initialized
        setTimeout(() => {
          try {
            const results = window.postProcessingTests.runAllTests();
            console.log('\n📊 Auto-test complete! Results:', results);
          } catch (error) {
            console.error('❌ Error running tests:', error);
          }
        }, 1000);
      }
    }, 500);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.warn('⏱️ Auto-test timeout - systems may not be ready');
    }, 30000);
  }
  
  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTests);
  } else {
    runTests();
  }
})();


























