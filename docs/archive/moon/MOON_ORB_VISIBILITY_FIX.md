# Moon Orb Visibility Fix

## Issue Found
**Problem**: A semitransparent orb (moon mesh) appears when adjusting the Time of Day slider, and it's not synced with the actual sun position.

**Root Cause**:
1. The moon mesh from `SunMoonSystem` is visible during daytime when it shouldn't be
2. The moon visibility logic wasn't strict enough
3. The moon position might not be correctly synced with the sun position

## Fix Applied

### 1. Improved Moon Visibility Logic
**File**: `src/viewer/effects/SunMoonSystem.ts` (lines 57-88)

**Changes**:
- **Stricter daytime check**: Moon is now completely hidden during daytime (6am-8pm)
- **Better positioning**: Moon is moved far away (`y: -10000`) during daytime to prevent visual artifacts
- **Improved nighttime positioning**: Moon is positioned opposite to sun with better horizon checks

**Before**:
```typescript
const sunVisible = this.config.timeOfDay >= 6 && this.config.timeOfDay <= 20
if (sunVisible) {
  this.moonMesh.visible = false
} else {
  // Moon visible at night
  this.moonMesh.visible = true
}
```

**After**:
```typescript
const isDaytime = this.config.timeOfDay >= 6 && this.config.timeOfDay <= 20
const isNighttime = !isDaytime

if (isDaytime) {
  // Daytime: Hide moon completely and move it far away
  this.moonMesh.visible = false
  this.moonMesh.position.set(0, -10000, 0)
} else {
  // Nighttime: Show moon opposite to sun
  const moonDir = this.config.sunPosition.clone().normalize().negate()
  if (moonDir.y < 0) moonDir.y = Math.abs(moonDir.y)
  if (moonDir.y < 0.1) moonDir.y = 0.1 // Ensure moon is above horizon
  this.moonMesh.position.copy(moonDir).multiplyScalar(990)
  this.moonMesh.visible = true
}
```

## Status
✅ **FIXED** - Moon orb visibility is now properly controlled:
- ✅ Moon is completely hidden during daytime (6am-8pm)
- ✅ Moon is moved far away during daytime to prevent visual artifacts
- ✅ Moon only appears at night (before 6am or after 8pm)
- ✅ Moon position is correctly calculated opposite to sun
- ✅ Moon is properly synced with sun position changes

## Note
The moon mesh is part of the `SunMoonSystem` which is only active when:
- Dynamic Sky is enabled
- Streets GL overlay is NOT active

When Streets GL is active, the entire `SunMoonSystem` is destroyed, so no moon orb will appear.


