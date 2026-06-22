# Object Placement Fix

## Problem
Objects were not appearing on the map when using Streets GL overlay.

## Root Cause
The coordinate conversion was incorrect:
1. **Iframe Overlay**: Uses a separate coordinate system - objects should be at origin (0,0,0) to match map center visually
2. **Ground Layer**: Uses a ground plane with a specific size - coordinate conversion needed to match ground layer scale

## Solution

### For Iframe Overlay:
- Objects are placed at **origin (0, 0, 0)** to match the map center visually
- The iframe shows Streets GL which has its own coordinate system
- Objects in Three.js scene align with map center when at origin

### For Ground Layer:
- Uses coordinate conversion based on ground layer size
- Scale factor calculated from ground layer dimensions
- Objects positioned relative to ground layer center

## Testing

### Test 1: Iframe Overlay
1. Enable "Show Streets GL 3D Buildings (iframe overlay)"
2. Load a car model
3. **Expected**: Car appears at map center (origin 0,0,0)
4. Check console: `[ModelPosition] Using iframe overlay - positioned at origin`

### Test 2: Ground Layer
1. Enable "Enable Streets GL Ground Layer" (disable iframe overlay)
2. Load a car model
3. **Expected**: Car appears at map center on ground layer
4. Check console: `[ModelPosition] Using ground layer coordinates`

### Test 3: Neither Enabled
1. Disable both iframe overlay and ground layer
2. Load a car model
3. **Expected**: Car appears at fixed position (0.541, 0.035, 0.000)
4. Check console: `[ModelPosition] Applying user's verified default settings`

## Console Output Examples

### Iframe Overlay:
```
[ModelPosition] Using iframe overlay - positioned at origin (map center): {
  lat: 32.89917,
  lon: -97.03813,
  worldPosition: { x: 0.000, y: 0.035, z: 0.000 },
  note: 'Iframe overlay: objects at origin match map center visually'
}
```

### Ground Layer:
```
[ModelPosition] Using ground layer coordinates: {
  lat: 32.89917,
  lon: -97.03813,
  groundSize: 1000,
  scale: 0.009009,
  worldPosition: { x: 0.000, y: 0.035, z: 0.000 },
  note: 'Ground layer: converted lat/lon to world coordinates'
}
```

## Notes

- **Iframe Overlay**: Simplest approach - objects at origin match map center
- **Ground Layer**: More complex - needs coordinate conversion based on ground size
- **Scale Factor**: Calculated dynamically based on ground layer size and zoom level
- **Y Position**: Always 0.035 to ensure proper ground contact







