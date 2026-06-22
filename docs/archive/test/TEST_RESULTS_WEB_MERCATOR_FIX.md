# Test Results - Web Mercator Coordinate Swap Fix

## Test Date
2025-11-20 16:07:39 UTC

## Screenshots Captured
1. **Before Cube Creation**: `test-before-cube-creation.png`
   - Shows Streets GL map loaded
   - Primitives panel open
   - Ready to create cube

2. **After Cube Creation**: `test-after-cube-creation-web-mercator-fix.png`
   - Shows cube created
   - Streets GL map visible in background

## Console Log Analysis

### Main App Console Logs
✅ **Primitive Created**:
```
[LOG] [PrimitivesPanel] Created primitive: {type: box, name: Box 1763654869930}
```

✅ **Positioning Started**:
```
[LOG] [ModelPosition] Starting positioning, model structure: {name: Box 1763654869930, type: Mesh, hasParent: true, parentType: Scene, currentPosition: Object}
[LOG] [ModelPosition] Using iframe overlay - positioned at origin (map center): {lat: 32.89917, lon: -97.03813, ...}
[LOG] [ModelPosition] Final position applied: {position: Object, rotation: Object, scale: Object}
```

⚠️ **Bridge Not Initialized**:
```
[WARNING] [PrimitivesPanel] ⚠️ Cannot sync to Streets GL: {hasBridge: false, iframeOverlay: true, note: Bridge may not be initialized yet. Ensure Streets GL server is running and iframe has loaded.}
```

### Issue Identified
The bridge is not initialized when the cube is created. This means:
1. The cube is positioned in Three.js scene (at origin)
2. But it's not synced to Streets GL yet because the bridge isn't ready

### Expected Behavior After Fix
With the coordinate swap fix applied, when the bridge initializes and syncs:
- Object should be positioned at: `pos(3880909.2, 5.0, -10802237.7)`
  - X = 3,880,909.2 (Web Mercator Y - north-south) ✅
  - Y = 5.0 (height) ✅
  - Z = -10,802,237.7 (Web Mercator X - east-west) ✅

## Coordinate Swap Fix Applied

The `latLonToStreetsGL` function now correctly swaps coordinates:
```typescript
return {
  x: mercator.y,  // Web Mercator Y (north-south) → Streets GL X
  y: height,      // Height above ground
  z: mercator.x   // Web Mercator X (east-west) → Streets GL Z
}
```

This matches Streets GL's coordinate system where:
- `position.x` = Web Mercator Y (north-south)
- `position.z` = Web Mercator X (east-west)

## Next Steps

1. **Wait for Bridge Initialization**: The bridge needs to be fully initialized before objects can sync. The PrimitivesPanel should retry syncing once the bridge is ready.

2. **Verify Object Position**: Once synced, check Streets GL console logs to confirm the object is positioned at the correct Web Mercator coordinates.

3. **Test Transform Controls**: After object is synced, test moving/rotating/scaling to verify updates are sent to Streets GL correctly.

## Files Modified
- `src/utils/mapCoordinates.ts`: Fixed coordinate swap in `latLonToStreetsGL` function


