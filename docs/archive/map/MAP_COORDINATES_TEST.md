# Map Coordinates Test - Object Placement

## ✅ Implementation Complete

### What Was Added:

1. **Map Coordinate Utilities** (`src/utils/mapCoordinates.ts`):
   - `latLonToWorld()` - Converts latitude/longitude to Three.js world coordinates
   - `worldToLatLon()` - Converts world coordinates back to lat/lon
   - `distanceLatLon()` - Calculates distance between two lat/lon points
   - `getScaleFromZoom()` - Gets scale factor based on zoom level

2. **Enhanced Model Positioning** (`src/viewer/useViewer.ts`):
   - `positionModelOnGround()` now accepts `useMapCoordinates` parameter
   - Automatically detects if Streets GL overlay is enabled
   - If enabled, positions objects at map center (lat/lon)
   - If disabled, uses fixed world coordinates (backward compatible)

## 🧪 How to Test:

### Test 1: Place Object on Map (Automatic)
1. **Enable Streets GL overlay:**
   - Open "OSM GROUND ver2" panel
   - Check "Show Streets GL 3D Buildings (iframe overlay)"
   - Set desired latitude/longitude (default: 32.89917, -97.03813)

2. **Load a 3D model (car):**
   - Use "Open Files" or "Load URL"
   - Select a GLTF/GLB model
   - **Expected:** Model should be positioned at map center (lat/lon)

3. **Check console:**
   - Look for: `[ModelPosition] Using map coordinates:`
   - Should show lat/lon and converted world position

### Test 2: Place Object at Fixed Position (Default)
1. **Disable Streets GL overlay:**
   - Uncheck "Show Streets GL 3D Buildings (iframe overlay)"
   - Uncheck "Enable Streets GL Ground Layer"

2. **Load a 3D model:**
   - Use "Open Files" or "Load URL"
   - **Expected:** Model should be positioned at fixed coordinates (0.541, 0.035, 0.000)

3. **Check console:**
   - Look for: `[ModelPosition] Applying user's verified default settings:`
   - Should show fixed world coordinates

### Test 3: Verify Object is Visible on Map
1. **Enable Streets GL overlay**
2. **Load a car model**
3. **Check:**
   - ✅ Model appears on the map
   - ✅ Model is at the center of the map view
   - ✅ Model is visible (not hidden behind map)
   - ✅ Use "Fit" button if model not visible

## 📊 Expected Console Output:

### When Map Coordinates Enabled:
```
[ModelPosition] Using map coordinates: {
  lat: 32.89917,
  lon: -97.03813,
  worldPosition: { x: 0.000, y: 0.035, z: 0.000 },
  note: 'Positioned at map center (lat/lon)'
}
```

### When Map Coordinates Disabled:
```
[ModelPosition] Applying user's verified default settings: {
  position: { x: 0.541, y: 0.035, z: 0.000 },
  rotation: { x: 0.0, y: 0.0, z: 0.0 },
  scale: { x: 1.0, y: 1.0, z: 1.0 },
  note: 'These values were manually adjusted and verified by the user'
}
```

## 🔧 Troubleshooting:

### Issue: Object not visible on map
**Solution:**
- Click "Fit" button (🎯 Fit) to frame the object
- Check console for positioning logs
- Verify map coordinates are correct in OSM Ground V2 panel

### Issue: Object at wrong position
**Check:**
- Map center coordinates (lat/lon) in OSM Ground V2 panel
- Console logs for actual world position
- Try adjusting map coordinates and reloading model

### Issue: Object appears far from map
**Solution:**
- The scale factor (0.001) might need adjustment
- Check if ground layer size matches object position scale
- Verify lat/lon coordinates are correct

## 📝 Notes:

- **Scale Factor:** Currently set to 0.001 (1 meter in world = 1km on map)
  - This may need adjustment based on ground layer size
  - Can be modified in `positionModelOnGround()` function

- **Coordinate System:**
  - X = East-West (longitude)
  - Y = Up-Down (elevation)
  - Z = North-South (latitude, inverted for Three.js)

- **Automatic Detection:**
  - If `streetsGLIframeOverlay` OR `streetsGLGroundEnabled` is true, uses map coordinates
  - Otherwise, uses fixed world coordinates (backward compatible)

## ✅ Success Criteria:

- [x] Map coordinate utilities created
- [x] Model positioning supports map coordinates
- [x] Automatic detection of map overlay enabled
- [x] Backward compatible (fixed coordinates when map disabled)
- [ ] **TEST:** Load car model with map enabled - should appear at map center
- [ ] **TEST:** Load car model with map disabled - should appear at fixed position
- [ ] **TEST:** Verify object is visible and correctly positioned







