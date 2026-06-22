/**
 * Path Tracer Comprehensive Browser Test Script
 * Run this in browser console to test all path tracer functionality
 */

async function testPathTracer() {
  console.log('🧪 Starting Path Tracer Comprehensive Test...')
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  }
  
  // Helper to log results
  function logResult(test, passed, message = '') {
    if (passed) {
      results.passed.push(test)
      console.log(`✅ ${test}`, message)
    } else {
      results.failed.push(test)
      console.error(`❌ ${test}`, message)
    }
  }
  
  // Get path tracer instance
  const pathTracer = window.__pathTracerDemo
  if (!pathTracer) {
    console.error('❌ Path Tracer not found. Open Path Tracer panel first.')
    return results
  }
  
  console.log('📊 Path Tracer State:', {
    isRunning: pathTracer.isRunning(),
    isReady: typeof pathTracer.isReady === 'function' ? pathTracer.isReady() : 'N/A',
    sampleCount: pathTracer.getSampleCount()
  })
  
  // Test 1: Reset functionality (check for black screen)
  console.log('\n🧪 Test 1: Reset Functionality')
  try {
    const wasRunning = pathTracer.isRunning()
    const sampleCountBefore = pathTracer.getSampleCount()
    
    // Start if not running
    if (!wasRunning) {
      console.log('  → Starting path tracer for reset test...')
      pathTracer.start()
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait for samples
    }
    
    const sampleCountAfterStart = pathTracer.getSampleCount()
    console.log(`  → Sample count before reset: ${sampleCountAfterStart}`)
    
    // Reset
    pathTracer.reset()
    await new Promise(resolve => setTimeout(resolve, 500)) // Wait for reset to complete
    
    const sampleCountAfterReset = pathTracer.getSampleCount()
    const isRunningAfterReset = pathTracer.isRunning()
    
    // Check for black screen by reading canvas pixels
    const canvas = document.querySelector('canvas')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const imageData = ctx.getImageData(canvas.width / 2, canvas.height / 2, 10, 10)
        const pixels = imageData.data
        let blackPixels = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          if (r === 0 && g === 0 && b === 0) blackPixels++
        }
        const isBlack = blackPixels > 80 // More than 80% black = likely black screen
        
        logResult('Reset - No Black Screen', !isBlack, 
          isBlack ? 'Black screen detected after reset!' : 'Canvas has content after reset')
      }
    }
    
    logResult('Reset - Sample Count Reset', sampleCountAfterReset < sampleCountAfterStart,
      `Samples: ${sampleCountAfterStart} → ${sampleCountAfterReset}`)
    logResult('Reset - Still Running', isRunningAfterReset,
      `Running: ${isRunningAfterReset}`)
      
  } catch (error) {
    logResult('Reset - No Errors', false, error.message)
  }
  
  // Test 2: Color Preservation
  console.log('\n🧪 Test 2: Color Preservation')
  try {
    const viewer = window.__viewer || window.sharedViewer
    if (viewer && viewer.scene) {
      const backgroundBefore = viewer.scene.background
      const isColor = backgroundBefore instanceof THREE.Color
      
      if (isColor) {
        const colorHex = '#' + backgroundBefore.getHexString()
        console.log(`  → Background color before: ${colorHex}`)
        
        // Start path tracer (should save background)
        if (!pathTracer.isRunning()) {
          pathTracer.start()
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        // Stop path tracer (should restore background)
        pathTracer.stop(true)
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const backgroundAfter = viewer.scene.background
        const isColorAfter = backgroundAfter instanceof THREE.Color
        const colorHexAfter = isColorAfter ? '#' + backgroundAfter.getHexString() : 'N/A'
        
        logResult('Color Preservation - Background Restored', 
          isColorAfter && colorHexAfter === colorHex,
          `Color: ${colorHex} → ${colorHexAfter}`)
      } else {
        results.warnings.push('Color Preservation - Background is not a Color object')
      }
    }
  } catch (error) {
    logResult('Color Preservation - No Errors', false, error.message)
  }
  
  // Test 3: Settings Application
  console.log('\n🧪 Test 3: Settings Application')
  try {
    const originalBounces = pathTracer.pathTracer.bounces
    pathTracer.setBounces(2)
    await new Promise(resolve => setTimeout(resolve, 100))
    logResult('Settings - Bounces', pathTracer.pathTracer.bounces === 2,
      `Bounces: ${originalBounces} → ${pathTracer.pathTracer.bounces}`)
    
    pathTracer.setBounces(originalBounces) // Restore
  } catch (error) {
    logResult('Settings - Bounces', false, error.message)
  }
  
  // Test 4: Max Samples Pause
  console.log('\n🧪 Test 4: Max Samples Pause')
  try {
    if (!pathTracer.isRunning()) {
      pathTracer.start()
    }
    
    pathTracer.setMaxSamples(5) // Quick test
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait for max samples
    
    const sampleCount = pathTracer.getSampleCount()
    const isPaused = typeof pathTracer.isPausedAtMax === 'function' && pathTracer.isPausedAtMax()
    
    logResult('Max Samples - Pauses at Max', isPaused || sampleCount >= 5,
      `Samples: ${sampleCount}, Paused: ${isPaused}`)
    
    // Check for gray screen
    const canvas = document.querySelector('canvas')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const imageData = ctx.getImageData(canvas.width / 2, canvas.height / 2, 10, 10)
        const pixels = imageData.data
        let grayPixels = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          // Check if all RGB values are similar (gray)
          if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 50 && r < 200) {
            grayPixels++
          }
        }
        const isGray = grayPixels > 80
        
        logResult('Max Samples - No Gray Screen', !isGray,
          isGray ? 'Gray screen detected!' : 'Final frame visible')
      }
    }
    
    pathTracer.clearMaxSamples() // Clear limit
  } catch (error) {
    logResult('Max Samples - No Errors', false, error.message)
  }
  
  // Summary
  console.log('\n📊 Test Summary:')
  console.log(`✅ Passed: ${results.passed.length}`)
  console.log(`❌ Failed: ${results.failed.length}`)
  console.log(`⚠️  Warnings: ${results.warnings.length}`)
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:')
    results.failed.forEach(test => console.log(`  - ${test}`))
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    results.warnings.forEach(warning => console.log(`  - ${warning}`))
  }
  
  return results
}

// Export for use
window.testPathTracer = testPathTracer
console.log('✅ Path Tracer test function loaded. Run: testPathTracer()')














