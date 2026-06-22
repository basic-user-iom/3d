# Time of Day Slider Fix - Duplicate Sun Source Conflict

## Issue Found
**Problem**: Time of Day slider didn't work when Streets GL was active because:
1. Slider was disabled when Streets GL overlay was active
2. Code at lines 6773-6795 ALWAYS updated Three.js sun light from `timeOfDay`, even when Streets GL was active
3. This created a conflict where Streets GL sun direction (set via Lighting Panel) was being overwritten by `timeOfDay` calculation
4. Result: Slider appeared to not work because changes were being overwritten

## Root Cause
- **Lines 6773-6795**: Code always updated Three.js sun light position from `timeOfDay`, regardless of Streets GL state
- **WeatherPanel.tsx line 322**: Slider was disabled when Streets GL was active
- **No sync**: `timeOfDay` changes weren't syncing to Streets GL sun direction

## Fix Applied

### 1. Enable Time of Day Slider with Streets GL
**File**: `src/components/WeatherPanel.tsx`
- **Removed**: `disabled={!!(streetsGLIframeOverlay && streetsGLBridge)}` from Time of Day slider
- **Updated**: Note to explain that Time of Day syncs to Streets GL sun direction
- **Result**: Slider now works when Streets GL is active

### 2. Sync timeOfDay to Streets GL
**File**: `src/viewer/ViewerCanvas.tsx` (lines 6771-6810)
- **Added**: Logic to sync `timeOfDay` to Streets GL sun direction when Streets GL is active
- **How it works**:
  1. When Streets GL is active, calculate sun direction from `timeOfDay`
  2. Sync to Streets GL via `streetsGLBridge.setSunDirection()`
  3. Also update Three.js sun light for consistency (but Streets GL controls rendering)
- **When Streets GL is NOT active**: Update Three.js sun light normally from `timeOfDay`

### 3. Prevent Conflicts
- **Before**: Code always updated sun light from `timeOfDay`, causing conflicts
- **After**: When Streets GL is active, sync `timeOfDay` TO Streets GL instead of overwriting Streets GL's sun direction

## Code Changes

**Before** (always updated sun light):
```typescript
const { sunPosition } = timeOfDayToSkyAngles(timeOfDay, northOffset)
// Always updates sun light, even when Streets GL is active
directionalLights.forEach((light) => {
  if (light.userData.isSun) {
    light.position.copy(sunPosition.clone().multiplyScalar(1000))
    // ... updates light
  }
})
```

**After** (syncs to Streets GL when active):
```typescript
const { sunPosition } = timeOfDayToSkyAngles(timeOfDay, northOffset)

if (streetsGLIframeOverlay && streetsGLBridge) {
  // Sync timeOfDay to Streets GL sun direction
  const sunDir = sunPosition.clone().normalize()
  streetsGLBridge.setSunDirection({ x: sunDir.x, y: sunDir.y, z: sunDir.z })
  // Also update Three.js sun light for consistency
  // ... update light
} else {
  // Streets GL NOT active - update Three.js sun light normally
  // ... update light
}
```

## Verification

### No Duplicate Sun Lights Found
- Only one sun light is created (default at initialization)
- `SunMoonSystem` no longer creates sun light (removed per user request)
- No duplicate sun sources detected

## Status
✅ **FIXED** - Time of Day slider now works correctly:
- ✅ Slider enabled when Streets GL is active
- ✅ Changes sync to Streets GL sun direction
- ✅ No conflicts between Streets GL and Three.js sun systems
- ✅ Works correctly when Streets GL is inactive (updates Three.js sun light)


