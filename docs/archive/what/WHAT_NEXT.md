# What's Next - Priority Roadmap

## ✅ Recently Completed

1. **Terrain Elevation** ✓
   - Esri elevation data fetching
   - 3D ground plane with height variation
   - Applied to vertices with proper normals

2. **Enhanced Building Textures** ✓
   - Improved procedural textures (512x512)
   - Window patterns with frames and glass
   - Building panel lines
   - Better material properties

3. **Improved Road Rendering** ✓
   - Better width variation
   - Road textures with markings
   - Enhanced PBR materials

## 🎯 Next Priority Steps

### Option A: Add Post-Processing (Recommended - High Impact)
**Estimated time:** 2-3 hours

1. **SSAO (Screen-Space Ambient Occlusion)**
   - Adds depth and realism
   - Makes buildings/roads look more 3D
   - Already has UI checkbox, just needs implementation
   - Uses Three.js `SAOPass` from `three/examples/jsm/postprocessing/`

2. **TAA (Temporal Anti-Aliasing)**
   - Reduces jagged edges
   - Smoother visuals
   - Uses `TAARenderPass`

3. **Bloom** (Optional)
   - Adds glow to bright areas
   - More cinematic look
   - Uses `UnrealBloomPass`

**Impact:** Significant visual quality improvement

### Option B: Performance Optimizations
**Estimated time:** 2-4 hours

1. **Instanced Rendering**
   - Use `InstancedMesh` for buildings/roads
   - Reduces draw calls significantly
   - Better performance with many objects

2. **Frustum Culling**
   - Only render visible objects
   - Dynamic tile loading/unloading
   - Better memory management

3. **LOD (Level of Detail)**
   - Simpler geometry for distant objects
   - Better frame rates

**Impact:** Better performance, smoother experience

### Option C: Vector Tiles (Major Feature)
**Estimated time:** 2-3 days

1. **PBF Decoder**
   - Add `@mapbox/vector-tile` or similar
   - Decode vector tiles from `tiles.streets.gl`

2. **Web Workers**
   - Process tiles in background
   - Non-blocking UI

3. **Vector Tile Rendering**
   - Convert to Three.js geometry
   - Match streets.gl exactly

**Impact:** Matches streets.gl quality, but complex

### Option D: Additional Visual Features
**Estimated time:** 1-2 hours each

1. **Better Sky/Atmosphere**
   - Skybox with clouds
   - Atmospheric scattering
   - Time-of-day sky colors

2. **Water Rendering**
   - Proper water surfaces
   - Reflections
   - Animated waves

3. **Tree Improvements**
   - Better tree models
   - Wind animation
   - Seasonal colors

## 🚀 Recommended: Start with SSAO

**Why SSAO first?**
- ✅ High visual impact
- ✅ Relatively quick to implement (2-3 hours)
- ✅ UI checkbox already exists
- ✅ Uses standard Three.js post-processing
- ✅ Makes everything look more 3D immediately

**Implementation steps:**
1. Add `EffectComposer` and `SAOPass` from Three.js
2. Set up post-processing pipeline
3. Connect to existing UI checkbox
4. Tune SSAO parameters for best look

## 📊 Progress Summary

**Completed:** 3 major improvements
- Terrain elevation ✓
- Building textures ✓
- Road rendering ✓

**Next:** Post-processing (SSAO) - 2-3 hours
**After that:** Performance optimizations or vector tiles

Would you like me to:
- **A)** Implement SSAO post-processing now
- **B)** Work on performance optimizations
- **C)** Start vector tiles implementation
- **D)** Something else?







