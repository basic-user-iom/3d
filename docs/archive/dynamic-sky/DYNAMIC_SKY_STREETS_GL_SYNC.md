# Dynamic Sky Streets GL Sync Integration

## Changes Made

### 1. Enabled Dynamic Sky with Streets GL
**File**: `src/components/WeatherPanel.tsx`

- **Removed**: `disabled={!!(streetsGLIframeOverlay && streetsGLBridge)}` from Dynamic Sky checkbox
- **Updated**: Note to explain that Dynamic Sky syncs with Streets GL
- **Result**: Dynamic Sky can now be enabled even when Streets GL overlay is active

### 2. Sun Direction Sync
**File**: `src/viewer/ViewerCanvas.tsx`

- **Added**: Logic to sync Dynamic Sky's sun position with Streets GL's sun direction
- **How it works**:
  1. When Streets GL overlay is active AND Dynamic Sky is enabled
  2. Find the sun light (directional light with `isSun` flag)
  3. Calculate sun direction from sun light (position to target)
  4. Use this direction for Dynamic Sky's sun position
  5. Dynamic Sky automatically updates to match Streets GL's sun direction

**Code Location**: 
- Lines ~6865-6908 in `ViewerCanvas.tsx` (Streets GL branch - Option 1)
- Lines ~7015-7033 in `ViewerCanvas.tsx` (Standalone weather branch - Option 2)

**Implementation Details**:

1. **When Streets GL is active** (Option 1):
   - Streets GL sun direction is set from `timeOfDay` via `streetsGLBridge.setSunDirection()`
   - Dynamic Sky uses the same `sunDir` calculated from `timeOfDay` to ensure synchronization
   - Code uses `sunDir.clone().multiplyScalar(1000)` to convert direction to position for Three.js Sky

2. **When Standalone Weather is active** (Option 2):
   - If Streets GL overlay is also active, sync Dynamic Sky with Streets GL sun light direction
   - Finds the sun light (directional light with `userData.isSun` flag) from the `directionalLights` Map
   - Calculates sun direction from sun light (position to target)
   - Uses this direction for Dynamic Sky's sun position

```typescript
// Option 1: Streets GL branch (lines ~6865-6908)
if (streetsGLIframeOverlay && streetsGLBridge) {
  // ... sync to Streets GL ...
  
  // CRITICAL: If Dynamic Sky is enabled, sync its sun position with Streets GL sun direction
  if (viewerRef.current.dynamicSky) {
    // Use the sunDir that was calculated from timeOfDay (same as what was sent to Streets GL)
    const finalSunPosition = sunDir.clone().multiplyScalar(1000)
    // ... update Dynamic Sky with finalSunPosition ...
  }
}

// Option 2: Standalone weather branch (lines ~7015-7033)
if (viewerRef.current.dynamicSky) {
  let finalSunPosition = sunPosition
  if (streetsGLIframeOverlay && directionalLights) {
    // directionalLights is a Map, so convert to array first before using .find()
    const sunLight = Array.from(directionalLights.values()).find(
      l => l.userData.isSun && l instanceof THREE.DirectionalLight
    )
    if (sunLight && sunLight.target) {
      // Calculate sun direction from Streets GL sun light (position to target)
      const sunDir = new THREE.Vector3()
      sunDir.subVectors(sunLight.target.position, sunLight.position).normalize()
      // Convert direction to position for Three.js Sky
      finalSunPosition = sunDir.clone().multiplyScalar(1000)
    }
  }
  // ... update Dynamic Sky with finalSunPosition ...
}
```

### 3. Time of Day Sync
- **Already Working**: Dynamic Sky uses the same `timeOfDay` value from the store
- **Result**: When you change time of day, both Streets GL and Dynamic Sky update together

### 4. Shadow Settings Sync
- **Already Working**: Streets GL shadow quality controls affect Streets GL's CSM system
- **Dynamic Sky**: Uses the same sun direction, so shadows align automatically
- **Result**: Shadows in both systems match because they use the same sun direction

## How It Works

1. **Enable Streets GL Overlay**: Streets GL iframe loads with its atmosphere system
2. **Enable Dynamic Sky**: Dynamic Sky checkbox is now enabled (not disabled)
3. **Automatic Sync**: 
   - Dynamic Sky reads Streets GL's sun direction from the sun light
   - Dynamic Sky updates its sun position to match Streets GL
   - Both systems use the same time of day value
   - Shadows align because they use the same sun direction

## Benefits

✅ **Unified Sky System**: Dynamic Sky and Streets GL work together, not separately  
✅ **Consistent Lighting**: Sun direction, time of day, and shadows are synchronized  
✅ **Better Visuals**: Dynamic Sky provides procedural sky while Streets GL provides atmosphere  
✅ **No Conflicts**: Systems complement each other instead of competing  

## Testing

To test:
1. Enable Streets GL overlay
2. Enable Dynamic Sky
3. Adjust sun direction in Lighting panel → Dynamic Sky should update automatically
4. Adjust time of day → Both systems should update together
5. Change shadow quality → Shadows should match in both systems

## Notes

- Dynamic Sky renders in the Three.js scene (as a sky mesh)
- Streets GL atmosphere renders in the Streets GL iframe (background)
- Both systems use the same sun direction, so they appear consistent
- Time of day is shared between both systems
- Shadow settings from Streets GL affect Streets GL shadows, and Dynamic Sky uses the same sun direction for visual consistency


