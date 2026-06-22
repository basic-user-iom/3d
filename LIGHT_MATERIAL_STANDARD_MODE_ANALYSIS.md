# Light and Material Configuration Analysis - Standard Mode

## Perplexity Research Findings

### 1. Renderer Configuration Requirements
**Best Practice**: 
- `renderer.shadowMap.enabled = true` ✅
- `renderer.shadowMap.type = THREE.PCFSoftShadowMap` ✅

### 2. Light Configuration Requirements
**Best Practice**:
- Light must have `castShadow = true` ✅
- Shadow map size should be configured (1024x1024 or higher) ✅
- Shadow bias and normal bias should be set ✅
- Shadow camera near plane should be small (0.001) for interior shadows ✅

### 3. Material Configuration Requirements
**CRITICAL**: 
- **MeshBasicMaterial does NOT support shadows** ❌
- Must use **MeshStandardMaterial**, **MeshPhysicalMaterial**, or **MeshPhongMaterial** ✅
- Objects must have `receiveShadow = true` ✅
- Objects that cast shadows must have `castShadow = true` ✅

## Current Configuration Status

### ✅ Renderer Configuration (CORRECT)
**File**: `src/viewer/ViewerCanvas.tsx` (lines 415-418)
```typescript
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = true
```
**Status**: ✅ **CORRECTLY CONFIGURED**

### ✅ Light Configuration (CORRECT)
**File**: `src/viewer/utils/lightUtils.ts` (lines 199-245)
- ✅ `light.castShadow = true` when `config.castShadow` is true
- ✅ Shadow map size from store (configurable)
- ✅ Shadow bias: `-0.0002`
- ✅ Normal bias: `0.02` (increased from 0.01)
- ✅ Shadow radius: `3` (configurable)
- ✅ Near plane: `0.001` (for interior shadows)
- ✅ Shadow camera bounds configured

**File**: `src/viewer/ViewerCanvas.tsx` (lines 1766-1775)
- ✅ Default sun light created with `castShadow: true`
- ✅ Light is enabled by default

**Status**: ✅ **CORRECTLY CONFIGURED**

### ⚠️ Material Configuration (MOSTLY CORRECT, BUT NEEDS VERIFICATION)

**File**: `src/viewer/useViewer.ts` (lines 1815-1839)
- ✅ **MeshBasicMaterial conversion**: Converting to MeshStandardMaterial for shadow support
- ✅ Logs warning when conversion happens
- ✅ Preserves material properties during conversion

**File**: `src/utils/materialConverter.ts`
- ✅ Utility function to convert MeshBasicMaterial to MeshStandardMaterial
- ✅ Preserves all material properties
- ✅ Handles transparent materials correctly

**Potential Issues**:
1. **MeshBasicMaterial instances still exist** in codebase:
   - Line 4289 in ViewerCanvas.tsx: Used for helper materials (OK - helpers don't need shadows)
   - Lines 5904, 5948, 5979, 9900: Checks for MeshBasicMaterial (OK - just checking)

2. **Material conversion happens during model load**:
   - ✅ Happens in `loadFromFile` and `loadFromUrl`
   - ✅ Transparent materials are handled separately
   - ⚠️ **Need to verify**: Are all materials being converted? Are there any missed?

## Recommendations

### 1. Verify Material Conversion
**Action**: Add diagnostic logging to verify all MeshBasicMaterial instances are converted
```typescript
// After model load, check for any remaining MeshBasicMaterial
scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh && obj.material) {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    materials.forEach((mat) => {
      if (mat instanceof THREE.MeshBasicMaterial && !obj.userData.isHelper) {
        console.warn('[ShadowDebug] ⚠️ MeshBasicMaterial found that should be converted:', {
          mesh: obj.name,
          material: mat.name
        })
      }
    })
  }
})
```

### 2. Verify Shadow Properties on Objects
**Action**: Ensure all model meshes have correct shadow properties
```typescript
// Verify all meshes have receiveShadow = true
scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh && obj.userData.isImportedModel) {
    if (!obj.receiveShadow) {
      console.warn('[ShadowDebug] ⚠️ Mesh missing receiveShadow:', obj.name)
    }
    // Opaque meshes should cast shadows
    if (!isTransparent(obj) && !obj.castShadow) {
      console.warn('[ShadowDebug] ⚠️ Opaque mesh missing castShadow:', obj.name)
    }
  }
})
```

### 3. Verify Light Shadow Configuration
**Action**: Log light shadow configuration for debugging
```typescript
scene.traverse((obj) => {
  if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
    console.log('[ShadowDebug] Light configuration:', {
      name: obj.name,
      castShadow: obj.castShadow,
      shadowMapSize: obj.shadow.mapSize,
      shadowBias: obj.shadow.bias,
      shadowNormalBias: obj.shadow.normalBias,
      shadowCameraNear: obj.shadow.camera.near,
      shadowCameraFar: obj.shadow.camera.far
    })
  }
})
```

## Testing Checklist

1. ✅ **Renderer**: `shadowMap.enabled = true`, `type = PCFSoftShadowMap`
2. ✅ **Lights**: `castShadow = true`, shadow map size configured
3. ⚠️ **Materials**: Verify all MeshBasicMaterial converted to MeshStandardMaterial
4. ⚠️ **Objects**: Verify all meshes have `receiveShadow = true`
5. ⚠️ **Opaque Objects**: Verify opaque meshes have `castShadow = true`

## Files to Check

1. `src/viewer/ViewerCanvas.tsx` - Renderer and light initialization
2. `src/viewer/utils/lightUtils.ts` - Light creation and shadow configuration
3. `src/viewer/useViewer.ts` - Material conversion during model load
4. `src/utils/materialConverter.ts` - Material conversion utility

## Next Steps

1. Add diagnostic logging to verify material conversion
2. Add diagnostic logging to verify shadow properties on objects
3. Test with a car model to verify interior shadows work
4. Check console for any warnings about MeshBasicMaterial or missing shadow properties









