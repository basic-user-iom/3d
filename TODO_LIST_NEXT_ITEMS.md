# Next Items on TODO List (Synced with 3D Viewer)

## Currently In Progress (6 items)

### 1. ⚠️ Path Tracer Fix (`task-fix-pathtracer`)
**Status**: `in_progress`
**Priority**: HIGH
**Description**: Path Tracer not working: GPU mode fails with shader compilation errors ("Fragment shader is not compiled"). CPU mode fallback works but GPU initialization needs investigation. Check WebGL 2.0 support, browser compatibility, GPU drivers, and three-gpu-pathtracer library integration.

**Note**: We've been working on path tracer state restoration and button fixes. This is the main path tracer functionality issue.

---

### 2. ⚠️ Face Editing Fix (`task-fix-face-editing`)
**Status**: `in_progress`
**Priority**: MEDIUM
**Description**: Primitives Face Editing (Extend Sides) partially works: Face detection works correctly, but geometry doesn't update when dragging faces. The [FaceEdit] logs appear but the box geometry remains unchanged. Need to fix geometry disposal/update flow, verify original geometry parameters storage, and ensure mesh updates trigger scene re-render.

---

### 3. ⚠️ Ambient Occlusion Fix (`task-fix-ambient-occlusion`)
**Status**: `in_progress`
**Priority**: MEDIUM
**Description**: Ambient Occlusion (AO) not working: AO pass is created successfully but the effect is not visible. SAOPass parameters are being set correctly, but AO doesn't appear on the model. Issues: parameter validation, output mode mapping, SAOPass integration with EffectComposer, or rendering pipeline conflicts. Need to investigate SAOPass.OUTPUT constants, parameter application, and verify AO is being rendered in the post-processing chain.

---

### 4. ✅ Screen Space Shadows Fix (`task-fix-screen-space-shadows`)
**Status**: `completed`
**Priority**: MEDIUM
**Description**: ✅ **FIXED** - Screen Space Shadows (SSS) now working correctly on both grid and car model. Fixed depth format mismatch, improved depth step calculation, more lenient occluder detection, ray starting offset, and self-comparison bug. All fixes applied to `src/viewer/postprocessing/SSSShader.ts`.

---

### 5. ⚠️ Screen Space Reflections Fix (`task-fix-screen-space-reflections`)
**Status**: `in_progress`
**Priority**: MEDIUM
**Description**: Screen Space Reflections (SSR) not working: SSR pass is created and parameters are being set, but no visual changes occur. SSR shader requires depth texture (tDepth) and normal texture (tNormal) from RenderPass or render targets. Issues: depth texture not properly connected to SSR shader uniforms, normal texture not available, depthRenderTarget/normalRenderTarget not being used correctly, or RenderPass not providing depth/normal textures. Need to verify depth and normal textures are available and properly passed to SSRShader uniforms, ensure depth buffer is rendered, and check if render targets need to be explicitly rendered to. May need to implement depth prepass and normal prepass.

---

### 6. ⏳ Complete Emissive Bloom Integration (`task-complete-emissive-bloom`)
**Status**: `in_progress`
**Priority**: LOW
**Description**: Infrastructure exists, needs full integration with UI controls and state management.

---

## High Priority Pending Items (7 items)

### 1. Fix Ground Projection (`task-fix-ground-projection`)
**Status**: `pending`
**Priority**: HIGH
**Description**: ⚠️ Fix Ground Projection - Code exists but visual effect not visible. Debug shader injection, verify uniforms, add visual debug mode.

---

### 2. OpenStreetMap Ground (`task-openstreetmap-ground`)
**Status**: `pending`
**Priority**: MEDIUM
**Description**: Implement OpenStreetMap as ground level - object placement, movement, map area selection/projection. Placeholder created, full implementation pending.

---

### 3. AI Image Enhancement (`task-ai-image-enhancement`)
**Status**: `pending`
**Priority**: MEDIUM
**Description**: AI Image Enhancement - Add AI-powered image enhancement feature similar to Twinmotion (upscaling, detail refinement, texture enhancement, edge sharpening).

---

### 4. Performance: Batch LOD BVH (`task-batch-lod-bvh`)
**Status**: `pending`
**Priority**: LOW
**Description**: Performance: Batch LOD BVH - Add level of detail with bounding volume hierarchy for efficient culling of large scenes.

---

### 5. Performance: GPU Instancing (`task-instancing-performance`)
**Status**: `pending`
**Priority**: LOW
**Description**: Performance: GPU Instancing - Optimize rendering of thousands of instances using GPU instancing for better performance.

---

### 6. Post-Processing: 3D LUT (`task-3d-lut-postprocessing`)
**Status**: `pending`
**Priority**: LOW
**Description**: Post-Processing: 3D LUT - Add color grading with 3D LUT support for cinematic color correction.

---

### 7. Post-Processing: Anamorphic Lens Flares (`task-anamorphic-lens-flares`)
**Status**: `pending`
**Priority**: LOW
**Description**: Post-Processing: Anamorphic Lens Flares - Add anamorphic lens flare effects for cinematic lighting.

---

## Summary

**Total Items**: 24
**In Progress**: 6
**Pending**: 7
**Completed**: 11

**Next Recommended Actions**:
1. **Screen Space Reflections (SSR) Fix** - Similar to SSS (just fixed), needs depth/normal texture connection. Infrastructure already in place.
2. **Path Tracer Fix** - Continue working on state restoration and button fixes (currently in progress)
3. **Ground Projection Fix** - High priority pending item, code exists but not visible
4. **Ambient Occlusion (AO) Fix** - Needs SAOPass output mode investigation


















