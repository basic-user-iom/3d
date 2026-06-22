# Coordinate Swap Fix

## Problem Identified
Console logs showed objects positioned at:
- `pos(3880909.2, 5.0, -10802237.7)`

But Web Mercator coordinates for lat: 32.89917, lon: -97.03813 are:
- Web Mercator X (east-west) = -10,802,237.7
- Web Mercator Y (north-south) = 3,880,909.2

The coordinates were swapped!

## Root Cause
Streets GL uses a coordinate system where:
- `position.x` = Web Mercator Y (north-south)
- `position.z` = Web Mercator X (east-west)
- `position.y` = height above ground

But `latLonToStreetsGL` was returning:
- `x: mercator.x` (Web Mercator X) ❌
- `z: mercator.y` (Web Mercator Y) ❌

## Fix
Updated `latLonToStreetsGL` to swap coordinates:
```typescript
return {
  x: mercator.y,  // Web Mercator Y (north-south) → Streets GL X
  y: height,      // Height above ground
  z: mercator.x   // Web Mercator X (east-west) → Streets GL Z
}
```

## Expected Result
After fix, objects should be positioned at:
- `pos(3880909.2, 5.0, -10802237.7)` ✅
  - X = 3,880,909.2 (Web Mercator Y - north-south) ✅
  - Y = 5.0 (height) ✅
  - Z = -10,802,237.7 (Web Mercator X - east-west) ✅

This matches the Streets GL coordinate system!


