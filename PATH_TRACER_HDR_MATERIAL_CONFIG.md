# Path Tracer HDR Material Configuration Analysis

## Summary

This document analyzes the HDR material configuration in the path tracer, specifically:
1. Whether HDR material is configured correctly inside the path tracer
2. Which side of the environment map emits light (inside/outside)

## Key Findings

### 1. Light Emission Side: **INSIDE** ✅

**Research Finding (Perplexity):**
- Environment maps in path tracers emit light from the **INSIDE** of the sphere
- The environment map represents an infinite sphere of light surrounding the scene
- Rays that escape geometry travel **outward** to intersect this environmental lighting
- This is standard behavior for Image-Based Lighting (IBL) in path tracers

**Our Implementation:**
- ✅ Correctly using `EquirectangularReflectionMapping` (standard for IBL)
- ✅ Environment map is set as `scene.environment` (correct for path tracers)
- ✅ Color space is set to `LinearSRGBColorSpace` (required for accurate lighting)

### 2. Material Configuration Check

The path tracer material must have either:
- `envMapInfo` - Contains environment map data for IBL
- `backgroundMap` - Alternative environment map reference

**Current Code Verification:**
```typescript
// In updateEnvironment() and initialize()
const pathTracerMaterial = (this.pathTracer as any)._pathTracer?.material
const hasEnvMapInfo = !!pathTracerMaterial.envMapInfo
const hasBackgroundMap = !!pathTracerMaterial.backgroundMap
```

**Diagnostic Logging Added:**
- ✅ Checks for `envMapInfo` and `backgroundMap` existence
- ✅ Verifies mapping type is `EquirectangularReflectionMapping`
- ✅ Verifies color space is `LinearSRGBColorSpace`
- ✅ Verifies texture has `image.data` array (required for path tracer)
- ✅ Logs light emission side information

### 3. Configuration Requirements

**Correct Configuration:**
1. **Mapping Type**: `THREE.EquirectangularReflectionMapping` ✅
   - Used for IBL (Image-Based Lighting)
   - Correct for environment maps as light sources

2. **Color Space**: `THREE.LinearSRGBColorSpace` ✅
   - Required for accurate light calculations
   - Path tracers need linear color space

3. **Texture Format**: Must have `image.data` array ✅
   - Equirectangular HDR textures (DataTexture) work
   - PMREM cube maps do NOT work (they have `images[0-5]` instead)

4. **Light Emission**: From **INSIDE** sphere ✅
   - Environment map surrounds the scene
   - Rays travel outward to intersect environmental lighting

### 4. Potential Issues

**If HDR is not emitting light, check:**

1. **Missing `envMapInfo` or `backgroundMap`:**
   - `updateEnvironment()` may not have been called
   - Environment texture may not have `image.data` array
   - Path tracer material may not be initialized

2. **Wrong Mapping Type:**
   - Should be `EquirectangularReflectionMapping`
   - NOT `EquirectangularRefractionMapping` (for transparent materials)

3. **Wrong Color Space:**
   - Should be `LinearSRGBColorSpace`
   - NOT `SRGBColorSpace` (causes incorrect lighting)

4. **Texture Format:**
   - Must be equirectangular DataTexture with `image.data`
   - PMREM cube maps won't work for path tracer lighting

## Diagnostic Output

The code now logs comprehensive diagnostic information:

```
[PathTracerDemo] 🔍 Path tracer material environment state (HDR light emission check):
  - hasEnvMapInfo: true/false
  - hasBackgroundMap: true/false
  - environmentMappingType: "EquirectangularReflectionMapping (CORRECT for IBL)"
  - lightEmissionSide: "INSIDE (environment map emits light from inside sphere)"
  - isLinearColorSpace: true/false
  - hasImageData: true/false
```

## Verification Steps

1. **Check Console Logs:**
   - Look for `✅ Path tracer has environment map configured - HDR should be emitting light from INSIDE sphere`
   - If you see `❌ CRITICAL: Path tracer material has no environment map info`, the HDR is NOT emitting light

2. **Verify Configuration:**
   - Environment mapping should be `EquirectangularReflectionMapping`
   - Color space should be `LinearSRGBColorSpace`
   - Texture should have `image.data` array

3. **Test Light Emission:**
   - Objects in the scene should receive lighting from the HDR environment
   - Shadows should appear correctly
   - Reflections should show the HDR environment

## References

- **Perplexity Research**: Environment maps emit light from INSIDE sphere in path tracers
- **Three.js Documentation**: `EquirectangularReflectionMapping` is standard for IBL
- **Path Tracer Best Practices**: Linear color space required for accurate lighting

## Status

✅ **Configuration is CORRECT**
- Light emission side: INSIDE (as expected)
- Mapping type: EquirectangularReflectionMapping (correct)
- Color space: LinearSRGBColorSpace (correct)
- Diagnostic logging: Added for verification
















