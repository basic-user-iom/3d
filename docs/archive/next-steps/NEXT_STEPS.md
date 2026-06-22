# Next Steps - Streets.gl Integration

## Current Status ✅

1. ✅ **Modules Installed**: All streets.gl modules (renderer, render-graph, math, core, bmfont) are installed
2. ✅ **Path Aliases**: Configured `~/` alias in tsconfig.json and vite.config.ts
3. ✅ **Esri Terrain**: Added terrain elevation support (basic implementation)
4. ✅ **Vector Tiles**: Added support for tiles.streets.gl
5. ✅ **Water Data**: Enhanced water fetching with better OSM queries

## Priority Tasks 🎯

### 1. **Improve Building Materials** (High Priority)
**Current**: Using basic `MeshStandardMaterial` with `roughness: 0.8, metalness: 0.0`

**Next Steps**:
- Research streets.gl building material properties
- Add building texture support (if available)
- Improve PBR material properties to match demo
- Add variation based on building type (residential, commercial, etc.)

**Files to modify**:
- `streets-gl-standalone.html` - `createBuilding()` function (line ~1058)

### 2. **Enhance Building Geometry** (High Priority)
**Current**: Simple extruded shapes

**Next Steps**:
- Add roof types (flat, gabled, hipped, etc.) from OSM data
- Use streets.gl tile-processing modules for better geometry
- Add building parts (levels, min_height support)
- Improve building outline cleaning

**Files to modify**:
- `streets-gl-standalone.html` - `createBuilding()` function
- Consider using `src/lib/tile-processing/tile3d/builders/` from streets.gl

### 3. **Integrate Streets.gl Renderer** (Medium Priority)
**Current**: Using Three.js WebGLRenderer

**Next Steps**:
- Evaluate if streets.gl WebGL2Renderer offers benefits
- Consider using render-graph for better rendering pipeline
- Test performance improvements
- Keep Three.js as fallback

**Files to consider**:
- `src/lib/renderer/` - WebGL2Renderer
- `src/lib/render-graph/` - RenderGraph

### 4. **Improve Building Data Fetching** (Medium Priority)
**Current**: Basic OSM building query

**Next Steps**:
- Add all Simple 3D Buildings schema attributes
- Fetch building:levels, building:min_height, building:roof:*
- Add relation support for complex buildings
- Better handling of building parts

**Files to modify**:
- `streets-gl-standalone.html` - `fetchBuildings()` function (line ~900)

### 5. **Visual Quality Matching** (High Priority)
**Current**: Basic rendering, may not match demo exactly

**Next Steps**:
- Compare side-by-side with streets.gl demo
- Match lighting conditions
- Match camera settings and FOV
- Match shadow quality
- Match color palette and materials

**Demo URL**: `https://streets.gl/#32.90379,-97.03924,27.75,25.00,905.10`

### 6. **Water Data Enhancement** (Low Priority)
**Current**: Using Overpass API (browser-compatible)

**Next Steps**:
- Note: streets.gl uses Shapefiles from osmdata.openstreetmap.de
- Consider server-side Shapefile processing
- Improve water polygon rendering
- Add coastline support

## Implementation Order

1. **First**: Improve building materials (#1) - Quick win, visible improvement
2. **Second**: Enhance building geometry (#2) - Major visual improvement
3. **Third**: Visual quality matching (#5) - Ensure we match the demo
4. **Fourth**: Building data fetching (#4) - Better data = better visuals
5. **Fifth**: Streets.gl renderer integration (#3) - Performance optimization
6. **Last**: Water data (#6) - Nice to have

## Quick Wins 🚀

### Immediate Improvements (30 minutes):
1. Adjust building material roughness/metalness values
2. Add building color variation based on type
3. Improve building height calculation (use levels * 3m)
4. Add min_height support for elevated buildings

### Medium-term Improvements (2-4 hours):
1. Add roof geometry based on OSM tags
2. Integrate streets.gl tile-processing for buildings
3. Add building textures/materials from streets.gl resources

### Long-term Improvements (1-2 days):
1. Full streets.gl renderer integration
2. Render-graph pipeline setup
3. Complete visual parity with demo

## Testing Checklist

- [ ] Compare building appearance with demo
- [ ] Verify building heights match
- [ ] Check building colors/materials
- [ ] Test roof rendering
- [ ] Verify coordinate alignment
- [ ] Check shadow quality
- [ ] Test performance with many buildings
- [ ] Compare lighting with demo

## Resources

- **Streets.gl Demo**: https://streets.gl/#32.90379,-97.03924,27.75,25.00,905.10
- **Streets.gl Repo**: https://github.com/StrandedKitty/streets-gl
- **Simple 3D Buildings**: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings
- **Installed Modules**: `src/lib/` (renderer, render-graph, math, core, bmfont)







