# Feature Implementation Plan

## Status: In Progress

This document outlines the implementation plan for the requested features.

## Features to Implement

### 1. ✅ Shadow Fix for HDR Ground Projection (DONE)
- **Status**: Complete
- **Changes**: Auto-enable shadows on directional lights, create default sun light if none exists
- **File**: `src/viewer/pathTracer/PathTracerDemo.ts`

### 2. Primitive Objects Panel (Modeling)
- **Status**: Pending
- **Description**: Add button in Modeling panel to open a panel with primitive objects (planes, spheres, cones, cubes, etc.)
- **Features**:
  - Add primitives to scene
  - Scale objects
  - Move objects
  - Apply custom textures
- **Files to Create**:
  - `src/components/PrimitivesPanel.tsx`
  - Add `togglePrimitivesPanel` to toolbar menu
- **Implementation Steps**:
  1. Create PrimitivesPanel component
  2. Add toolbar action
  3. Implement primitive creation
  4. Add transform controls integration
  5. Add texture upload support

### 3. Rendering Effects Panel (Rendering)
- **Status**: Pending
- **Description**: Add button in Rendering panel with card-based UI showing nice effects (fog, fire, etc.)
- **Research**: Check Twinmotion effects for inspiration
- **Effects to Include**:
  - Fog
  - Fire effect
  - Particle systems
  - Atmospheric effects
  - Lens flares
  - Bloom
  - Motion blur
- **Files to Create**:
  - `src/components/RenderingEffectsPanel.tsx`
  - Add `toggleRenderingEffectsPanel` to toolbar menu
- **Implementation Steps**:
  1. Research Twinmotion effects
  2. Create card-based UI
  3. Implement fog system
  4. Implement fire effect
  5. Add other effects

### 4. Merge Maps Menu (Files)
- **Status**: Pending
- **Description**: Merge Load Ion, Google 3DTiles, and Search Location into one "Maps" icon
- **Features**:
  - API key management (Cesium Ion, Google, OpenStreetMap)
  - Unified interface for all map services
  - OpenStreetMap support
- **Files to Create**:
  - `src/components/MapsPanel.tsx`
  - Update toolbar menu (replace `loadIon`, `loadGoogleTiles`, `searchLocation` with `toggleMapsPanel`)
- **Implementation Steps**:
  1. Create MapsPanel component
  2. Add API key storage (localStorage)
  3. Consolidate Load Ion, Google Tiles, Search Location
  4. Add OpenStreetMap integration

### 5. OpenStreetMap Ground Level (Maps)
- **Status**: Pending
- **Description**: Use OpenStreetMap as ground level where objects can be placed and moved
- **Features**:
  - Map selection (choose area to project)
  - Ground-level map projection
  - Object placement on map
  - Object movement on map
- **Files to Create/Modify**:
  - `src/components/MapsPanel.tsx` (extend)
  - `src/viewer/effects/OpenStreetMapGround.ts`
- **Implementation Steps**:
  1. Research OpenStreetMap tile providers
  2. Create map tile loader
  3. Implement ground projection
  4. Add map selection UI
  5. Integrate object placement

### 6. Polygon Drawing Tool (Modeling)
- **Status**: Pending
- **Description**: Add polygon drawing tool in Modeling panel
- **Features**:
  - Draw polygons on models
  - Snap to surface
  - Different colors
  - Line thickness
  - Line types (solid, dashed, etc.)
  - Fill color
  - Transparency
  - Mark things on models
- **Files to Create**:
  - `src/components/PolygonDrawingPanel.tsx`
  - `src/viewer/tools/PolygonDrawingTool.ts`
  - Add `togglePolygonDrawingPanel` to toolbar menu
- **Implementation Steps**:
  1. Create ray-casting for surface snapping
  2. Implement polygon drawing logic
  3. Add UI controls (color, thickness, fill, etc.)
  4. Add undo/redo
  5. Export/import polygons

### 7. Hotspots System (Presentation)
- **Status**: Pending
- **Description**: Add hotspots system like virtual tours (3D Vista style)
- **Features**:
  - Add hotspots across 3D model
  - Popup windows with content:
    - Text
    - Images
    - YouTube videos
    - Local videos
    - Interactive content
- **Files to Create**:
  - `src/components/HotspotsPanel.tsx`
  - `src/viewer/hotspots/HotspotSystem.ts`
  - Add `toggleHotspotsPanel` to toolbar menu
- **Implementation Steps**:
  1. Create hotspot placement tool
  2. Implement popup system
  3. Add content types (text, image, video, interactive)
  4. Add YouTube integration
  5. Add local video support
  6. Add styling options

## Implementation Priority

1. ✅ Shadow Fix (Done)
2. Primitive Objects Panel (Simple, good starting point)
3. Rendering Effects Panel (Moderate complexity)
4. Merge Maps Menu (Consolidation work)
5. OpenStreetMap Ground Level (Complex, depends on Maps Menu)
6. Polygon Drawing Tool (Complex, advanced feature)
7. Hotspots System (Complex, advanced feature)

## Next Steps

Starting with Primitive Objects Panel as it's the simplest and provides immediate value.













