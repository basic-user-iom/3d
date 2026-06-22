# Shader Compilation Fix - GLSL ES 2.0 'const' Keyword Issues

## Issue
Fragment shader compilation error: "Fragment shader is not compiled" for DynamicSky material.

## Root Cause
GLSL ES 2.0 has strict rules about the `const` keyword:
1. **Function parameters cannot be `const`** - This is only allowed in GLSL ES 3.0+
2. **Variables initialized with uniforms cannot be `const`** - `const` can only be used for compile-time constants

## Fixes Applied

### 1. DynamicSky.ts - Phase Functions
**Problem**: Using `const` with uniform-dependent variables
```glsl
// BEFORE (Invalid in GLSL ES 2.0)
float getMiePhase(float cosTheta) {
  const float g = mieDirectionalG;  // ❌ mieDirectionalG is a uniform, not compile-time constant
  const float scale = 3.0 / (8.0 * PI);
  // ...
}

float getRayleighPhase(float cosTheta) {
  const float k = 3.0 / (16.0 * PI);  // ✅ This is OK (compile-time constant)
  // ...
}
```

**Fixed**:
```glsl
// AFTER (GLSL ES 2.0 compatible)
float getMiePhase(float cosTheta) {
  float g = mieDirectionalG;  // ✅ No 'const' for uniform-dependent variable
  float scale = 3.0 / (8.0 * PI);  // ✅ Removed 'const' for consistency
  // ...
}

float getRayleighPhase(float cosTheta) {
  float k = 3.0 / (16.0 * PI);  // ✅ Removed 'const' for consistency
  // ...
}
```

### 2. DynamicSkyLUTShader.ts - Function Parameter
**Problem**: Using `const` in function parameter
```glsl
// BEFORE (Invalid in GLSL ES 2.0)
float safeacos(const float x) {  // ❌ Function parameters cannot be 'const' in ES 2.0
  return acos(clamp(x, -1.0, 1.0));
}
```

**Fixed**:
```glsl
// AFTER (GLSL ES 2.0 compatible)
float safeacos(float x) {  // ✅ Removed 'const' from parameter
  return acos(clamp(x, -1.0, 1.0));
}
```

### 3. AtmosphereLUTSystem.ts - Function Parameter
**Problem**: Same issue as #2
```glsl
// BEFORE (Invalid in GLSL ES 2.0)
float safeacos(const float x) {  // ❌ Function parameters cannot be 'const' in ES 2.0
  return acos(clamp(x, -1.0, 1.0));
}
```

**Fixed**:
```glsl
// AFTER (GLSL ES 2.0 compatible)
float safeacos(float x) {  // ✅ Removed 'const' from parameter
  return acos(clamp(x, -1.0, 1.0));
}
```

## GLSL ES 2.0 'const' Rules
- ✅ **Allowed**: `const float PI = 3.141592653589793;` (compile-time constant)
- ✅ **Allowed**: `const vec3 up = vec3(0.0, 1.0, 0.0);` (compile-time constant)
- ❌ **Not Allowed**: `const float g = uniformValue;` (uniform-dependent)
- ❌ **Not Allowed**: `float func(const float x)` (function parameters)

## Files Modified
1. `src/viewer/effects/DynamicSky.ts` - Fixed phase functions
2. `src/viewer/effects/DynamicSkyLUTShader.ts` - Fixed safeacos() parameter
3. `src/viewer/effects/AtmosphereLUTSystem.ts` - Fixed safeacos() parameter

## Testing
The shader should now compile successfully. The error "Fragment shader is not compiled" should be resolved.
























