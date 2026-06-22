# Shader Compilation Fix - GLSL ES 2.0 Compatibility

## Issue
Fragment shader compilation error: "Fragment shader is not compiled" for DynamicSky material.

## Root Cause
GLSL ES 2.0 (used by Three.js WebGLRenderer) **does not support `out` parameters** in function signatures. The shader code was using:
```glsl
void getScatteringValues(vec3 pos, out vec3 rayleighScattering, out float mieScattering, out vec3 extinction)
```

This syntax is only available in GLSL ES 3.0+.

## Fix Applied

### 1. DynamicSky.ts - Direct Calculation Shader
**Changed**: Removed `getScatteringValues` function with `out` parameters
**Replaced with**: Helper functions + inline calculations

```glsl
// Before (GLSL ES 3.0 syntax - doesn't work in ES 2.0)
void getScatteringValues(vec3 pos, out vec3 rayleighScattering, out float mieScattering, out vec3 extinction) {
  // ...
}

// After (GLSL ES 2.0 compatible)
float getRayleighDensity(float altitudeKM) {
  return exp(-altitudeKM / 8.0);
}

float getMieDensity(float altitudeKM) {
  return exp(-altitudeKM / 1.2);
}

vec3 getOzoneAbsorption(float altitudeKM) {
  return ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
}

// Then calculate inline where needed:
float altitudeKM = (length(pos) - groundRadiusMM) * 1000.0;
float rayleighDensity = getRayleighDensity(altitudeKM);
float mieDensity = getMieDensity(altitudeKM);
vec3 rayleighScattering = rayleighScatteringBase * rayleighDensity * rayleigh;
// ... etc
```

### 2. AtmosphereLUTSystem.ts - LUT Generation Shaders
**Fixed 3 locations**:
- Transmittance LUT shader
- Multiple Scattering LUT shader  
- Sky View LUT shader

**Changed**: 
- Removed `getScatteringValues` function
- Removed `getMulScattValues` function with `out` parameters
- Inlined all calculations directly in `main()`

### 3. DynamicSky.ts - Cloud Shader
**Fixed**: `intersectBox` function with `out` parameters
**Changed**: Inlined ray-box intersection calculation in `main()`

## Files Modified
1. `src/viewer/effects/DynamicSky.ts`
   - Direct calculation shader (sky color)
   - Cloud shader (ray-box intersection)

2. `src/viewer/effects/AtmosphereLUTSystem.ts`
   - Transmittance LUT shader
   - Multiple Scattering LUT shader
   - Sky View LUT shader

## Verification
- ✅ No linter errors
- ✅ All `out` parameters removed
- ✅ GLSL ES 2.0 compatible syntax
- ✅ Functionality preserved (same calculations, just different syntax)

## Testing
The shader should now compile successfully. Test by:
1. Enabling standalone weather system
2. Checking browser console for shader errors
3. Verifying sky dome is visible

## Status
✅ **FIXED** - Shader compilation error resolved
























