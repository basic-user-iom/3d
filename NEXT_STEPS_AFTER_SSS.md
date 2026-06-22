# Next Steps After SSS Fix

## ✅ Completed: Screen Space Shadows (SSS)
SSS is now working correctly on both grid and car model. All fixes applied.

---

## 🎯 Recommended Next Steps (Priority Order)

### 1. **Screen Space Reflections (SSR) Fix** ⚠️ HIGH PRIORITY
**Status**: `in_progress`  
**Priority**: MEDIUM  
**Why Next**: Similar to SSS (just fixed), uses same depth/normal texture infrastructure. Should be straightforward to fix now that SSS is working.

**Description**: SSR pass is created and parameters are being set, but no visual changes occur. SSR shader requires depth texture (tDepth) and normal texture (tNormal) from RenderPass or render targets.

**Issues to Fix**:
- Depth texture connection (similar to SSS fix)
- Normal texture connection (normal prepass already exists)
- Verify textures are properly passed to SSRShader uniforms
- Ensure depth/normal buffers are rendered correctly

**Files to Check**:
- `src/viewer/postprocessing/SSRShader.ts`
- `src/viewer/postprocessing/PostProcessingSystem.ts` (SSR pass setup)
- `src/viewer/pathTracer/NormalRenderPass.ts` (normal prepass)

---

### 2. **Path Tracer Fix** ⚠️ HIGH PRIORITY
**Status**: `in_progress`  
**Priority**: HIGH  
**Description**: Path Tracer GPU mode fails with shader compilation errors. CPU mode fallback works but GPU initialization needs investigation.

**Issues**:
- GPU mode shader compilation errors ("Fragment shader is not compiled")
- Check WebGL 2.0 support, browser compatibility, GPU drivers
- Verify three-gpu-pathtracer library integration

---

### 3. **Ambient Occlusion (AO) Fix** ⚠️ MEDIUM PRIORITY
**Status**: `in_progress`  
**Priority**: MEDIUM  
**Description**: AO pass is created successfully but the effect is not visible. SAOPass parameters are being set correctly, but AO doesn't appear on the model.

**Issues to Investigate**:
- SAOPass.OUTPUT constants and output mode mapping
- Parameter application and validation
- SAOPass integration with EffectComposer
- Rendering pipeline conflicts

**Note**: AO was previously removed from the program, but the task is still marked as in_progress. May need to verify if this is still needed.

---

### 4. **Face Editing Fix** ⚠️ MEDIUM PRIORITY
**Status**: `in_progress`  
**Priority**: MEDIUM  
**Description**: Primitives Face Editing (Extend Sides) partially works: Face detection works correctly, but geometry doesn't update when dragging faces.

**Issues**:
- Geometry disposal/update flow
- Original geometry parameters storage
- Mesh updates triggering scene re-render

---

### 5. **Ground Projection Fix** ⚠️ HIGH PRIORITY (Pending)
**Status**: `pending`  
**Priority**: HIGH  
**Description**: Code exists but visual effect not visible. Debug shader injection, verify uniforms, add visual debug mode.

---

## 📊 Summary

**Total In Progress**: 5 items (SSS now completed)  
**High Priority**: 2 items (Path Tracer, Ground Projection)  
**Medium Priority**: 3 items (SSR, AO, Face Editing)

**Recommended**: Start with **SSR Fix** since it's similar to SSS and infrastructure is already in place.









