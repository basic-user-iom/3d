# HDR Ground Projection Shadows - Research Findings

## Summary
After researching path tracers and HDR ground projection, here are the key findings:

## Problem
Shadows are not appearing on the HDR ground-projected surface (`GroundedSkybox`) in the path tracer, despite:
- Converting `GroundedSkybox` material to `MeshStandardMaterial`
- Setting `receiveShadow = true`
- Ensuring proper opacity (0.85)

## Root Cause
1. **Path Tracers Need Directional Lights with Shadows**: 
   - Path tracers compute shadows via ray tracing
   - They need explicit directional lights with `castShadow = true`
   - Environment maps (HDR) provide ambient lighting but don't cast direct shadows

2. **GroundedSkybox Geometry Limitation**:
   - `GroundedSkybox` uses a complex sphere geometry with custom vertex manipulation
   - Path tracers may have difficulty computing shadows on non-standard geometries
   - The ground projection math modifies vertices in ways that may confuse shadow ray tracing

3. **Material Opacity vs Light Transmission**:
   - Semi-transparent materials (opacity < 1.0) reduce shadow visibility
   - Path tracers need adequate opacity to block light rays for shadow computation
   - Balance needed: opacity high enough for shadows, low enough to let environment light through

## Solution Recommendations

### Option 1: Add Directional Light with Shadows (Recommended)
- Ensure at least one `DirectionalLight` has `castShadow = true`
- Position the light to simulate sunlight from the HDR environment
- This provides explicit shadow casting that path tracers can compute

### Option 2: Use Separate Shadow Plane (Current Workaround)
- Create a flat plane at Y=0 with `receiveShadow = true`
- Use a semi-transparent material (opacity ~0.6) as shadow catcher
- This works but doesn't show HDR ground projection

### Option 3: Adjust Ground Height
- Ensure objects are positioned above the ground (GroundedSkybox is at `height - 0.01`)
- Default height is 15, so ground is at Y=14.99
- Objects below this won't cast shadows on the ground

## Current Implementation Status
- ✅ GroundedSkybox converted to PBR material (`MeshStandardMaterial`)
- ✅ `receiveShadow = true` set on GroundedSkybox
- ✅ Opacity set to 0.85 (balance between shadows and light transmission)
- ✅ Tone mapping exposure increased to 2.5 when ground is included
- ⚠️ **MISSING**: No verification that directional lights have `castShadow = true`

## Next Steps
1. Verify scene has at least one directional light with `castShadow = true`
2. Log light configuration when path tracer initializes
3. Auto-enable shadows on directional lights if none exist
4. Consider creating a default sun light if no shadow-casting lights exist

## References
- Three.js GroundedSkybox: https://threejs.org/examples/#webgl_materials_envmaps_groundprojected
- Path Tracing Shadows: Path tracers compute shadows via ray tracing, requiring explicit light sources
- Unity Environment Shadows: Similar principle - HDR provides ambient, directional lights provide shadows













