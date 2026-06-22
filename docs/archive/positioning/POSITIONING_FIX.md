# Positioning Fix - Objects Floating Issue

## Problem
Objects were floating around instead of being placed on the terrain surface. This was because objects were positioned at Y=0, which may be below the terrain elevation in Streets GL.

## Solution
Changed object positioning to use Y=1.5 meters instead of Y=0. This ensures objects sit on the terrain surface rather than floating or being buried below it.

## Changes Made

### 1. Initial Positioning (`positionModelOnGround`)
- **Before:** `targetY = 0` (ground level)
- **After:** `targetY = 1.5` (1.5 meters above ground to ensure object sits on terrain surface)

### 2. Streets GL Coordinate Sync (`syncModelToStreetsGL`)
- **Before:** `latLonToStreetsGL(mapLat, mapLon, 0)` (height = 0)
- **After:** `latLonToStreetsGL(mapLat, mapLon, objectHeight)` where `objectHeight = model.position.y || 1.5`

### 3. Camera-Based Positioning
- **Before:** `groundY = 5` (5 meters above terrain)
- **After:** `groundY = 1.5` (1.5 meters above terrain to ensure object sits on terrain surface)

## Why 1.5 meters?
- Streets GL has terrain elevation data
- Y=0 might be below the terrain surface
- 1.5 meters ensures objects are visible on the terrain
- Small enough to appear "on the ground" but high enough to avoid being buried

## Testing
After this fix, objects should:
- ✅ Appear on the terrain surface (not floating)
- ✅ Not be buried below the terrain
- ✅ Cast shadows correctly on the terrain
- ✅ Be visible and properly positioned

## Next Steps (Optional)
If terrain elevation data becomes available from Streets GL, we could:
1. Query terrain height at object's X/Z position
2. Position objects at exact terrain height + small offset
3. This would provide more accurate placement for hilly terrain


