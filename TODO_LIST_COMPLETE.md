# 3D Test Software - Complete TODO List
**Current Version:** 2.5.0  
**Last Updated:** 2025-11-27  
**Status:** Post-processing shadow fix NOT completed, SSS fixes in progress

## 💾 LATEST BACKUP INFORMATION

**Latest Backup Version:** v3.0  
**Backup Date:** 2025-12-02  
**Status:** ✅ Complete on both D and F drives

### Backup Details:
- **D Drive (D:\3d-viever-backup\v3.0):**
  - Files: 34,679
  - Size: 6,266.19 MB (~6.12 GB)
  - Status: ✅ Complete
  
- **F Drive (F:\3d-viever-backup\v3.0):**
  - Files: 34,679
  - Size: 6,266.19 MB (~6.12 GB)
  - Status: ✅ Complete

**Note:** Backup size increased significantly from v2.9 (4,272 MB) to v3.0 (6,266 MB), indicating substantial new content or changes.

---

## 🔴 HIGH PRIORITY - IN PROGRESS

### Post-Processing & Shadows
- **⚠️ IN PROGRESS: Shadows disappearing when post-processing enabled**
  - Status: NOT FIXED - Shadows still disappear when post-processing is enabled
  - Need to investigate shadow map preservation during post-processing render
  - Location: `src/viewer/postprocessing/PostProcessingSystem.ts`
  
- **⚠️ Screen Space Shadows (SSS) - IN PROGRESS**
  - Status: Fixed depth reading and shadow calculation algorithm
  - Fixed: Depth texture connection working
  - Fixed: Shadow calculation algorithm corrected
  - TODO: Test SSS sliders in main application, verify shadows appear
  - Location: `src/viewer/postprocessing/SSSShader.ts`

- **⚠️ Screen Space Reflections (SSR) - PENDING**
  - SSR pass created but no visual changes occur
  - Needs depth and normal textures properly connected
  - May need depth prepass and normal prepass implementation

- **⚠️ Ambient Occlusion (AO) - PENDING**
  - AO pass created successfully but effect not visible
  - SAOPass parameters being set correctly
  - Need to investigate SAOPass.OUTPUT constants and parameter application

### Critical Bugs
- **⚠️ Path Tracer - IN PROGRESS**
  - GPU mode fails with shader compilation errors
  - CPU mode fallback works
  - Need to check WebGL 2.0 support, browser compatibility, GPU drivers

- **⚠️ Primitives Face Editing - IN PROGRESS**
  - Face detection works correctly
  - Geometry doesn't update when dragging faces
  - Need to fix geometry disposal/update flow

- **⚠️ Ground Projection - PENDING**
  - Code exists but visual effect not visible
  - Need to debug shader injection, verify uniforms, add visual debug mode
  - **⚠️ Ground projection does not show shadows in 360 HDR**
  - **⚠️ HDR is white in ground projection mode**
  - **⚠️ No shadow or ground plane visible in standard 360 HDR mode**

---

## ✅ RECENTLY COMPLETED

- **✅ Fit Dropdown Buttons**
  - Fixed Frame All and Frame Largest buttons
  - Fixed dropdown transparency using React Portal
  - Both buttons now work correctly

- **✅ Project Save Improvements**
  - Added compression (gzip) for large files
  - Added size checking and warnings
  - Added lightweight save mode (no assets)
  - Added packaged project save (ZIP with assets)
  - Ready for testing

- **✅ Browser Reload Fix**
  - Disabled HMR (Hot Module Reload) to prevent browser reloads
  - Disabled file watching to prevent automatic reloads
  - Browser no longer reloads when changing chats or updating code

- **✅ Version Backup System**
  - Created backup scripts for F:\3d-viever-backup
  - Backup progress window with verification
  - File count and size comparison
  - **Latest backup: v3.0** (34,679 files, 6,266 MB) on both D and F drives

- **✅ Hotspots System**
  - Virtual tour style hotspots across 3D model
  - Popup windows for text, images, videos, interactive content

- **✅ Polygon Drawing Tool**
  - Draw polygons on models
  - Snap to surface, colors, line thickness, fill, transparency

- **✅ Interactive Control Point Editing**
  - Drag control points to adjust polygon shape in real-time
  - Spline curve updates

- **✅ Internal Shadows Enhancement**
  - Shadows on internal parts (vents, openings, cavities)
  - Double-sided materials and optimized shadow camera

- **✅ Color Picker Dropper Cursor**
  - Custom dropper icon cursor matching design

---

## 📋 PENDING TASKS

### Post-Processing Features
- **Post-Processing: 3D LUT** - Color grading with 3D LUT support for cinematic color correction
- **Post-Processing: Anamorphic Lens Flares** - Anamorphic lens flare effects for cinematic lighting
- **Complete Emissive Bloom Integration** - Infrastructure exists, needs full integration with UI controls

### Performance Optimizations
- **Batch LOD BVH** - Level of detail with bounding volume hierarchy for efficient culling of large scenes
- **GPU Instancing** - Optimize rendering of thousands of instances using GPU instancing

### Features
- **AI Image Enhancement** - AI-powered image enhancement (upscaling, detail refinement, texture enhancement, edge sharpening) similar to Twinmotion
- **OpenStreetMap Ground** - Implement OpenStreetMap as ground level with object placement, movement, map area selection/projection
- **Path Tracer: Ground Projection Shadows** - Ensure ground-projected environment receives and shows shadows correctly in path tracer

### UI/UX
- **Menu Structure Audit** - Audit current toolbar/menu components and design plan for five-section main menu
- **Draggable Button Organization** - Implement draggable buttons allowing movement between sections with state persistence

---

## 🔧 TECHNICAL DEBT

- **Project Save Large Files** - Need to test with smaller files, implement chunking/compression for large project data
- **Browser Reload on Chat Change** - Fixed (HMR disabled)
- **Shadow System Conflicts** - Need to check for conflicts between SSS and other shadow systems

---

## 📝 NOTES

### Current Work Status
- **SSS (Screen Space Shadows)**: Fixed depth reading and shadow calculation. Need to test in main application.
- **Post-Processing Shadows**: NOT FIXED - shadows still disappear when post-processing is enabled. Needs investigation.
- **Version**: 2.5.0 - Latest version saved
- **Latest Backup**: v3.0 (34,679 files, 6,266 MB) - Complete on both D and F drives

### Testing Needed
1. Test SSS sliders in main application (Quality → Effects → SSS)
2. Test project save with large files
3. Fix shadows disappearing when post-processing is enabled
4. Test SSS standalone page: `http://localhost:3000/test-sss-standalone.html`

### Known Issues
- SSS sliders may not have visual effect yet (algorithm fixed, needs testing)
- AO and SSR still not working (need investigation)
- Path Tracer GPU mode broken (CPU mode works)

---

## 🎯 NEXT STEPS

1. **Test SSS in main application** - Verify SSS sliders work and shadows appear
2. **Fix SSR** - Implement proper depth/normal texture connection
3. **Fix AO** - Investigate SAOPass output mode and parameter application
4. **Test project save** - Verify large file saving works with compression
5. **Backup current version** - ✅ COMPLETE: v3.0 backed up to both D and F drives

---

**Copy this entire document to share with another chat session.**

