# Material & Texture Diagnostic Commands

## Quick Diagnostic Commands for Browser Console

### 1. Check if Viewer is Available
```javascript
// Check which viewer reference is available
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found. Try: window.__viewer or window.sharedViewer');
} else {
  console.log('✅ Viewer found:', viewer);
}
```

### 1b. Quick Material Check (No THREE dependency)
```javascript
// Quick check that doesn't require THREE to be global
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer or scene not found');
} else {
  let withTextures = 0, withoutTextures = 0, whiteMaterials = 0;
  viewer.scene.traverse(obj => {
    // Check if it's a mesh (has material property)
    if (obj.material && (obj.type === 'Mesh' || obj.constructor?.name === 'Mesh')) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        const hasTex = mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap;
        if (hasTex) {
          withTextures++;
        } else {
          withoutTextures++;
          if (mat.color && mat.color.r === 1 && mat.color.g === 1 && mat.color.b === 1) {
            whiteMaterials++;
            console.warn('⚠️ White material without texture:', {
              object: obj.name || 'unnamed',
              material: mat.name || 'unnamed',
              type: mat.constructor?.name || 'unknown'
            });
          }
        }
      });
    }
  });
  console.log('📊 Materials:', {withTextures, withoutTextures, whiteMaterials});
}
```

### 2. Check Materials and Textures
```javascript
// Check all materials and their textures
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer or scene not found');
} else {
  // Get THREE from the renderer or scene
  const THREE = viewer.renderer?.constructor?.prototype?.constructor || 
                (viewer.scene?.constructor?.prototype?.constructor);
  
  if (!THREE) {
    // Try to get it from a mesh in the scene
    viewer.scene.traverse(obj => {
      if (obj.constructor && obj.constructor.name === 'Mesh') {
        THREE = obj.constructor;
        return;
      }
    });
  }
  
  // If still not found, try window.THREE
  const THREE_Class = THREE || window.THREE;
  
  if (!THREE_Class) {
    console.error('❌ THREE.js not found. Try accessing via: viewer.scene.children[0].constructor');
    return;
  }
  
  let materialsWithTextures = 0;
  let materialsWithoutTextures = 0;
  let whiteMaterials = 0;
  
  viewer.scene.traverse(obj => {
    // Check if it's a mesh by checking for material property
    if (obj.material && (obj.type === 'Mesh' || obj.constructor.name === 'Mesh')) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(mat => {
        const hasTexture = mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap;
        const color = mat.color;
        const isWhite = color && color.r === 1 && color.g === 1 && color.b === 1;
        
        if (hasTexture) {
          materialsWithTextures++;
          console.log('✅ Material with texture:', {
            object: obj.name || 'unnamed',
            material: mat.name || 'unnamed',
            hasMap: !!mat.map,
            hasNormalMap: !!mat.normalMap,
            color: color ? `rgb(${color.r}, ${color.g}, ${color.b})` : 'N/A'
          });
        } else {
          materialsWithoutTextures++;
          if (isWhite) {
            whiteMaterials++;
            console.warn('⚠️ White material without texture:', {
              object: obj.name || 'unnamed',
              material: mat.name || 'unnamed',
              color: color ? `rgb(${color.r}, ${color.g}, ${color.b})` : 'N/A',
              type: mat.constructor.name
            });
          }
        }
      });
    }
  });
  
  console.log('📊 Summary:', {
    materialsWithTextures,
    materialsWithoutTextures,
    whiteMaterials,
    total: materialsWithTextures + materialsWithoutTextures
  });
}
```

### 3. Check Specific Material Properties
```javascript
// Check a specific material's properties
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer or scene not found');
} else {
  viewer.scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(mat => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          console.log('Material:', {
            name: mat.name || 'unnamed',
            object: obj.name || 'unnamed',
            color: mat.color ? `rgb(${mat.color.r}, ${mat.color.g}, ${mat.color.b})` : 'N/A',
            map: mat.map ? '✅ Has texture' : '❌ No texture',
            roughness: mat.roughness,
            metalness: mat.metalness,
            envMapIntensity: mat.envMapIntensity,
            depthWrite: mat.depthWrite,
            depthTest: mat.depthTest,
            transparent: mat.transparent,
            opacity: mat.opacity
          });
        }
      });
    }
  });
}
```

