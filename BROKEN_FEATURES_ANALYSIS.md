# Broken Features Analysis - Recent Optimization

## Summary
During the recent optimization to use React hooks for Three.js initialization, several features were broken or disabled. This document lists all identified issues.

## 🔴 CRITICAL: Broken Features

### 1. **Face Editing (Face Dragging) - COMPLETELY BROKEN**
**Status:** ❌ NOT WORKING
**Location:** `src/viewer/hooks/useThreeObjectManager.ts`

**Problem:**
- Face editing mouse event handlers are **completely missing**
- `handleMouseDown` in `useThreeObjectManager.ts` is just a stub (line 226-232)
- No `mousemove` or `mouseup` handlers for face dragging
- Face editing UI exists in `PrimitivesPanel.tsx` but functionality is broken

**What's Missing:**
- `handleFaceClick` - Detect face clicks on primitives
- `handleFaceDrag` - Handle mouse drag to extrude faces
- `handleFaceMouseUp` - Complete face extrusion operation
- Event listeners for `mousedown`, `mousemove`, `mouseup` on canvas

**Expected Behavior:**
1. User enables face edit mode
2. User clicks on a face of a primitive
3. User drags mouse to extrude the face
4. Geometry updates in real-time

**Current Behavior:**
- Face edit mode can be enabled
- Clicking on faces does nothing
- No face detection or dragging

**Files Affected:**
- `src/viewer/hooks/useThreeObjectManager.ts` - Missing handlers
- `src/utils/faceExtrusion.ts` - Functions exist but not called
- `src/components/PrimitivesPanel.tsx` - UI exists but non-functional

---

### 2. **Transform Gizmo - PARTIALLY FIXED**
**Status:** ⚠️ PARTIALLY WORKING (recently fixed but may have issues)

**Recent Fixes Applied:**
- ✅ Transform controls added to scene
- ✅ `dragging-changed` event listener added
- ✅ Transform controls enabled and visible
- ✅ Space set to 'world'

**Potential Remaining Issues:**
- May need to verify all transform modes (translate, rotate, scale) work
- Check if keyboard shortcuts for mode switching work
- Verify gizmo appears correctly on all object types

**Files:**
- `src/viewer/hooks/useThreeControls.ts` - Recently fixed
- `src/viewer/hooks/useThreeObjectManager.ts` - Recently fixed

---

### 3. **HDR System - NEEDS VERIFICATION**
**Status:** ⚠️ UNKNOWN (needs testing)

**Current State:**
- HDR system is initialized in `useThreeEffects.ts`
- HDR is disabled by default (`hdrEnabled: false` in store)
- System exists but may not be properly connected

**What to Check:**
- Does HDR load when enabled?
- Are HDR textures applied correctly?
- Does ground projection work?
- Are environment maps updated?

**Files:**
- `src/viewer/hooks/useThreeEffects.ts` - HDR initialization
- `src/viewer/effects/HDRSystem.ts` - HDR implementation
- `src/store/useAppStore.ts` - HDR state (disabled by default)

---

## 🟡 POTENTIAL ISSUES (Need Investigation)

### 4. **Paint Mode**
**Status:** ⚠️ UNKNOWN
**Location:** `src/components/MaterialPanel.tsx`

**What to Check:**
- Does paint mode activate correctly?
- Are click handlers working for painting?
- Is material application working?

---

### 5. **Polygon Drawing**
**Status:** ✅ WORKING (has its own event handlers)
**Location:** `src/components/PolygonDrawingPanel.tsx`

**Note:** This feature has its own event handlers attached directly to canvas, so it should still work.

---

### 6. **Sub-Object Selection**
**Status:** ⚠️ UNKNOWN
**Location:** `src/components/EdgeEnhancementPanel.tsx`

**What to Check:**
- Does sub-object selection mode work?
- Can child meshes be selected?

---

## 📋 Features Disabled by Default (Not Broken, Just Disabled)

These features are intentionally disabled by default but can be enabled:

1. **HDR** - `hdrEnabled: false`
2. **Post Processing** - `postProcessingEnabled: false`
3. **Bloom** - `bloomEnabled: false`
4. **SSS (Subsurface Scattering)** - `sssEnabled: false`
5. **SSR (Screen Space Reflections)** - `ssrEnabled: false`
6. **Water** - `waterEnabled: false`
7. **Weather Effects** - All disabled (clouds, fog, rain, snow, wind)
8. **Shadow Plane** - `showShadowPlane: false`
9. **Camera Bounds** - `cameraBoundsEnabled: false`

---

## 🔧 Fix Priority

### HIGH PRIORITY (Broken Core Features)
1. **Face Editing** - Completely broken, needs full restoration
2. **Transform Gizmo** - Verify all modes work correctly
3. **HDR System** - Test and verify functionality

### MEDIUM PRIORITY (Need Verification)
4. **Paint Mode** - Test functionality
5. **Sub-Object Selection** - Test functionality

### LOW PRIORITY (Disabled by Design)
6. **Post-processing effects** - Can be enabled if needed
7. **Weather effects** - Can be enabled if needed

---

## 📝 Implementation Notes

### Face Editing Restoration Required

The face editing feature needs:
1. **Face Detection on Click:**
   - Raycast to detect face clicks
   - Use `getFaceInfo()` and `getBoxFace()` from `faceExtrusion.ts`
   - Store face info in `window.__faceEditInfo`

2. **Mouse Drag Handler:**
   - Track mouse movement during drag
   - Calculate extrusion distance
   - Update geometry in real-time using `extrudeFaceGeneric()` or `extrudeBoxFace()`

3. **Geometry Update:**
   - Dispose old geometry
   - Assign new geometry to mesh
   - Update mesh bounding box
   - Trigger scene re-render

4. **Event Listeners:**
   - Attach to canvas/renderer DOM element
   - Handle `mousedown`, `mousemove`, `mouseup`
   - Check `faceEditMode` from store before handling

---

## 🎯 Next Steps

1. ✅ Document all broken features (this document)
2. ⏳ Restore face editing handlers
3. ⏳ Test HDR system
4. ⏳ Verify transform gizmo fully works
5. ⏳ Test paint mode
6. ⏳ Test sub-object selection









