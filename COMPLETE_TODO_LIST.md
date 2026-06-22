# 3D Test Software - Complete TODO List
**Generated:** 2025-01-27  
**Current Version:** 2.5.0+  
**Status:** Comprehensive project todo list

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

## 🔴 CRITICAL BUGS - HIGH PRIORITY

### Post-Processing & Shadows
1. **⚠️ Shadows Disappearing with Post-Processing**
   - **Status:** NOT FIXED
   - **Issue:** Shadows disappear when post-processing is enabled
   - **Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`
   - **Action:** Investigate shadow map preservation during post-processing render
   - **Priority:** CRITICAL

2. **⚠️ Screen Space Shadows (SSS) - Testing Required**
   - **Status:** IN PROGRESS - Algorithm fixed, needs testing
   - **Fixed:** Depth reading and shadow calculation algorithm corrected
   - **Fixed:** Depth texture connection working
   - **TODO:** Test SSS sliders in main application (Quality → Effects → SSS)
   - **Location:** `src/viewer/postprocessing/SSSShader.ts`
   - **Test Page:** `http://localhost:3000/test-sss-standalone.html`
   - **Priority:** HIGH

3. **⚠️ Screen Space Reflections (SSR) - Not Working**
   - **Status:** PENDING
   - **Issue:** SSR pass created but no visual changes occur
   - **Needs:** Depth and normal textures properly connected
   - **May Need:** Depth prepass and normal prepass implementation
   - **Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`
   - **Priority:** HIGH

4. **⚠️ Ambient Occlusion (AO) - Not Visible**
   - **Status:** PENDING
   - **Issue:** AO pass created successfully but effect not visible
   - **Status:** SAOPass parameters being set correctly
   - **Action:** Investigate SAOPass.OUTPUT constants and parameter application
   - **Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`
   - **Priority:** HIGH

### Rendering & Path Tracing
5. **⚠️ Path Tracer GPU Mode - Broken**
   - **Status:** IN PROGRESS
   - **Issue:** GPU mode fails with shader compilation errors ("Fragment shader is not compiled")
   - **Workaround:** CPU mode fallback works
   - **Action:** Check WebGL 2.0 support, browser compatibility, GPU drivers, three-gpu-pathtracer library integration
   - **Location:** `src/viewer/pathTracer/PathTracerDemo.ts`
   - **Priority:** HIGH

6. **⚠️ Primitives Face Editing - Geometry Not Updating**
   - **Status:** IN PROGRESS
   - **Issue:** Face detection works correctly, but geometry doesn't update when dragging faces
   - **Symptom:** [FaceEdit] logs appear but box geometry remains unchanged
   - **Action:** Fix geometry disposal/update flow, verify original geometry parameters storage, ensure mesh updates trigger scene re-render
   - **Priority:** HIGH

### Ground Projection Issues
7. **⚠️ Ground Projection - Visual Effect Not Visible**
   - **Status:** PENDING
   - **Issue:** Code exists but visual effect not visible
   - **Action:** Debug shader injection, verify uniforms, add visual debug mode
   - **Priority:** HIGH

8. **⚠️ Ground Projection Shadows - Not Showing in 360 HDR**
   - **Status:** PENDING
   - **Issue:** Ground projection does not show shadows in 360 HDR mode
   - **Priority:** HIGH

9. **⚠️ Ground Projection White HDR**
   - **Status:** PENDING
   - **Issue:** HDR appears white in ground projection mode
   - **Priority:** HIGH

10. **⚠️ Standard 360 HDR Shadows - Missing**
    - **Status:** PENDING
    - **Issue:** No shadow or ground plane visible in standard 360 HDR mode
    - **Priority:** HIGH

---

## 🟡 FEATURES IN PROGRESS

### Post-Processing Features
11. **⏳ Emissive Bloom Integration**
    - **Status:** IN PROGRESS
    - **Issue:** Infrastructure exists, needs full integration
    - **Needs:** UI controls and state management integration
    - **Location:** Post-processing system

### Export Features
12. **⏳ HDR/EXR Export Enhancement**
    - **Status:** PENDING
    - **Issue:** Current HDR export uses PNG (lossy), should use proper HDR/EXR format
    - **Location:** `src/utils/webExport.ts` (line 290)
    - **Action:** Use proper HDR/EXR encoding library (exr-writer, three/examples/jsm/exporters/EXRExporter)
    - **Priority:** MEDIUM

