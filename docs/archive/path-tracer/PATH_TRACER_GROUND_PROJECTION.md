# Path Tracer with Ground Projection - Best Practices

## Online Documentation Findings

Based on research on path tracing with ground-projected 360 HDR environments:

### Key Principles:

1. **Path Tracer Uses Environment Map, Not Visible Mesh:**
   - Path tracers should use the **equirectangular HDR environment map** directly for lighting calculations
   - The visible `GroundedSkybox` mesh is only for **display purposes** in regular rendering
   - The mesh should be **excluded from the BVH** (Bounding Volume Hierarchy) used by the path tracer
   - Including the mesh in the BVH can cause:
     - Blocked light rays
     - Unwanted reflections
     - Darker areas in the rendered image

2. **Ground Projection Architecture:**
   - Ground projection creates a `GroundedSkybox` mesh (a modified sphere) that displays the lower hemisphere projected onto the ground
   - When enabled: `scene.add(skybox)` and `scene.background = null`
   - When disabled: `scene.remove(skybox)` and `scene.background = envMap`
   - The environment map (`scene.environment`) remains set for material reflections

3. **Path Tracer Requirements:**
   - Path tracer needs `scene.environment` to be an **equirectangular texture** with `image.data`
   - Path tracer uses `scene.background` for background display
   - The visible skybox mesh should **not** be included in ray intersection tests

## Our Implementation Analysis

### Current Implementation ✅:

1. **GroundedSkybox Exclusion:**
   ```typescript
   excludeGroundedSkybox: config.excludeGroundedSkybox ?? true // Default: true
   ```
   - ✅ Defaults to `true` (excludes the dome)
   - ✅ Hides `GroundedSkybox` before BVH generation
   - ✅ Restores visibility when path tracing stops

2. **Environment Setup:**
   - ✅ Uses `originalHdrTexture` (equirectangular) for path tracing
   - ✅ Sets `scene.environment = originalHdrTexture` for lighting
   - ✅ Sets `scene.background = originalHdrTexture` for background display
   - ✅ Works even when ground projection is enabled

3. **Texture Access:**
   - ✅ `getOriginalHDRTexture()` exposes the equirectangular HDR
   - ✅ Path tracer can access it via `HDRSystem.getOriginalHDRTexture()`
   - ✅ Texture has required `image.data` structure

### Potential Issue ⚠️:

When **ground projection is enabled**:
- `HDRSystem` sets `scene.background = null` (because GroundedSkybox renders the background)
- `PathTracerDemo` sets `scene.background = originalHdrTexture` (for path tracer display)
- This creates a **temporary conflict** during path tracing

**Impact:** Minimal - Path tracer overrides `scene.background` which is correct for path tracing. When path tracer stops, ground projection restores `scene.background = null`.

### Recommendation:

Our implementation is **correct** and follows best practices:

1. ✅ Excludes visible skybox mesh from BVH
2. ✅ Uses equirectangular HDR for environment lighting
3. ✅ Handles both ground projection enabled/disabled cases
4. ✅ Restores original state when path tracing stops

The temporary override of `scene.background` during path tracing is intentional and correct.

## Summary

**Our code correctly implements path tracing with ground projection:**

- The `GroundedSkybox` mesh is excluded from path tracing (default behavior)
- The path tracer uses the original equirectangular HDR texture for lighting
- Background display is handled correctly during path tracing
- Original state is restored when path tracing stops

No changes needed - the implementation aligns with documentation and best practices! 🎉















