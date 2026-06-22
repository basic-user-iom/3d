# Path Tracer Sky Dome Issue

## Observation
The translucent gray dome (GroundedSkybox from HDR ground projection) might be causing darker areas in path tracer rendering.

## Hypothesis
- GroundedSkybox is a physical mesh in the scene
- Path tracer includes it in BVH (Bounding Volume Hierarchy)
- The dome might be blocking/occluding light rays
- MeshBasicMaterial might not interact correctly with path tracer
- The dome's geometry might be causing unexpected light interactions

## Implementation Status
✅ **IMPLEMENTED**: PathTracerDemo now automatically excludes GroundedSkybox from path tracing by default
- GroundedSkybox is hidden before BVH generation
- Visibility is restored when path tracing stops
- Configurable via `excludeGroundedSkybox` option (default: true)

## Test Plan
1. **Test with GroundedSkybox excluded (default behavior):**
   - Path tracer automatically hides GroundedSkybox
   - Compare rendering results with dome excluded

2. **Test with GroundedSkybox included:**
   - Set `excludeGroundedSkybox: false` in PathTracerDemoConfig
   - Compare rendering results with dome included
   - Check if dome causes darker areas

3. **Test with GroundedSkybox disabled in Lighting Panel:**
   - Disable "Ground Projection" in Lighting Panel
   - Run path tracer and compare results
   - This removes the dome entirely from the scene

4. **Test with different GroundedSkybox settings:**
   - Test with different radius values
   - Test with different height values
   - Check if dome position affects dark areas

## Potential Solutions
1. **Exclude GroundedSkybox from path tracer (IMPLEMENTED):**
   - ✅ Hide GroundedSkybox before BVH generation
   - ✅ Restore visibility when path tracing stops
   - ✅ Configurable via excludeGroundedSkybox option

2. **Adjust GroundedSkybox material:**
   - Make it fully transparent for path tracer
   - Use different material properties
   - Adjust visibility based on path tracer state

3. **Use different environment mapping:**
   - Use scene.environment instead of GroundedSkybox
   - Use scene.background for environment
   - Let path tracer handle environment mapping internally

## Files Modified
- `src/viewer/pathTracer/PathTracerDemo.ts` - Added GroundedSkybox exclusion logic
- Added `excludeGroundedSkybox` option to PathTracerDemoConfig (default: true)

## Notes
- GroundedSkybox uses MeshBasicMaterial with depthWrite: false
- GroundedSkybox is positioned at height - 0.01 (slightly above ground)
- GroundedSkybox radius defaults to 100
- GroundedSkybox is marked with userData.isGroundedSkybox = true
- Path tracer now detects GroundedSkybox by: userData flag, type, or geometry (large SphereGeometry with radius > 50)

## Image Analysis
Based on provided images:
- Image 1: Shows diagonal gray overlay (possibly rendering artifact or UI element)
- Image 2: Shows car WITH dome visible (GroundedSkybox is present)
- Image 3: Shows car WITHOUT dome (cleaner render, dome excluded)
- Image 4: Shows car WITH dome again (dome visible on left side)

**Conclusion**: When dome is excluded (Image 3), rendering appears cleaner. When dome is present (Images 2 & 4), it's visible and might affect lighting. The automatic exclusion should prevent this issue.
