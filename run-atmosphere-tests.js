/**
 * Atmosphere System Test Runner
 * Run this in browser console after the app loads
 */

// Wait for viewer to be ready
function waitForViewer() {
  return new Promise((resolve) => {
    if (window.atmosphereTests) {
      resolve(window.atmosphereTests)
      return
    }
    
    const checkInterval = setInterval(() => {
      if (window.atmosphereTests) {
        clearInterval(checkInterval)
        resolve(window.atmosphereTests)
      }
    }, 100)
    
    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      resolve(null)
    }, 10000)
  })
}

// Run tests
async function runTests() {
  console.log('🧪 Starting Atmosphere System Tests...')
  
  const testSuite = await waitForViewer()
  if (!testSuite) {
    console.error('❌ Atmosphere test suite not found. Make sure the app is loaded and standalone weather is enabled.')
    return null
  }
  
  console.log('✅ Test suite found, running tests...')
  const report = await testSuite.runAllTests()
  
  console.log('\n📊 Test Results Summary:')
  console.log(`Overall Status: ${report.overallStatus.toUpperCase()}`)
  console.log(`Total: ${report.summary.total}`)
  console.log(`Passed: ${report.summary.passed}`)
  console.log(`Failed: ${report.summary.failed}`)
  console.log(`Warnings: ${report.summary.warnings}`)
  
  console.log('\n📋 Detailed Results:')
  report.results.forEach((result, index) => {
    const icon = result.passed ? '✅' : result.message.includes('⚠️') ? '⚠️' : '❌'
    console.log(`${icon} ${index + 1}. ${result.testName}: ${result.message}`)
    if (result.details) {
      console.log(`   Details:`, result.details)
    }
  })
  
  // Generate Perplexity report
  const perplexityReport = testSuite.generatePerplexityReport(report)
  console.log('\n📄 Perplexity Report Generated')
  
  // Save to window for easy access
  window.atmosphereTestReport = report
  window.atmospherePerplexityReport = perplexityReport
  
  console.log('\n💡 Access reports via:')
  console.log('  - window.atmosphereTestReport (full test results)')
  console.log('  - window.atmospherePerplexityReport (Perplexity report text)')
  
  return { report, perplexityReport }
}

// Export for use
if (typeof window !== 'undefined') {
  window.runAtmosphereTests = runTests
  console.log('💡 Run tests with: await window.runAtmosphereTests()')
}

// Auto-run if in Node.js (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTests, waitForViewer }
}
























