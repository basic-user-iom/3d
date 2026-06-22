# Overpass API Integration for 3D Buildings

## Problem
The OSM Buildings tile service may not have data for all locations. The ground layer was showing only 2D map without 3D buildings.

## Solution
Switched to Overpass API which:
- Has better coverage (works for all locations with OSM data)
- Provides more detailed building information
- Is more reliable than tile services

## Changes Made

### 1. Updated `fetchBuildingData()` in `osmBuildings.ts`
- **Primary method**: Overpass API
- **Fallback method**: OSM Buildings tile service (if Overpass fails)
- Proper conversion from Overpass format to GeoJSON

### 2. Overpass API Query
```overpass
[out:json][timeout:25];
(
  way["building"](south,west,north,east);
  relation["building"](south,west,north,east);
  way["building:part"](south,west,north,east);
);
out body;
>;
out skel qt;
```

### 3. Response Conversion
- Indexes nodes first (nodes contain coordinates)
- Maps ways to node coordinates
- Converts to GeoJSON Polygon format
- Handles building relations (multi-part buildings)

## How It Works

1. **Calculate Bounding Box**: From center lat/lon and zoom level
2. **Query Overpass API**: Request all buildings in bounding box
3. **Parse Response**: 
   - Index all nodes (coordinates)
   - Extract ways (building outlines)
   - Map way nodes to coordinates
4. **Convert to GeoJSON**: Create Polygon features
5. **Create 3D Meshes**: Extrude polygons to create buildings

## Expected Console Messages

```
[OSMBuildings] Fetching building data using Overpass API...
[OSMBuildings] Bounding box: {south, north, west, east}
[OSMBuildings] Sending request to Overpass API...
[OSMBuildings] Overpass API response received {elementCount: X}
[OSMBuildings] Converted to GeoJSON features: {featureCount: X, nodeCount: X, wayCount: X}
[OSMBuildings] Loaded X building features
[OSMBuildings] Created X building meshes
```

## Testing

1. Enable ground layer
2. Check console for Overpass API messages
3. Verify buildings appear in scene
4. If no buildings, try a different location (city center)

## Fallback

If Overpass API fails:
- Falls back to OSM Buildings tile service
- Logs warning but continues
- Ground layer still works (just without buildings)


