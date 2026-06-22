// Script to inject into browser console
// This will run all AO tests and log results

(function() {
  console.log('%c=== AO Tests Starting ===', 'font-size: 16px; font-weight: bold; color: #4a9eff;');
  
  const viewer = window.__viewer;
  if (!viewer) {
    console.error('❌ Viewer not found');
    return;
  }
  console.log('✅ Viewer found');
  
  const pp = viewer.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found');
    return;
  }
  
  // Test 1: Status
  console.log('%c=== Test 1: Post-Processing Status ===', 'font-weight: bold;');
  console.log('Post-processing enabled:', pp.config?.enabled);
  console.log('AO enabled:', pp.config?.ao?.enabled);
  console.log('AO pass exists:', !!pp.aoPass);
  
  // Test 2: Pass Order
  console.log('%c=== Test 2: Pass Order ===', 'font-weight: bold;');
  if (pp.composer) {
    const passes = pp.composer.passes;
    const passNames = passes.map(p => p.constructor.name);
    console.log('Pass order:', passNames);
    
    const renderIndex = passNames.indexOf('RenderPass');
    const saoIndex = passNames.indexOf('SAOPass');
    
    if (renderIndex === -1) {
      console.error('❌ RenderPass not found!');
    } else {
      console.log('✅ RenderPass found at index:', renderIndex);
    }
    
    if (saoIndex === -1) {
      console.warn('⚠️ SAOPass not found (may not be enabled)');
    } else {
      console.log('✅ SAOPass found at index:', saoIndex);
      if (saoIndex === renderIndex + 1) {
        console.log('✅ Pass order is CORRECT');
      } else {
        console.error('❌ Pass order is WRONG! Expected SAOPass at', renderIndex + 1, 'but found at', saoIndex);
      }
    }
  }
  
  // Test 3: Shadow Maps
  console.log('%c=== Test 3: Shadow Maps ===', 'font-weight: bold;');
  const renderer = viewer.renderer;
  if (renderer) {
    console.log('Shadow maps enabled:', renderer.shadowMap.enabled);
    console.log('Shadow map type:', renderer.shadowMap.type);
  }
  
  // Test 4: Depth Texture
  console.log('%c=== Test 4: Depth Texture ===', 'font-weight: bold;');
  if (pp.composer) {
    const composerAny = pp.composer;
    if (composerAny.readBuffer) {
      console.log('✅ readBuffer exists');
      const hasDepthTexture = !!composerAny.readBuffer.depthTexture;
      console.log('Depth texture exists:', hasDepthTexture);
      if (!hasDepthTexture) {
        console.error('⚠️ WARNING: readBuffer.depthTexture is missing - SAOPass may not work!');
      }
    } else {
      console.error('❌ readBuffer not found');
    }
  }
  
  // Test 5: Enable AO
  console.log('%c=== Test 5: Enabling AO ===', 'font-weight: bold;');
  pp.updateConfig({ enabled: true });
  pp.updateConfig({ ao: { ...pp.config.ao, enabled: true } });
  console.log('✅ Post-processing and AO enabled - CHECK 3D VIEW FOR BLACK SCREEN');
  
  // Test 6: Test with shadow maps disabled
  console.log('%c=== Test 6: Testing with Shadow Maps Disabled ===', 'font-weight: bold;');
  window.__testAOWithoutShadows = true;
  console.log('✅ Shadow maps disabled (test mode) - CHECK IF AO WORKS NOW');
  
  console.log('%c=== Tests Complete ===', 'font-size: 16px; font-weight: bold; color: #4a9eff;');
  console.log('Check the 3D view to see if AO is working or causing black screen');
  console.log('To re-enable shadow maps: window.__testAOWithoutShadows = false');
  
  return {
    viewerFound: true,
    postProcessingEnabled: pp.config?.enabled,
    aoEnabled: pp.config?.ao?.enabled,
    aoPassExists: !!pp.aoPass,
    shadowMapsEnabled: renderer?.shadowMap?.enabled,
    testModeActive: window.__testAOWithoutShadows === true
  };
})();












