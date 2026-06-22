# Conflict Fixes Applied

## Based on Online Research & Best Practices

### 1. Ground Projection Shader Injection ✅
- **Fix**: Changed from regex replacement to safe post-processing approach
- **Method**: Modify `envColor` AFTER `envmap_fragment` has run, not before
- **Benefit**: Prevents shader compilation errors, works with all Three.js versions
- **Location**: `src/viewer/effects/HDRSystem.ts`

### 2. Post-Processing Order ✅
- **Correct Order**: Render → AO → SSS → SSR → Bloom → Anamorphic → LUT → Output (Tone Mapping)
- **Fix**: Reorganized `initialize()` to add passes in correct order
- **Added**: `validatePassOrder()` method to ensure correctness
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`

### 3. Shadow Intensity/Opacity Re-enabled ✅
- **Fix**: Removed temporary disable when ground projection is active
- **Reason**: Ground projection now uses safe post-processing that doesn't conflict
- **Location**: `src/viewer/ViewerCanvas.tsx`

### 4. Ground Projection Texture Sampling ✅
- **Fix**: Added proper `#ifdef ENVMAP_TYPE_CUBE` checks for textureCube vs texture2D
- **Benefit**: Works with both cube maps and equirectangular maps
- **Location**: `src/viewer/effects/HDRSystem.ts`

### 5. Precision Qualifiers ✅
- **Fix**: Added `precision highp float;` to SSR shader
- **Benefit**: Prevents WebGL compilation errors
- **Location**: `src/viewer/postprocessing/SSRShader.ts`

### 6. Camera Position Calculation ✅
- **Fix**: Added `inverseViewMatrix` uniform for proper camera world position calculation
- **Benefit**: More accurate ground projection view direction
- **Location**: `src/viewer/effects/HDRSystem.ts`

## Remaining Optimizations

### 7. Water Exclusion from SSR (TODO)
- **Status**: Comment added, needs implementation
- **Action**: Add material flag check or normal-based heuristic to exclude water
- **Location**: `src/viewer/postprocessing/SSRShader.ts`

### 8. Centralized envMap Application (TODO)
- **Status**: Identified but not yet implemented
- **Action**: Create MaterialEnvironmentManager to reduce redundant traversals
- **Benefit**: Better performance, single source of truth

### 9. ShaderModifierRegistry Integration (TODO)
- **Status**: Framework created but not integrated
- **Action**: Migrate all shader modifiers to use registry
- **Benefit**: Prevents conflicts, easier to manage multiple modifiers

## Testing Checklist

- [ ] Test ground projection with HDR enabled
- [ ] Test shadow intensity + opacity + ground projection together
- [ ] Test post-processing effects in correct order
- [ ] Test SSR with water materials (should exclude water)
- [ ] Test all features together (no conflicts)







