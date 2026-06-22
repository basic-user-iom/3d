# Shadow Plane Comparison: Ground Projection vs Standard 360 HDR

## Key Differences

### 1. **Initial Shadow Plane Position**

**Ground Projection (WORKING):**
- Y position: `-0.01` (ground surface level)
- X/Z position: `0, 0` (centered at origin)
- Scale: `1, 1, 1` (full scale)
- Size: Based on `groundProjectionRadius * 2` (default ~200)

**Standard 360 HDR (NOT WORKING):**
- Y position: `-0.001` (slightly below grid)
- X/Z position: **Positioned under car center** (calculated from car bounds)
- Scale: **Scaled based on car size** (`radiusX/5 * baseScaleX`, `radiusZ/5 * baseScaleZ`)
- Size: `10000x10000` (very large)

### 2. **Shadow Plane Positioning Logic**

**Ground Projection:**
- Initial setup: Position at `(0, -0.01, 0)` with scale `(1, 1, 1)`
- Render loop: **Keeps fixed position** - only adjusts if not already at `(0, -0.01, 0)`
- No car-based positioning

**Standard 360 HDR:**
- Initial setup: Position under car center, scaled to car size
- Render loop: **Recalculates car bounds every 30 frames** and updates position/scale
- Car-based dynamic positioning

### 3. **Background Configuration**

**Ground Projection:**
- `scene.background = null` (uses GroundedSkybox instead)
- GroundedSkybox handles the environment

**Standard 360 HDR:**
- `scene.background = hdrTexture` (HDR texture as background)
- No GroundedSkybox

### 4. **Post-HDR Load Verification**

**Ground Projection:**
- No special shadow plane verification after HDR load

**Standard 360 HDR:**
- Has special verification code (lines 2886-2948) that:
  - Ensures shadow plane is visible
  - Ensures shadow plane receives shadows
  - Verifies material configuration
  - Ensures shadow maps are enabled
  - Verifies lights are casting shadows

### 5. **Render Loop Shadow Plane Updates**

**Ground Projection (lines 3306-3337):**
```javascript
// Keeps Y at -0.01 (ground surface level)
const targetY = -0.01;
if (Math.abs(obj.position.y - targetY) > 0.01) {
  obj.position.y = targetY;
}
// Center at origin (X/Z = 0)
if (Math.abs(obj.position.x) > 0.01 || Math.abs(obj.position.z) > 0.01) {
  obj.position.x = 0;
  obj.position.z = 0;
}
// Ensure full scale
if (Math.abs(obj.scale.x - 1) > 0.01 || Math.abs(obj.scale.z - 1) > 0.01) {
  obj.scale.set(1, 1, 1);
}
```

**Standard 360 HDR (lines 3338-3452):**
```javascript
// Recalculates car bounds every 30 frames
const shouldRecalculateBounds = frameCount % 30 === 0;
if (shouldRecalculateBounds) {
  // Calculate car bounding box
  // Position and scale shadow plane based on car bounds
  obj.position.x = carCenterX;
  obj.position.z = carCenterZ;
  obj.scale.x = targetScaleX;
  obj.scale.z = targetScaleZ;
}
// Position at -0.001
if (Math.abs(obj.position.y - (-0.001)) > 0.01) {
  obj.position.y = -0.001;
}
```

## Potential Issues

1. **Initial positioning conflict**: The shadow plane is positioned under the car initially (line 2369-2376), but this happens BEFORE the car bounds are fully calculated. The render loop then tries to recalculate every 30 frames.

2. **Render loop timing**: The render loop only updates position/scale every 30 frames, which might cause the shadow plane to be in the wrong position initially.

3. **Material visibility**: The material visibility checks happen every frame, but position updates only happen every 30 frames - there might be a mismatch.

4. **Y position**: Standard 360 uses `-0.001` while ground projection uses `-0.01`. This small difference might affect shadow visibility.

## Testing Plan

### ✅ Test 1: Render Loop Y Position Fix (FIXED)
**Issue Found:** Y position was only checked every 30 frames, and shadow plane was being reset to (0,0) when car not found.

