// Test SSS in browser console
// Run this in the browser console after page loads

console.log('🔍 Testing SSS (Screen Space Shadows)...');

// Get post-processing system
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem;
if (!postProcessingSystem) {
  console.error('❌ Post-processing system not found!');
} else {
  console.log('✅ Post-processing system found');
  
  // Enable post-processing and SSS via store
  const store = window.useAppStore?.getState?.();
  if (store) {
    console.log('📝 Enabling post-processing and SSS via store...');
    // Post-processing must be enabled first
    if (store.setPostProcessingEnabled) {
      store.setPostProcessingEnabled(true);
      console.log('✅ Post-processing enabled');
    }
    // Then enable SSS
    store.setSssEnabled(true);
    console.log('✅ SSS enabled via store');
  }
  
  // Wait a bit for the system to update
  setTimeout(() => {
    // Check if SSS pass exists
    if (postProcessingSystem.sssPass) {
      console.log('✅ SSS pass exists');
      
      // Enable debug mode 2.0 (shadow visualization)
      postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0;
      console.log('✅ Debug mode 2.0 enabled - should see white areas (shadows) and black areas (no shadows)');
      
      // Log current SSS parameters
      const uniforms = postProcessingSystem.sssPass.uniforms;
      console.log('📊 SSS Parameters:', {
        intensity: uniforms.intensity.value,
        maxRadius: uniforms.maxRadius.value,
        samples: uniforms.samples.value,
        rayDistance: uniforms.rayDistance.value,
        thickness: uniforms.thickness.value,
        bias: uniforms.bias.value,
        lightDirection: {
          x: uniforms.lightDirection.value.x,
          y: uniforms.lightDirection.value.y,
          z: uniforms.lightDirection.value.z
        },
        debugMode: uniforms.debugMode.value,
        hasDepthTexture: !!uniforms.tDepth.value,
        hasDiffuseTexture: !!uniforms.tDiffuse.value
      });
      
      // Test other debug modes
      console.log('\n💡 Available debug modes:');
      console.log('  - Debug 1.0: Depth visualization');
      console.log('  - Debug 2.0: Shadow visualization (currently active)');
      console.log('  - Debug 3.0: Raw depth texture');
      console.log('\nTo switch modes, run:');
      console.log('  postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0; // Depth');
      console.log('  postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0; // Shadows');
      console.log('  postProcessingSystem.sssPass.uniforms.debugMode.value = 3.0; // Raw depth');
      console.log('  postProcessingSystem.sssPass.uniforms.debugMode.value = 0.0; // Normal (shadows applied)');
      
    } else {
      console.error('❌ SSS pass not found! SSS may not be enabled in config.');
    }
  }, 1000);
}