### 4. Check Post-Processing System
```javascript
// Check post-processing system state
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found');
} else {
  const pp = viewer.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found');
  } else {
    console.log('Post-Processing System:', {
      enabled: pp.config?.enabled,
      aoEnabled: pp.config?.ao?.enabled,
      aoIntensity: pp.config?.ao?.saoIntensity,
      aoScale: pp.config?.ao?.saoScale,
      hasComposer: !!pp.composer,
      hasAOPass: !!pp.aoPass
    });
  }
}
```

### 5. Check if Materials Were Replaced
```javascript
// Check if materials are fallback materials (indicating replacement)
const viewer = window.__viewer || window.sharedViewer;
if (!viewer || !viewer.scene) {
  console.error('❌ Viewer or scene not found');
} else {
  let replacedCount = 0;
  viewer.scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(mat => {
        // Check if material is a fallback (gray color #dddddd)
        if (mat.color) {
          const r = mat.color.r;
          const g = mat.color.g;
          const b = mat.color.b;
          // #dddddd = rgb(0.866, 0.866, 0.866)
          if (Math.abs(r - 0.866) < 0.01 && Math.abs(g - 0.866) < 0.01 && Math.abs(b - 0.866) < 0.01) {
            if (!mat.map && !mat.normalMap) {
              replacedCount++;
              console.warn('⚠️ Possible fallback material:', {
                object: obj.name || 'unnamed',
                material: mat.name || 'unnamed',
                color: `rgb(${r}, ${g}, ${b})`,
                hasTexture: !!(mat.map || mat.normalMap)
              });
            }
          }
        }
      });
    }
  });
  console.log('📊 Fallback materials found:', replacedCount);
}
```

### 6. Test with AO Disabled
```javascript
// Disable AO to see if colors return
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found');
} else {
  const pp = viewer.postProcessingSystem;
  if (!pp) {
    console.error('❌ Post-processing system not found');
  } else {
    console.log('Current AO state:', pp.config?.ao?.enabled);
    // Disable AO
    pp.updateConfig({ ao: { enabled: false } });
    console.log('✅ AO disabled - check if car colors return');
    console.log('To re-enable: pp.updateConfig({ ao: { enabled: true } })');
  }
}
```

### 7. Check Tone Mapping Settings
```javascript
// Check tone mapping (could be washing out colors)
const viewer = window.__viewer || window.sharedViewer;
if (!viewer) {
  console.error('❌ Viewer not found');
} else {
  const renderer = viewer.renderer;
  console.log('Renderer tone mapping:', {
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    outputColorSpace: renderer.outputColorSpace
  });
  
  const pp = viewer.postProcessingSystem;
  if (pp && pp.config?.toneMapping) {
    console.log('Post-processing tone mapping:', pp.config.toneMapping);
  }
}
```

---

## Quick One-Liner to Check Materials

```javascript
// Quick check: Count materials with/without textures
(() => { const v = window.__viewer || window.sharedViewer; if (!v) return console.error('Viewer not found'); let withTex = 0, withoutTex = 0, white = 0; v.scene.traverse(o => { if (o instanceof THREE.Mesh && o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { const hasTex = m.map || m.normalMap; if (hasTex) withTex++; else { withoutTex++; if (m.color && m.color.r === 1 && m.color.g === 1 && m.color.b === 1) white++; } }); } }); console.log('Materials:', {withTextures: withTex, withoutTextures: withoutTex, whiteMaterials: white}); })();
```

---

## Troubleshooting Steps

1. **First, check if materials have textures** - Run command #2
2. **Check if materials are white** - Look for white materials in the output
3. **Try disabling AO** - Run command #6 to see if colors return
4. **Check tone mapping** - Run command #7 to see if exposure is too high
5. **Check if materials were replaced** - Run command #5 to see if fallback materials are being used

