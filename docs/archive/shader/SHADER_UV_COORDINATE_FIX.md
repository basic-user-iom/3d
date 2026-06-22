# Shader UV Coordinate Fix

## Issue Found
**Bug**: Fragment shader was using `gl_FragCoord` (screen-space pixel coordinates) instead of `vUv` (mesh UV coordinates from vertex shader).

**Problem**:
- Vertex shader declares and sets `vUv = uv` (mesh UV coordinates, 0-1 across mesh surface)
- Fragment shader was ignoring `vUv` and computing UV from `gl_FragCoord / iResolution.xy` (screen pixel coordinates)
- This causes a coordinate system mismatch:
  - `vUv`: Represents 0-1 coordinates across the mesh geometry surface
  - `gl_FragCoord/iResolution`: Represents screen pixel coordinates (0-1 across screen)
- Result: Shader effect renders incorrectly, with coordinates misaligned to the actual mesh geometry

## Fix Applied

### File: `src/components/ShaderEditorPanel.tsx` (lines 56-65)

**Before** (incorrect - using screen-space coordinates):
```glsl
void main() {
  // Get pixel coordinates from fragment position
  vec2 fragCoord = gl_FragCoord.xy;
  
  // Normalized pixel coordinates (from 0 to 1)
  vec2 uv = fragCoord / iResolution.xy;

  // Centered coordinates (-1 to 1)
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= iResolution.x / iResolution.y;
```

**After** (correct - using mesh UV coordinates):
```glsl
void main() {
  // Use mesh UV coordinates from vertex shader (vUv)
  // vUv represents 0-1 coordinates across the mesh surface
  // This ensures the shader effect aligns with the actual mesh geometry
  vec2 uv = vUv;

  // Centered coordinates (-1 to 1)
  vec2 p = (uv - 0.5) * 2.0;
  // Apply aspect ratio correction based on screen resolution
  p.x *= iResolution.x / iResolution.y;
```

## Why This Matters

1. **Mesh Alignment**: Using `vUv` ensures the shader effect is properly aligned with the mesh geometry, not the screen
2. **Consistency**: The vertex shader sets `vUv`, so the fragment shader should use it
3. **Correct Rendering**: Screen-space coordinates (`gl_FragCoord`) would cause the effect to be tied to screen resolution and position, not the mesh surface

## Status
✅ **FIXED** - Fragment shader now correctly uses `vUv` (mesh UV coordinates) instead of screen-space pixel coordinates.


