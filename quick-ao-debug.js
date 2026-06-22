// Quick AO Debug - Paste this in browser console
(() => {
  const pp = window.__viewer?.postProcessingSystem || window.sharedViewer?.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found.');
    console.log('💡 Available: window.__viewer, window.sharedViewer');
    return;
  }
  
  console.log('=== Quick AO Debug ===');
  console.log('AO enabled:', pp.config?.ao?.enabled);
  console.log('AO pass exists:', !!pp.aoPass);
  console.log('Composer exists:', !!pp.composer);
  
  if (pp.composer) {
    const c = pp.composer;
    console.log('readBuffer.depthTexture:', !!c.readBuffer?.depthTexture);
    console.log('composerRenderTarget.depthTexture:', !!pp.composerRenderTarget?.depthTexture);
    
    if (!c.readBuffer?.depthTexture && pp.composerRenderTarget?.depthTexture) {
      console.log('⚠️ Depth texture missing on readBuffer - this is the problem!');
      console.log('💡 Connecting depth texture now...');
      c.readBuffer.depthTexture = pp.composerRenderTarget.depthTexture;
      console.log('✅ Connected! Refresh page and enable AO again.');
    }
  }
})();