---

## 📋 PENDING FEATURES

### UI/UX Improvements
13. **Menu Structure Audit**
    - **Status:** PENDING
    - **Description:** Audit current toolbar/menu components and design plan for five-section main menu with draggable buttons and persistence requirements
    - **Priority:** MEDIUM

14. **Draggable Button Organization**
    - **Status:** PENDING
    - **Description:** Implement draggable button organization allowing movement between Files, Modeling, Rendering, Presentation, and Under consideration sections with state persistence
    - **Priority:** MEDIUM

### Project Management
15. **Project Save/Load Enhancement**
    - **Status:** PARTIAL
    - **Description:** Add project save/load functionality capturing camera, lighting, HDR, and other tweaks; integrate with UI flow
    - **Note:** Compression and size checking added, but needs testing with large files
    - **Priority:** MEDIUM

16. **Project Save Large Files Fix**
    - **Status:** PENDING
    - **Issue:** Not working for large files
    - **Action:** Test with smaller files, implement chunking/compression for large project data
    - **Priority:** MEDIUM

### Post-Processing Features
17. **3D LUT Post-Processing**
    - **Status:** PENDING
    - **Description:** Add color grading with 3D LUT support for cinematic color correction
    - **Priority:** MEDIUM

18. **Anamorphic Lens Flares**
    - **Status:** PENDING
    - **Description:** Add anamorphic lens flare effects for cinematic lighting
    - **Priority:** LOW

### Advanced Features
19. **AI Image Enhancement**
    - **Status:** PENDING
    - **Description:** Add AI-powered image enhancement feature similar to Twinmotion (upscaling, detail refinement, texture enhancement, edge sharpening)
    - **Priority:** MEDIUM

20. **OpenStreetMap Ground**
    - **Status:** PENDING
    - **Description:** Implement OpenStreetMap as ground level with object placement, movement, map area selection/projection
    - **Note:** Placeholder created, full implementation pending
    - **Priority:** LOW

21. **Path Tracer: Ground Projection Shadows**
    - **Status:** PENDING
    - **Description:** Ensure ground-projected environment receives and shows shadows correctly in path tracer (ground plane / GroundedSkybox)
    - **Priority:** MEDIUM

### Shader Replacements
22. **Ocean Shader**
    - **Status:** PENDING
    - **Description:** Replace WaterSystem with new Ocean Shader
    - **Priority:** LOW

23. **Sky Shader**
    - **Status:** PENDING
    - **Description:** Replace DynamicSky with new Sky Shader
    - **Priority:** LOW

24. **Volume Cloud Shader**
    - **Status:** PENDING
    - **Description:** VolumetricClouds.ts deleted, replacement needed
    - **Priority:** LOW

### Material Features
25. **Caustics for Glass Materials**
    - **Status:** PENDING
    - **Description:** Add caustics rendering for glass materials
    - **Note:** CausticsSystem.ts exists, needs integration
    - **Priority:** LOW

26. **Shadow Map with Opacity**
    - **Status:** PENDING
    - **Description:** Complete shadow map with opacity support
    - **Note:** Complete but conflicts with ground projection
    - **Priority:** LOW

### Performance Optimizations
27. **Batch LOD BVH**
    - **Status:** PENDING
    - **Description:** Add level of detail with bounding volume hierarchy for efficient culling of large scenes
    - **Priority:** LOW

28. **GPU Instancing**
    - **Status:** PENDING
    - **Description:** Optimize rendering of thousands of instances using GPU instancing for better performance
    - **Priority:** LOW

### Camera Views
29. **Camera Views Path Tracer Export**
    - **Status:** PENDING
    - **Issue:** Function disabled, needs re-implementation using PathTracerDemo
    - **Location:** `src/components/CameraViewsPanel.tsx` (lines 505, 511)
    - **Action:** Re-implement path tracer export functionality
    - **Priority:** LOW

---

## ✅ RECENTLY COMPLETED

- **Fit Dropdown Buttons** - Fixed Frame All and Frame Largest buttons with React Portal
- **Project Save Improvements** - Added compression, size checking, warnings, lightweight save mode, packaged project save
- **Browser Reload Fix** - Disabled HMR and file watching to prevent unwanted reloads
- **Version Backup System** - Created backup scripts with progress window and verification
  - **Latest backup: v3.0** (34,679 files, 6,266 MB) on both D and F drives
