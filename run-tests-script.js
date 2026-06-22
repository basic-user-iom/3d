/**
 * Shadow System Test Runner Script
 * 
 * Copy and paste this entire script into your browser console
 * Or run: window.shadowSystemTestRunner.runAll()
 */

(async function runShadowSystemTests() {
  console.log('🚀 Starting Shadow System Tests with Full Data Capture...\n')
  
  // Check if test runner is available
  if (!window.shadowSystemTestRunner) {
    console.error('❌ Shadow System Test Runner not initialized!')
    console.log('Please wait for the viewer to fully initialize, then try again.')
    return
  }
  
  try {
    // Run comprehensive tests
    const results = await window.shadowSystemTestRunner.runAll()
    
    // Display summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total Tests: ${results.totalTests}`)
    console.log(`Passed: ${results.passedTests}`)
    console.log(`Failed: ${results.failedTests}`)
    console.log('\nSummary Statistics:')
    console.log(JSON.stringify(results.summary, null, 2))
    
    // Display detailed results
    console.log('\n' + '='.repeat(80))
    console.log('📋 DETAILED RESULTS')
    console.log('='.repeat(80))
    results.results.forEach((result, index) => {
      console.log(`\nTest ${index + 1}: ${result.testName}`)
      console.log(`  From: ${result.fromSystem} → To: ${result.toSystem}`)
      console.log(`  Success: ${result.success ? '✅' : '❌'}`)
      console.log(`  Errors: ${result.errors.length}`)
      console.log(`  Warnings: ${result.warnings.length}`)
      
      if (result.errors.length > 0) {
        console.log('  Errors:')
        result.errors.forEach(err => console.log(`    - ${err}`))
      }
      
      if (result.warnings.length > 0) {
        console.log('  Warnings:')
        result.warnings.forEach(warn => console.log(`    - ${warn}`))
      }
      
      // Light restoration status
      const restoredCount = result.lightStates.restored.filter(r => r).length
      const totalLights = result.lightStates.restored.length
      console.log(`  Light Position Restoration: ${restoredCount}/${totalLights} restored`)
    })
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Test execution complete!')
    console.log('📥 Results have been automatically downloaded as JSON file')
    console.log('💾 Results are also available at: window.shadowSystemTestResults')
    console.log('='.repeat(80))
    
    return results
  } catch (error) {
    console.error('❌ Test execution failed:', error)
    throw error
  }
})();





















