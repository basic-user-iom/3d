# White Car Diagnostic - Complete Troubleshooting

## Step 1: Disable ALL Post-Processing
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  viewer.postProcessingSystem.updateConfig({ enabled: false });
  console.log('✅ All post-processing disabled - check if colors return');
}
```

## Step 2: Check Tone Mapping Exposure
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.renderer) {
  console.log('Tone Mapping:', {
    exposure: viewer.renderer.toneMappingExposure,
    type: viewer.renderer.toneMapping,
    outputColorSpace: viewer.renderer.outputColorSpace
  });
  
  // Try reducing exposure
  viewer.renderer.toneMappingExposure = 1.0;
  console.log('✅ Exposure set to 1.0');
}
```

## Step 3: Check Material Colors (Not Just Textures)
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) return;

const helpers = ['XYZ', 'XYZX', 'XYZY', 'XYZZ', 'X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'E', 'XYZE', 'START', 'END'];
let whiteCarMats = 0, coloredMats = 0;

viewer.scene.traverse(obj => {
  if (obj.material && obj.type === 'Mesh' && !helpers.includes(obj.name)) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (mat.constructor?.name !== 'MeshBasicMaterial' && mat.color) {
        const r = mat.color.r, g = mat.color.g, b = mat.color.b;
        const isWhite = r === 1 && g === 1 && b === 1;
        if (isWhite) {
          whiteCarMats++;
          console.warn('White material:', {
            object: obj.name || 'unnamed',
            material: mat.name || 'unnamed',
            color: `rgb(${r}, ${g}, ${b})`,
            hasTexture: !!(mat.map || mat.normalMap)
          });
        } else {
          coloredMats++;
        }
      }
    });
  }
});

console.log('📊 Material Colors:', {white: whiteCarMats, colored: coloredMats});
```

## Step 4: Check Post-Processing Config
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  const config = viewer.postProcessingSystem.config;
  console.log('Post-Processing Config:', {
    enabled: config?.enabled,
    ao: config?.ao,
    toneMapping: config?.toneMapping,
    colorGrading: config?.colorGrading,
    bloom: config?.bloom?.enabled,
    lut: config?.lut?.enabled
  });
}
```

## Step 5: Reset Renderer Settings
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.renderer) {
  viewer.renderer.toneMappingExposure = 1.0;
  viewer.renderer.toneMapping = 0; // No tone mapping
  console.log('✅ Renderer reset to defaults');
}
```

## Step 6: Check if Materials Have Actual Colors
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) return;

const carMaterials = [];
viewer.scene.traverse(obj => {
  if (obj.material && obj.type === 'Mesh' && obj.name && !obj.name.match(/^(XYZ|X|Y|Z|START|END)/)) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (mat.color) {
        carMaterials.push({
          object: obj.name,
          material: mat.name || 'unnamed',
          color: `rgb(${mat.color.r.toFixed(3)}, ${mat.color.g.toFixed(3)}, ${mat.color.b.toFixed(3)})`,
          hasMap: !!mat.map,
          mapName: mat.map?.name || 'none'
        });
      }
    });
  }
});

console.log('🎨 Car Material Colors (first 20):', carMaterials.slice(0, 20));
```











