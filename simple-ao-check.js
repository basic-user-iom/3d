// Simple version - type this manually in console (no pasting needed)
const pp = window.__viewer?.postProcessingSystem || window.sharedViewer?.postProcessingSystem;
if (pp) {
  console.log('AO enabled:', pp.config?.ao?.enabled);
  console.log('AO pass exists:', !!pp.aoPass);
  console.log('Depth texture on readBuffer:', !!pp.composer?.readBuffer?.depthTexture);
  console.log('Depth texture on renderTarget:', !!pp.composerRenderTarget?.depthTexture);
} else {
  console.log('Post-processing system not found');
}












