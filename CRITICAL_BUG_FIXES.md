# Critical Bug Fixes - Based on Perplexity Research

## Issues Identified

### Issue 1: Path Tracer Background/Plane Color Not Restored
**Problem:** After exiting path tracer, background doesn't return to blue color, plane loses color.

**Perplexity Finding:**
> "Scene background restoration requires coordination between multiple systems. Background should be restored after all HDR operations complete, and material opacity/color should be explicitly restored."

**Root Cause:**
- Path tracer restores background with setTimeout, but HDR or other systems may override it
- Shadow plane material color/opacity not explicitly restored after path tracer
- Coordinator's path tracer stop handler doesn't restore shadow plane material properties

### Issue 2: Shadow Plane Disappears When HDR Disabled
**Problem:** Shadow plane disappears after turning HDR off.

**Perplexity Finding:**
> "When disabling HDR, material visibility and state must be explicitly managed. Shadow planes require `material.transparent`, `material.opacity`, and `material.color` to be properly set."

**Root Cause:**
- HDR disable sets clear color but doesn't restore shadow plane visibility
- Shadow plane material might be affected by HDR material updates
- Shadow plane visibility not checked/restored when HDR is disabled

### Issue 3: Shadows Don't Work in Weather System
**Problem:** Shadows don't work properly in weather system (CSM).

**Perplexity Finding:**
> "CSM shadow planes require: `receiveShadow = true`, `material.depthWrite = true`, and material must be set up for CSM using `csm.setupMaterial()`. The material must be MeshStandardMaterial or MeshPhysicalMaterial for CSM to work."

**Root Cause:**
- Shadow plane material might not be set up for CSM
- Shadow plane might not be receiving CSM shadows
- Material setup might be happening before CSM is ready

## Fixes Required

### Fix 1: Path Tracer Background/Plane Restoration
1. Ensure coordinator restores shadow plane material color/opacity
2. Coordinate background restoration with HDR system
3. Restore shadow plane material properties explicitly

### Fix 2: Shadow Plane Visibility on HDR Disable
1. Check and restore shadow plane visibility when HDR is disabled
2. Ensure shadow plane material state is correct
3. Restore shadow plane properties via coordinator

### Fix 3: Weather System Shadow Plane Setup
1. Ensure shadow plane material is set up for CSM
2. Verify shadow plane receives CSM shadows
3. Ensure setup happens after CSM is initialized


























