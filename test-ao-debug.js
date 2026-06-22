// AO Debug Script - Run this in browser console
// Copy and paste this entire script into the browser console

(function() {
  console.log('=== AO Debug Script ===');
  
  // Try to get post-processing system
  let pp = null;
  
  // Method 1: Try window.viewer
  if (window.viewer && window.viewer.postProcessingSystem) {
    pp = window.viewer.postProcessingSystem;
    console.log('✅ Found post-processing system via window.viewer');
  }
  // Method 2: Try to find it via React dev tools
  else if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    console.log('⚠️ Try accessing via React DevTools or check window.viewer');
  }
  
  if (!pp) {
    console.error('❌ Could not find post-processing system');
    console.log('💡 Try: window.viewer?.postProcessingSystem');
    return;
  }
  
  console.log('\n=== Post-Processing System State ===');
  console.log('Composer exists:', !!pp.composer);
  console.log('AO pass exists:', !!pp.aoPass);
  console.log('AO enabled in config:', pp.config?.ao?.enabled);
  console.log('Post-processing enabled:', pp.config?.enabled);
  
  if (pp.composer) {
    const composerAny = pp.composer;
    console.log('\n=== EffectComposer State ===');
    console.log('readBuffer exists:', !!composerAny.readBuffer);
    console.log('readBuffer.depthTexture:', composerAny.readBuffer?.depthTexture);
    console.log('readBuffer.texture:', composerAny.readBuffer?.texture);
    console.log('renderTarget1 exists:', !!composerAny.renderTarget1);
    console.log('renderTarget1.depthTexture:', composerAny.renderTarget1?.depthTexture);
    
    console.log('\n=== Passes ===');
    console.log('Total passes:', pp.composer.passes.length);
    pp.composer.passes.forEach((pass, i) => {
      console.log(`  ${i}: ${pass.constructor.name}`, {
        renderToScreen: pass.renderToScreen,
        enabled: pass.enabled !== false
      });
    });
  }
  
  if (pp.composerRenderTarget) {
    console.log('\n=== Composer Render Target ===');
    console.log('Width:', pp.composerRenderTarget.width);
    console.log('Height:', pp.composerRenderTarget.height);
    console.log('depthBuffer:', pp.composerRenderTarget.depthBuffer);
    console.log('depthTexture:', pp.composerRenderTarget.depthTexture);
    if (pp.composerRenderTarget.depthTexture) {
      const dt = pp.composerRenderTarget.depthTexture;
      console.log('  depthTexture.type:', dt.type);
      console.log('  depthTexture.format:', dt.format);
      console.log('  depthTexture.image:', dt.image);
    }
  }
  
  if (pp.aoPass) {
    console.log('\n=== SAOPass State ===');
    const aoPassAny = pp.aoPass;
    console.log('SAOPass params:', aoPassAny.params);
    console.log('SAOPass enabled:', aoPassAny.enabled !== false);
    console.log('SAOPass renderToScreen:', aoPassAny.renderToScreen);
    
    // Check if SAOPass has access to depth
    if (pp.composer) {
      const composerAny = pp.composer;
      console.log('\n=== SAOPass Depth Access Check ===');
      console.log('readBuffer.depthTexture available:', !!composerAny.readBuffer?.depthTexture);
      
      // Try to check SAOPass internal state
      if (aoPassAny.saoMaterial) {
        console.log('SAOPass saoMaterial exists:', !!aoPassAny.saoMaterial);
        if (aoPassAny.saoMaterial.uniforms) {
          console.log('SAOPass uniforms:', Object.keys(aoPassAny.saoMaterial.uniforms));
        }
      }
    }
  }
  
  console.log('\n=== Recommendations ===');
  if (!pp.composerRenderTarget?.depthTexture) {
    console.log('⚠️ No depth texture on composerRenderTarget');
  }
  if (pp.composer && !pp.composer.readBuffer?.depthTexture) {
    console.log('⚠️ No depth texture on readBuffer - SAOPass cannot read depth!');
    console.log('💡 This is likely the cause of the black screen');
  }
  if (pp.aoPass && pp.config?.ao?.enabled) {
    console.log('✅ AO is enabled and pass exists');
    if (pp.composer && pp.composer.readBuffer?.depthTexture) {
      console.log('✅ Depth texture is available - AO should work');
    } else {
      console.log('❌ Depth texture missing - AO will not work correctly');
    }
  }
  
  console.log('\n=== Debug Complete ===');
})();












