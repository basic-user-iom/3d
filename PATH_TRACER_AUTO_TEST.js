/**
 * Automated Path Tracer Test Script
 * 
 * This script automatically tests all quality presets and resolution presets
 * to identify rendering issues with the path tracer.
 * 
 * USAGE:
 * 1. Load your model in the viewer
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. It will automatically run tests and report results
 */

(async function PathTracerAutoTest() {
  console.log('%c🧪 PATH TRACER AUTOMATED TEST SUITE', 'color: cyan; font-size: 20px; font-weight: bold');
  console.log('Testing all quality and resolution presets...\n');
  
  // Configuration
  const testConfig = {
    qualityPresets: ['Fast', 'Balanced', 'High', 'Ultra'],
    resolutionPresets: ['1080p', '2k', '4k'],
    tilesOptions: [1, 2, 4],
    testSamples: 4, // Quick test with few samples
    delayBetweenTests: 3000 // 3 seconds between tests
  };
  
  const results = [];
  
  // Get viewer and path tracer
  const viewer = window.__viewer || window.sharedViewer;
  if (!viewer) {
    console.error('❌ No viewer found! Load a model first.');
    return;
  }
  
  // Fix camera far plane for large models
  const bbox = new THREE.Box3().setFromObject(viewer.scene);
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  
  console.log(`📏 Scene size: ${maxDim.toFixed(0)} units`);
  
  if (viewer.camera.far < maxDim * 2) {
    console.log(`🔧 Adjusting camera far plane: ${viewer.camera.far} → ${(maxDim * 3).toFixed(0)}`);
    viewer.camera.far = maxDim * 3;
    viewer.camera.updateProjectionMatrix();
  }
  
  // Test function
  async function runTest(quality, resolution, tiles) {
    const testName = `${quality} / ${resolution} / ${tiles}x${tiles} tiles`;
    console.log(`\n🧪 Testing: ${testName}`);
    
    const result = {
      quality,
      resolution,
      tiles,
      success: false,
      samples: 0,
      errors: [],
      warnings: [],
      renderTime: 0
    };
    
    try {
      // Open path tracer panel if not open
      if (!window.__pathTracerDemo) {
        console.log('  Opening path tracer panel...');
        // Trigger path tracer panel open
        const ptButton = document.querySelector('[data-testid="path-tracer-button"]') || 
                        Array.from(document.querySelectorAll('button'))
                          .find(b => b.textContent.includes('Path Tracer'));
        if (ptButton) {
          ptButton.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const pt = window.__pathTracerDemo;
      if (!pt) {
        throw new Error('Path tracer not available');
      }
      
      // Configure settings
      console.log('  Applying settings...');
      
      // Set quality
      const qualityMap = {
        'Fast': { bounces: 2, tiles: 2 },
        'Balanced': { bounces: 4, tiles: 2 },
        'High': { bounces: 10, tiles: 4 },
        'Ultra': { bounces: 10, tiles: 4 }
      };
      const qualitySettings = qualityMap[quality];
      
      if (pt.setBounces) pt.setBounces(qualitySettings.bounces);
      if (pt.setTiles) pt.setTiles(tiles);
      
      // Set resolution
      const resolutionMap = {
        '1080p': 1.0,
        '2k': 1.5,
        '4k': 2.0
      };
      const scale = resolutionMap[resolution];
      if (pt.setResolutionScale) pt.setResolutionScale(scale);
      
      // Set max samples for quick test
      if (pt.setMaxSamples) pt.setMaxSamples(testConfig.testSamples);
      
      console.log('  Starting render...');
      const startTime = Date.now();
      
      // Start path tracer
      if (pt.start) {
        pt.start();
      } else if (pt.isRunning && !pt.isRunning()) {
        // Trigger start via UI if needed
        const startBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.includes('Start'));
        if (startBtn) startBtn.click();
      }
      
      // Wait for completion (check every 100ms for up to 30 seconds)
      let completed = false;
      for (let i = 0; i < 300; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const samples = pt.getSampleCount ? pt.getSampleCount() : 0;
        result.samples = samples;
        
        if (samples >= testConfig.testSamples) {
          completed = true;
          break;
        }
        
        if (i % 10 === 0) {
          console.log(`  Progress: ${samples}/${testConfig.testSamples} samples`);
        }
      }
      
      result.renderTime = Date.now() - startTime;
      
      if (completed) {
        console.log(`  ✅ Completed ${result.samples} samples in ${(result.renderTime / 1000).toFixed(1)}s`);
        result.success = true;
        
        // Check if canvas has content (not all black/white)
        const canvas = viewer.renderer.domElement;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(
          canvas.width / 2 - 50,
          canvas.height / 2 - 50,
          100,
          100
        );
        
        let hasColor = false;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          if (r > 10 || g > 10 || b > 10) {
            hasColor = true;
            break;
          }
        }
        
        if (!hasColor) {
          result.warnings.push('Canvas appears blank (all black pixels)');
          console.warn('  ⚠️ WARNING: Canvas appears blank!');
        }
        
      } else {
        result.warnings.push('Did not complete in 30 seconds');
        console.warn(`  ⚠️ Timeout: only ${result.samples} samples rendered`);
      }
      
      // Stop path tracer
      if (pt.stop) pt.stop();
      
    } catch (error) {
      result.errors.push(error.message);
      console.error(`  ❌ Error: ${error.message}`);
    }
    
    results.push(result);
    
    // Wait before next test
    console.log(`  Waiting ${testConfig.delayBetweenTests / 1000}s before next test...`);
    await new Promise(resolve => setTimeout(resolve, testConfig.delayBetweenTests));
    
    return result;
  }
  
  // Run all tests
  console.log('\n' + '='.repeat(60));
  console.log('Starting test sequence...');
  console.log('='.repeat(60) + '\n');
  
  // Test each quality preset with default resolution and tiles
  for (const quality of testConfig.qualityPresets) {
    await runTest(quality, '1080p', 2);
  }
  
  // Test different resolutions with Fast quality
  for (const resolution of testConfig.resolutionPresets) {
    if (resolution !== '1080p') { // Already tested
      await runTest('Fast', resolution, 2);
    }
  }
  
  // Test different tile counts with Fast quality
  for (const tiles of testConfig.tilesOptions) {
    if (tiles !== 2) { // Already tested
      await runTest('Fast', '1080p', tiles);
    }
  }
  
  // Print results summary
  console.log('\n' + '='.repeat(60));
  console.log('%c📊 TEST RESULTS SUMMARY', 'color: yellow; font-size: 16px; font-weight: bold');
  console.log('='.repeat(60) + '\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const withWarnings = results.filter(r => r.warnings.length > 0);
  
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`⚠️  With warnings: ${withWarnings.length}`);
  
  console.log('\n📋 Detailed Results:');
  console.table(results.map(r => ({
    'Test': `${r.quality}/${r.resolution}/${r.tiles}x${r.tiles}`,
    'Success': r.success ? '✅' : '❌',
    'Samples': r.samples,
    'Time (s)': (r.renderTime / 1000).toFixed(1),
    'Warnings': r.warnings.length,
    'Errors': r.errors.length
  })));
  
  // Identify best working configuration
  const working = results.filter(r => r.success && r.warnings.length === 0);
  if (working.length > 0) {
    console.log('\n✨ RECOMMENDED SETTINGS:');
    const best = working[0];
    console.log(`  Quality: ${best.quality}`);
    console.log(`  Resolution: ${best.resolution}`);
    console.log(`  Tiles: ${best.tiles}x${best.tiles}`);
  } else if (successful.length > 0) {
    console.log('\n⚠️  PARTIAL SUCCESS - Use these with caution:');
    const best = successful[0];
    console.log(`  Quality: ${best.quality}`);
    console.log(`  Resolution: ${best.resolution}`);
    console.log(`  Tiles: ${best.tiles}x${best.tiles}`);
    console.log(`  Warnings: ${best.warnings.join(', ')}`);
  } else {
    console.log('\n❌ NO SUCCESSFUL TESTS - Path tracer may have fundamental issues');
  }
  
  // Export results
  window.pathTracerTestResults = results;
  console.log('\n💾 Results saved to: window.pathTracerTestResults');
  console.log('📤 To export: copy(JSON.stringify(window.pathTracerTestResults, null, 2))');
  
})();














