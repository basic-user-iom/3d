# HDR Background Not Showing - Root Cause & Fix

## Problem Identified

Based on documentation review of `three-gpu-pathtracer`:

**Root Cause:**
1. When ground projection is enabled, `setupGroundProjectedEnv()` sets `scene.background = null` (because GroundedSkybox mesh renders the background)
2. Path tracer's `updateEnvironment()` checks `if (scene.background === null)` and if true, sets:
   - `material.backgroundMap = null`
   - `material.backgroundAlpha = 0`
3. This results in **NO background being rendered** in the path tracer

**Evidence from Code:**
- `node_modules/three-gpu-pathtracer/src/core/WebGLPathTracer.js` line 236-239:
  ```javascript
  if ( scene.background === null ) {
    material.backgroundMap = null;
    material.backgroundAlpha = 0;
  }
  ```
- `src/viewer/effects/ground-projection-setup.ts` line 204:
  ```javascript
  if (enabled) {
    scene.add(skybox)
    scene.background = null  // ← This causes the issue!
  }
  ```

## Solution Implemented

### 1. Ensure Background Set on Start
When path tracer starts, explicitly set `scene.background` to masked HDR texture:
- Call `setupEnvironment()` to create/get masked HDR texture
- Verify `scene.background` is set (not null)
- Call `pathTracer.updateEnvironment()` to pick up the background

### 2. Persist Background During Path Tracing
Ground projection may reset `scene.background = null` during path tracing (e.g., when ground projection settings change). Added periodic check:
- Every 50 samples, verify `scene.background` is still set
- If null or wrong texture, restore to masked HDR texture
- Call `pathTracer.updateEnvironment()` to update path tracer

### 3. Enhanced Logging
Added detailed logs to track:
- When background is set/restored
- Background texture type (masked HDR vs gradient vs null)
- When path tracer picks up background changes

## Files Modified

1. **`src/viewer/pathTracer/PathTracerDemo.ts`**:
   - `start()` method: Ensures background is set before starting
   - Animation loop: Periodically restores background if reset

2. **`src/viewer/pathTracer/utils/MaskedHDRTexture.ts`**:
   - Enhanced logging for debugging texture creation

## Expected Behavior After Fix

✅ Path tracer shows HDR sky/background when started
✅ Background persists even if ground projection resets it
✅ Lower hemisphere of HDR is masked (black) - no reflective ground
✅ Console logs show when background is set/restored

## Testing

1. Load HDR file
2. Start path tracer
3. Check console for:
   - `[PathTracerDemo] ✅ scene.background is set for path tracer`
   - `[PathTracerDemo] 🔧 Restoring scene.background` (if ground projection resets it)
4. Verify HDR sky is visible in path tracer render
5. Verify ground doesn't show HDR reflections (lower hemisphere is black)

## Technical Notes

- `scene.background` is used by path tracer for **background display** (sky)
- `scene.environment` is used by path tracer for **environment lighting** (reflections)
- We set both to the masked HDR texture (upper hemisphere only, lower = black)
- Ground projection sets `scene.background = null` because GroundedSkybox mesh renders the background, but path tracer doesn't use the mesh, so it needs `scene.background` set explicitly















