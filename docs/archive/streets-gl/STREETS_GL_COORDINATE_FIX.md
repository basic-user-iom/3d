# Streets GL Coordinate System Fix

## Problem
Objects were not appearing correctly inside OpenStreetMap when using Streets GL overlay. The issue was that objects were being synced using Three.js world coordinates, but Streets GL uses its own coordinate system (Web Mercator projection).

## Root Cause
1. **Coordinate System Mismatch**: Three.js uses its own world coordinate system, while Streets GL uses Web Mercator projection (typical for map systems)
2. **Incorrect Position Sync**: When syncing objects to Streets GL, we were sending Three.js world coordinates directly, which don't match Streets GL's coordinate system
3. **Missing Coordinate Conversion**: No conversion was happening between Three.js coordinates and Streets GL coordinates

## Solution

### 1. Store Streets GL Camera Position
When positioning objects, we now store the Streets GL camera position:
```typescript
model.userData.streetsGLCameraPosition = cameraPos
```

### 2. Calculate Streets GL Position
When positioning objects relative to the camera, we calculate the position in Streets GL's coordinate system:
```typescript
const streetsGLX = cameraPos.x + forwardX
const streetsGLY = groundY
const streetsGLZ = cameraPos.z + forwardZ

model.userData.streetsGLPosition = {
  x: streetsGLX,
  y: streetsGLY,
  z: streetsGLZ
}
```

### 3. Use Streets GL Coordinates When Syncing
When syncing objects to Streets GL, we now use the stored Streets GL position instead of Three.js position:
```typescript
if (model.userData.streetsGLPosition) {
  streetsGLObject.position = model.userData.streetsGLPosition
}
```

## Key Changes

### `positionModelOnGround()` function:
- Stores Streets GL camera position in `model.userData.streetsGLCameraPosition`
- Calculates Streets GL position and stores it in `model.userData.streetsGLPosition`
- Keeps Three.js position at origin (0,0,0) for visual alignment with iframe

### `syncModelToStreetsGL()` function:
- Checks for stored Streets GL position first
- Uses Streets GL coordinates instead of Three.js coordinates
- Falls back to calculating from camera position if needed

## Testing

### Test 1: Create Primitive with Streets GL Overlay
1. Enable "Show Streets GL 3D Buildings (iframe overlay)"
2. Create a primitive (cube)
3. **Expected**: Object appears on the map at the correct location
4. Check console: `[StreetsGLSync] Using stored Streets GL coordinates`

### Test 2: Verify Coordinate Conversion
1. Enable Streets GL overlay
2. Create a primitive
3. Check console logs:
   - `[ModelPosition] ✅ Repositioned car in Streets GL coordinate system`
   - Should show both `streetsGLPosition` and `threeJSPosition`
   - `[StreetsGLSync] Using stored Streets GL coordinates`

### Test 3: Transform Objects
1. Create a primitive
2. Drag/scale the object
3. **Expected**: Object updates correctly in Streets GL
4. Check console: `[StreetsGLSync] ✅ Object successfully updated in Streets GL`

## Technical Details

### Streets GL Coordinate System
- Streets GL uses **Web Mercator projection** (EPSG:3857)
- Coordinates are in meters from a reference point
- Camera position is in Streets GL's coordinate system
- Objects must be positioned in Streets GL space, not Three.js space

### Three.js Coordinate System
- Three.js uses its own world coordinate system
- For iframe overlay, objects at origin (0,0,0) align visually with map center
- But when syncing to Streets GL, we need Streets GL coordinates

### Coordinate Conversion
- **Three.js → Streets GL**: Add camera position to Three.js position
- **Streets GL → Three.js**: Not needed (Three.js position stays at origin for visual alignment)

## Files Modified

1. `src/viewer/useViewer.ts`:
   - `positionModelOnGround()`: Stores Streets GL camera position and calculates Streets GL position
   - `syncModelToStreetsGL()`: Uses Streets GL coordinates when syncing

## Next Steps

1. Test object placement with the fix
2. Verify objects appear correctly on the map
3. Test transform controls (drag/scale) to ensure updates work
4. Check console logs for coordinate conversion messages


