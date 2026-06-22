# Car Material Diagnostic Commands

## Filter Out Helper Objects and Check Car Materials

```javascript
// Check car materials specifically (filter out helpers)
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer not found');
} else {
  // Helper object names to filter out
  const helperNames = ['XYZ', 'XYZX', 'XYZY', 'XYZZ', 'X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'E', 'XYZE', 'START', 'END', 'Grid', 'Axes', 'ShadowPlane'];
  
  let carWithTextures = 0, carWithoutTextures = 0, carWhiteMaterials = 0;
  const carMaterials = [];
  
  viewer.scene.traverse(obj => {
    if (obj.material && (obj.type === 'Mesh' || obj.constructor?.name === 'Mesh')) {
      // Skip helper objects
      if (helperNames.includes(obj.name)) return;
      
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        const hasTex = mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap;
        const isWhite = mat.color && mat.color.r === 1 && mat.color.g === 1 && mat.color.b === 1;
        const isHelper = mat.constructor?.name === 'MeshBasicMaterial'; // Basic materials are usually helpers
        
        if (!isHelper) { // Only check non-helper materials
          carMaterials.push({
            object: obj.name || 'unnamed',
            material: mat.name || 'unnamed',
            type: mat.constructor?.name || 'unknown',
            hasTexture: hasTex,
            isWhite: isWhite,
            color: mat.color ? `rgb(${mat.color.r.toFixed(2)}, ${mat.color.g.toFixed(2)}, ${mat.color.b.toFixed(2)})` : 'N/A'
          });
          
          if (hasTex) carWithTextures++;
          else {
            carWithoutTextures++;
            if (isWhite) carWhiteMaterials++;
          }
        }
      });
    }
  });
  
  console.log('📊 Car Materials (excluding helpers):', {
    withTextures: carWithTextures,
    withoutTextures: carWithoutTextures,
    whiteMaterials: carWhiteMaterials,
    total: carWithTextures + carWithoutTextures
  });
  
  // Show first 20 car materials for inspection
  console.log('🔍 Sample Car Materials:', carMaterials.slice(0, 20));
  
  // Find white car materials specifically
  const whiteCarMats = carMaterials.filter(m => m.isWhite && !m.hasTexture && m.type !== 'MeshBasicMaterial');
  if (whiteCarMats.length > 0) {
    console.warn('⚠️ White car materials found:', whiteCarMats);
  }
}
```

## Quick Test: Disable AO to See if Colors Return

```javascript
// Disable AO to test if it's causing the white appearance
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found');
} else {
  const pp = viewer.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found');
  } else {
    const wasEnabled = pp.config?.ao?.enabled;
    console.log('Current AO state:', wasEnabled);
    
    // Disable AO
    pp.updateConfig({ ao: { enabled: false } });
    console.log('✅ AO disabled - check if car colors return');
    console.log('To re-enable: pp.updateConfig({ ao: { enabled: true } })');
  }
}
```

## Check Tone Mapping (Could Be Washing Out Colors)

```javascript
// Check tone mapping settings
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found');
} else {
  const renderer = viewer.renderer;
  console.log('Renderer Settings:', {
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    outputColorSpace: renderer.outputColorSpace
  });
  
  const pp = viewer.postProcessingSystem;
  if (pp && pp.config?.toneMapping) {
    console.log('Post-Processing Tone Mapping:', pp.config.toneMapping);
  }
  
  // Try reducing exposure if it's too high
  if (renderer.toneMappingExposure > 1.5) {
    console.warn('⚠️ Exposure is high:', renderer.toneMappingExposure, '- this might wash out colors');
    console.log('To reduce: viewer.renderer.toneMappingExposure = 1.0');
  }
}
```

## Check Material Colors vs Textures

```javascript
// Check if materials have colors set (not just white)
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer not found');
} else {
  const helperNames = ['XYZ', 'XYZX', 'XYZY', 'XYZZ', 'X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'E', 'XYZE', 'START', 'END'];
  const materials = [];
  
  viewer.scene.traverse(obj => {
    if (obj.material && (obj.type === 'Mesh' || obj.constructor?.name === 'Mesh')) {
      if (helperNames.includes(obj.name)) return;
      
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (mat.constructor?.name !== 'MeshBasicMaterial' && mat.color) {
          const r = mat.color.r, g = mat.color.g, b = mat.color.b;
          const isWhite = r === 1 && g === 1 && b === 1;
          const hasTex = mat.map || mat.normalMap;
          
          if (!isWhite || hasTex) { // Show non-white or textured materials
            materials.push({
              object: obj.name || 'unnamed',
              material: mat.name || 'unnamed',
              color: `rgb(${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)})`,
              hasTexture: hasTex,
              type: mat.constructor?.name
            });
          }
        }
      });
    }
  });
  
  console.log('🎨 Materials with colors/textures:', materials.slice(0, 30));
}
```