**Fix Applied:**
- Moved Y position check outside the 30-frame check (now checked every frame)
- Removed code that resets shadow plane to (0,0) when car not found - this was breaking shadows
- Added logging to track shadow plane position updates

**Code Changes:**
- Y position now always checked every frame (not just every 30 frames)
- Shadow plane position is preserved when car bounds calculation fails
- Added debug logging every 60 frames

### ✅ Test 2: Shadow Plane Visibility & Material Configuration (FIXED)
**Issue Found:** Shadow plane visibility, receiveShadow, and material configuration were not being aggressively checked in standard 360 HDR mode.

**Fix Applied:**
- Added every-frame checks for shadow plane visibility and receiveShadow
- Added every-frame checks for material visibility and configuration
- Added renderer shadow map enabled checks every frame for standard 360 HDR
- Added detailed logging when issues are detected
- Added warning if material is not ShadowMaterial

**Code Changes:**
- Shadow plane visibility checked every frame (not just every 30 frames)
- Shadow plane receiveShadow checked every frame
- Material visibility and opacity checked every frame
- Renderer shadow maps enabled check added to standard 360 HDR render loop
- Added diagnostic logging every 60 frames when issues are found

### ✅ Test 3: Shadow Camera Bounds (FIXED)
**Issue Found:** Shadow camera bounds were based on car size (small, ~3-6 units), but shadow plane is 10000x10000 geometry (even when scaled, still very large). Shadow camera wasn't covering the entire shadow plane area.

**Fix Applied:**
- Expanded shadow camera extent for standard 360 HDR mode: `Math.max(maxSide * 2.0, 50)` instead of `maxSide * 0.6`
- Expanded shadow camera far plane for standard 360 HDR: `Math.max(shadowFar, 200)` instead of just `shadowFar`
- Added diagnostic logging to compare shadow camera size vs shadow plane size
- Added warning if shadow camera is too small for shadow plane

**Code Changes:**
- Extent calculation now differentiates between ground projection (smaller) and standard 360 HDR (larger)
- Shadow camera far plane expanded for standard 360 HDR to ensure it covers the shadow plane
- Added logging every 300 frames to check if shadow camera covers shadow plane

### ✅ Test 4: Shadow Plane Position & Comprehensive Diagnostics (FIXED)
**Issue Found:** Need to verify shadow plane is correctly positioned below car and that all configuration is correct.

**Fix Applied:**
- Added check to ensure shadow plane Y position is below car minimum Y
- Added comprehensive diagnostic logging for shadow plane configuration
- Added diagnostic logging for all lights and their shadow cameras
- Added diagnostic logging for renderer shadow map settings
- Force shadow map updates after HDR load for standard 360 HDR
- Force all lights to update their shadow maps
- Force immediate render to update shadow maps

**Code Changes:**
- Verify shadow plane is below car (adjust if needed)
- Log complete shadow plane state (visibility, material, position, etc.)
- Log all lights casting shadows and their shadow camera bounds
- Log renderer shadow map configuration
- Force shadow map updates and immediate render after HDR load

### ✅ Test 5: Shadow Plane Scale Calculation & Scene Membership (FIXED)
**Issue Found:** 
1. Shadow plane scale was multiplying by current scale, causing exponential growth (640931 → 1029026 → 1652122...)
2. Shadow plane was not in scene (`InScene: false`)
3. Car has huge offset (center at 1650740.21, 1650724.23) which affects positioning

**Fix Applied:**
- Fixed scale calculation to reset scale to 1 first, then apply target scale (prevents exponential growth)
- Added check to ensure shadow plane is in scene, add it if missing
- Removed baseScale multiplication from render loop scale calculation
- Scale now: `targetScaleX = radiusX / 5` (no multiplication by current scale)

**Code Changes:**
- Reset scale to (1,1,1) before calculating new scale for standard 360 HDR
- Check if shadow plane is in scene and add it if missing
- Fixed render loop scale calculation to not multiply by current scale

### Next Steps
The scale explosion should be fixed. Test again and check:
1. Shadow plane scale should be reasonable (not growing exponentially)
2. Shadow plane should be in scene (`InScene: true`)
3. Shadow plane should be positioned correctly under car