- **Hotspots System** - Virtual tour style hotspots with popup windows
- **Polygon Drawing Tool** - Draw polygons on models with snap to surface, colors, line thickness, fill, transparency
- **Interactive Control Point Editing** - Drag control points to adjust polygon shape in real-time
- **Internal Shadows Enhancement** - Shadows on internal parts (vents, openings, cavities)
- **Color Picker Dropper Cursor** - Custom dropper icon cursor
- **HDR Ground Shadows Fix** - Auto-enable shadows on directional lights in path tracer
- **Primitive Objects Panel** - Added planes, spheres, cones, cubes
- **Rendering Effects Panel** - Card-based UI with fog, fire effects
- **Merge Maps Menu** - Consolidated Load Ion, Google 3DTiles, and Search Location
- **Todo Panel UI Integration** - Feature todo list display integrated into app UI

---

## 🔧 TECHNICAL DEBT

### Code Quality
30. **Environment Map Consolidation**
    - **Status:** PENDING
    - **Description:** Reduce redundant traversals when applying environment maps
    - **Priority:** LOW

31. **HDR Loading Optimization**
    - **Status:** PENDING
    - **Description:** Optimize HDR loading and caching
    - **Priority:** LOW

32. **Shadow System Conflicts**
    - **Status:** PENDING
    - **Description:** Check for conflicts between SSS and other shadow systems
    - **Priority:** MEDIUM

### TypeScript & Documentation
33. **TypeScript Errors**
    - **Status:** PENDING
    - **Description:** Fix remaining TypeScript errors and type issues
    - **Priority:** LOW

34. **Documentation**
    - **Status:** PENDING
    - **Description:** Update documentation for new features and APIs
    - **Priority:** LOW

### Testing
35. **Comprehensive Testing**
    - **Status:** PENDING
    - **Description:** Add unit tests and integration tests for critical features
    - **Priority:** LOW

---

## 🎯 IMMEDIATE NEXT STEPS (Priority Order)

1. **Test SSS in Main Application** - Verify SSS sliders work and shadows appear (Quality → Effects → SSS)
2. **Fix Post-Processing Shadows** - Investigate why shadows disappear when post-processing is enabled
3. **Fix SSR** - Implement proper depth/normal texture connection for Screen Space Reflections
4. **Fix AO** - Investigate SAOPass output mode and parameter application for Ambient Occlusion
5. **Fix Path Tracer GPU Mode** - Debug shader compilation errors in GPU mode
6. **Fix Face Editing** - Fix geometry update flow for primitives face editing
7. **Test Project Save** - Verify large file saving works with compression
8. **Fix Ground Projection** - Debug why visual effect is not visible

---

## 📊 SUMMARY STATISTICS

### By Status
- **🔴 Critical Bugs:** 10 items
- **🟡 In Progress:** 2 items
- **📋 Pending Features:** 23 items
- **🔧 Technical Debt:** 6 items
- **✅ Completed:** 14+ items

### By Priority
- **HIGH Priority:** 10 items (Critical bugs)
- **MEDIUM Priority:** 10 items
- **LOW Priority:** 21 items

### Total Remaining Tasks: **41 items**

---

## 📝 NOTES

### Current Work Status
- **SSS (Screen Space Shadows):** Algorithm fixed, needs testing in main application
- **Post-Processing Shadows:** NOT FIXED - shadows still disappear when post-processing is enabled
- **Version:** 2.5.0+ - Latest version
- **Latest Backup:** v3.0 (34,679 files, 6,266 MB) - Complete on both D and F drives

### Testing Needed
1. Test SSS sliders in main application (Quality → Effects → SSS)
2. Test project save with large files
3. Fix shadows disappearing when post-processing is enabled
4. Test SSS standalone page: `http://localhost:3000/test-sss-standalone.html`
5. Test path tracer GPU mode in different browsers
6. Test face editing with different primitive types

### Known Issues
- SSS sliders may not have visual effect yet (algorithm fixed, needs testing)
- AO and SSR still not working (need investigation)
- Path Tracer GPU mode broken (CPU mode works)
- Ground projection visual effect not visible
- Shadows disappear when post-processing enabled

---

**Last Updated:** 2025-01-27  
**Next Review:** After completing high-priority items








