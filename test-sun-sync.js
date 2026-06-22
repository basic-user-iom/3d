// Test script to verify sun direction synchronization
// Run this in browser console when standalone weather is enabled

console.log('=== Sun Direction Synchronization Test ===');

// Get viewer instance
const viewer = window.viewer || (window.app && window.app.viewer);

if (!viewer) {
  console.error('Viewer not found. Make sure viewer is exposed on window.');
} else {
  console.log('Viewer found:', viewer);
  
  // Test 1: Check CSM shadow direction
  if (viewer.csmShadowSystem) {
    const csm = viewer.csmShadowSystem.getCSM();
    if (csm) {
      console.log('CSM Direction:', csm.direction);
    }
  } else {
    console.warn('CSM Shadow System not found');
  }
  
  // Test 2: Check sun mesh position
  if (viewer.sunMoonSystem) {
    const sunDir = viewer.sunMoonSystem.getSunDirection();
    console.log('Sun Mesh Direction:', sunDir);
    
    // Check actual mesh position
    const scene = viewer.scene;
    let sunMesh = null;
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.isSunMesh) {
        sunMesh = obj;
      }
    });
    if (sunMesh) {
      const sunPos = sunMesh.position.clone().normalize();
      console.log('Sun Mesh Position (normalized):', sunPos);
    }
  } else {
    console.warn('Sun Moon System not found');
  }
  
  // Test 3: Check DynamicSky sun position
  if (viewer.dynamicSky) {
    const skyMaterial = viewer.dynamicSky.skyMaterial;
    if (skyMaterial && skyMaterial.uniforms && skyMaterial.uniforms.sunPosition) {
      const skySunPos = skyMaterial.uniforms.sunPosition.value.clone().normalize();
      console.log('DynamicSky Sun Position (normalized):', skySunPos);
    }
  } else {
    console.warn('Dynamic Sky not found');
  }
  
  // Test 4: Check Three.js sun light
  if (viewer.directionalLights) {
    viewer.directionalLights.forEach((light, id) => {
      if (light.userData && light.userData.isSun) {
        const lightDir = new THREE.Vector3()
          .subVectors(light.target.position, light.position)
          .normalize();
        console.log('Three.js Sun Light Direction:', lightDir);
        console.log('  Light Position:', light.position);
        console.log('  Light Target:', light.target.position);
      }
    });
  }
  
  console.log('=== Test Complete ===');
  console.log('All directions should match (within floating point precision)');
}









