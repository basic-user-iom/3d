# Web Mercator Positioning Fix

## Problem
Objects were positioned incorrectly in Streets GL - they appeared floating in the middle of the screen instead of on the ground at the map location. The issue was that objects were not using the same coordinate system as buildings.

## Root Cause
1. **Coordinate System Mismatch**: Streets GL uses Web Mercator projection (EPSG:3857) for all coordinates, including tiles and buildings
2. **Incorrect Positioning**: External objects were being positioned using camera-relative coordinates or estimated positions, not Web Mercator coordinates
3. **Missing Coordinate Conversion**: No proper conversion from lat/lon to Web Mercator meters

## Solution

### 1. Added Web Mercator Conversion Functions
Created `latLonToWebMercator()` and `latLonToStreetsGL()` in `src/utils/mapCoordinates.ts`:

```typescript
export function latLonToWebMercator(lat: number, lon: number): { x: number; y: number } {
  const x = lon * 20037508.34 / 180
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI
  return { x, y }
}

export function latLonToStreetsGL(lat: number, lon: number, height: number = 0): { x: number; y: number; z: number } {
  const mercator = latLonToWebMercator(lat, lon)
  return {
    x: mercator.x,  // Web Mercator X (east-west)
    y: height,      // Height above ground
    z: mercator.y   // Web Mercator Y (north-south) - NOTE: Y and Z are swapped!
  }
}
```

### 2. Updated syncModelToStreetsGL()
Modified `syncModelToStreetsGL()` to use Web Mercator coordinates:

```typescript
// Get current map center (lat/lon) from store
const mapLat = store.streetsGLGroundLat || 32.89917
const mapLon = store.streetsGLGroundLon || -97.03813

// Convert lat/lon to Web Mercator meters (same as tiles/buildings)
const mercatorPos = latLonToStreetsGL(mapLat, mapLon, 0) // Height = 0 (ground level)
streetsGLObject.position = mercatorPos
```

### 3. How Streets GL Positions Buildings
Buildings are positioned using tiles:
- Tiles use `MathUtils.tile2meters(x, y + 1)` to convert tile coordinates to Web Mercator meters
- Tile position: `(positionInMeters.x, 0, positionInMeters.y)` - **Y and Z are swapped!**
- Buildings are children of tiles, positioned in local tile space
- Buildings are transformed to world space via `tile.matrixWorld`

### 4. External Objects Positioning
External objects are now positioned using the same Web Mercator coordinate system:
- Objects at origin (0,0,0) in Three.js are placed at map center in Web Mercator coordinates
- Objects with offsets have their Three.js offset added to the Web Mercator map center
- This ensures objects are positioned correctly relative to buildings

## Key Points

1. **Web Mercator (EPSG:3857)**: Streets GL uses Web Mercator projection for all coordinates
2. **Y and Z Swap**: Streets GL uses `position.x = mercator.x`, `position.z = mercator.y`, `position.y = height`
3. **Tile System**: Buildings are positioned relative to tiles, but external objects use direct Web Mercator coordinates
4. **Map Center**: Objects are positioned at the map center (lat/lon from store) converted to Web Mercator

## Testing
After this fix, objects should:
- ✅ Appear on the ground at the map location (not floating)
- ✅ Be positioned correctly relative to buildings
- ✅ Use the same coordinate system as tiles/buildings
- ✅ Scale naturally (no 200x multiplier)
- ✅ Cast and receive shadows


