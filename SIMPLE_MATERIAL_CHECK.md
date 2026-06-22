# Simple Material Check Commands

## Quick Check - What's in the Scene?
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer not found');
} else {
  console.log('Scene children:', viewer.scene.children.length);
  let meshCount = 0;
  viewer.scene.traverse(obj => {
    if (obj.type === 'Mesh') {
      meshCount++;
      if (meshCount <= 10) {
        console.log('Mesh:', obj.name || 'unnamed', 'Material:', obj.material?.constructor?.name || 'none');
      }
    }
  });
  console.log('Total meshes:', meshCount);
}
```

## Check Material Colors Directly
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer not found');
} else {
  let count = 0;
  viewer.scene.traverse(obj => {
    if (obj.material && obj.type === 'Mesh') {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (count < 20) {
          console.log('Material:', {
            object: obj.name || 'unnamed',
            type: mat.constructor?.name,
            hasColor: !!mat.color,
            color: mat.color ? `rgb(${mat.color.r}, ${mat.color.g}, ${mat.color.b})` : 'none',
            hasMap: !!mat.map,
            mapName: mat.map?.name || 'none'
          });
          count++;
        }
      });
    }
  });
}
```

## Check if Post-Processing is Actually Disabled
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  console.log('Post-Processing:', {
    enabled: viewer.postProcessingSystem.config?.enabled,
    composerExists: !!viewer.postProcessingSystem.composer,
    isRendering: viewer.postProcessingSystem.composer?.passes?.length > 0
  });
}
```











