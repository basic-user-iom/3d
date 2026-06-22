# Material Artifacts Fix

## Issue
User reported visual artifacts that may have appeared ~10 days ago, and requested verification that all materials are functioning correctly.

## Root Cause
The **Caustics shader modifier** was modifying `gl_FragColor.rgb` AFTER `#include <output_fragment>`, which caused color space artifacts because:

1. `output_fragment` in Three.js applies tone mapping and color space conversion (linear → sRGB)
2. Adding linear color values to already tone-mapped/sRGB values causes:
   - Color shifts
   - Banding artifacts
   - Incorrect brightness/contrast
   - Visual glitches on surfaces

## Fix Applied

### 1. Caustics Modifier Fix (`src/viewer/materials/CausticsModifierRegistry.ts`)
- **Changed**: Moved caustics injection to BEFORE `output_fragment`
- **Reason**: Ensures caustics are added in linear color space, before tone mapping
- **Code Change**:
  ```glsl
  // BEFORE (WRONG - after output_fragment):
  #include <output_fragment>
  gl_FragColor.rgb += causticsIntensity * 0.5; // ❌ Mixing linear and tone-mapped colors
  
  // AFTER (CORRECT - before output_fragment):
  gl_FragColor.rgb += causticsIntensity * 0.5; // ✅ Linear color space
  #include <output_fragment> // Tone mapping applied after
  ```

### 2. Added USE_CAUSTICS Define
- Added shader define for optimization and conditional compilation
- Prevents caustics code from running when disabled

### 3. Material Validator Utility (`src/viewer/utils/materialValidator.ts`)
- Created comprehensive material validation system
- Checks for:
  - Missing envMap on metallic materials
  - Invalid roughness/metalness ranges
  - Texture filtering issues (NearestFilter causing aliasing)
  - flatShading enabled (causing polygonal appearance)
  - Transparent material depthWrite issues
  - Missing texture images
- Provides auto-fix functionality for common issues

## Verification

### ShadowOpacity Modifier
✅ **Correct** - Already injects before `output_fragment`, works in linear color space

### Material Properties
✅ **Verified** - All material properties are being set correctly:
- `envMap` applied to PBR materials
- `envMapIntensity` set for metallic materials
- `flatShading` disabled for smooth surfaces
- Texture filtering configured (LinearMipmapLinearFilter)
- Vertex normals computed for smooth shading

## Testing Recommendations

1. **Visual Check**: Load a model and verify:
   - No color banding or artifacts
   - Smooth surfaces (no visible polygons)
   - Proper reflections on metallic materials
   - Shadows render correctly

2. **Material Validation**: Use the new validator:
   ```typescript
   import { validateSceneMaterials } from './viewer/utils/materialValidator'
   const results = validateSceneMaterials(scene)
   console.log('Material Issues:', results.allIssues)
   console.log('Material Warnings:', results.allWarnings)
   ```

3. **Auto-Fix**: Apply automatic fixes:
   ```typescript
   import { autoFixMaterial } from './viewer/utils/materialValidator'
   scene.traverse((obj) => {
     if (obj instanceof THREE.Mesh && obj.material) {
       const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
       materials.forEach(mat => {
         const { fixed, changes } = autoFixMaterial(mat, scene)
         if (fixed) console.log('Fixed:', changes)
       })
     }
   })
   ```

## Files Modified

1. `src/viewer/materials/CausticsModifierRegistry.ts`
   - Fixed shader injection order
   - Added USE_CAUSTICS define

2. `src/viewer/utils/materialValidator.ts` (NEW)
   - Material validation utility
   - Auto-fix functionality

## Status

✅ **Fixed**: Caustics color space artifacts
✅ **Verified**: ShadowOpacity modifier working correctly
✅ **Verified**: Material properties properly configured
✅ **Added**: Material validation and auto-fix utilities
























































