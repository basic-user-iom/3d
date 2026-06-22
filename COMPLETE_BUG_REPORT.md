# Complete Bug Report - Codebase Analysis
**Generated:** 2025-01-27  
**Status:** Comprehensive bug scan completed

---

## 🔴 CRITICAL BUGS (Must Fix Immediately)

### 1. TypeScript Compilation Errors (3 errors)
**Location:** `src/store/useAppStore.ts`  
**Severity:** CRITICAL - Blocks compilation  
**Status:** ❌ NOT FIXED

**Errors:**
1. **Line 1830:53** - `transformControls.updateMatrixWorld(true)`
   - Error: Expected 0 arguments, but got 1
   - Issue: `updateMatrixWorld()` doesn't accept arguments in this context
   - Fix: Remove argument or use `updateMatrixWorld()` without parameters

2. **Line 2007:53** - `transformControls.updateMatrixWorld(true)`
   - Error: Expected 0 arguments, but got 1
   - Issue: Same as above, duplicate error
   - Fix: Remove argument

3. **Line 2326:42** - `setSssShadowMapIntensityMultiplier: (multiplier) =>`
   - Error: Parameter 'multiplier' implicitly has an 'any' type
   - Fix: Add type annotation: `(multiplier: number) =>`

**Impact:** TypeScript compilation fails, may cause runtime errors

---

### 2. Shadows Disappearing with Post-Processing
**Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`  
**Severity:** CRITICAL - Core feature broken  
**Status:** ❌ NOT FIXED (code exists but doesn't work)

**Issue:**
- Shadows disappear when post-processing is enabled
- Code attempts to preserve shadow map settings (lines 329-407)
- But shadows still don't render correctly

**Current Code:**
```typescript
// Line 329-333: Attempts to preserve shadow state
const shadowMapEnabled = this.renderer.shadowMap.enabled
const shadowMapType = this.renderer.shadowMap.type
const shadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
// ... renders composer ...
// Line 407: Attempts to restore
this.renderer.shadowMap.enabled = shadowMapEnabled
```

**Problem:**
- Shadow maps may not be rendered before post-processing
- EffectComposer may be overwriting shadow map render targets
- Shadow maps need to be rendered separately before composer

**Fix Needed:**
1. Ensure shadow maps are rendered BEFORE EffectComposer
2. Preserve shadow map render targets
3. Verify shadow maps are included in the render pass

---

### 3. Face Editing Completely Broken
**Location:** `src/viewer/hooks/useThreeObjectManager.ts`  
**Severity:** HIGH - Feature non-functional  
**Status:** ❌ NOT FIXED

**Issue:**
- Face editing mouse event handlers are **completely missing**
- `handleMouseDown` is just a stub (line 226-232)
- No `mousemove` or `mouseup` handlers for face dragging

**Missing Code:**
- `handleFaceClick` - Detect face clicks on primitives
- `handleFaceDrag` - Handle mouse drag to extrude faces
- `handleFaceMouseUp` - Complete face extrusion operation
- Event listeners for `mousedown`, `mousemove`, `mouseup` on canvas

**Impact:** Face editing feature is completely non-functional

---

## 🟡 HIGH PRIORITY BUGS

### 4. Path Tracer GPU Mode Failing
**Location:** Path tracer integration  
**Severity:** HIGH  
**Status:** ⚠️ IN PROGRESS

**Issue:**
- GPU mode fails with shader compilation errors
- CPU mode fallback works
- Error: "Fragment shader is not compiled"

**Needs:**
- Check WebGL 2.0 support
- Verify browser compatibility
- Check GPU drivers
- Verify three-gpu-pathtracer library integration

---

### 5. Ground Projection Issues
**Location:** HDR system  
**Severity:** HIGH  
**Status:** ❌ NOT FIXED

**Issues:**
1. Ground projection does not show shadows in 360 HDR
2. HDR is white in ground projection mode
3. No shadow or ground plane visible in standard 360 HDR mode

**Impact:** Ground projection feature is visually broken

---

### 6. Screen Space Reflections (SSR) Not Working
**Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`  
**Severity:** MEDIUM  
**Status:** ⚠️ PENDING

**Issue:**
- SSR pass created but no visual changes occur
- Needs depth and normal textures properly connected
- May need depth prepass and normal prepass implementation

**Note:** Depth and normal prepasses exist but may not be connected correctly

---

### 7. Ambient Occlusion (AO) Not Visible
**Location:** `src/viewer/postprocessing/PostProcessingSystem.ts`  
**Severity:** MEDIUM  
**Status:** ⚠️ PENDING

**Issue:**
- AO pass created successfully but effect not visible
- SAOPass parameters being set correctly
- Need to investigate SAOPass.OUTPUT constants and parameter application

---

## 🟢 MEDIUM PRIORITY ISSUES

### 8. Memory Leak Potential
**Location:** Multiple files  
**Severity:** MEDIUM  
**Status:** ⚠️ NEEDS VERIFICATION

**Concerns:**
- 44 dispose calls in ViewerCanvas.tsx (good coverage)
- But cleanup is scattered throughout file
- Hard to verify complete cleanup
- Event listeners may not be removed in all cases

**Files to Check:**
- `src/viewer/ViewerCanvas.tsx` - 49 dispose/cleanup references
- `src/viewer/hooks/` - Need to verify cleanup in hooks

---

### 9. Race Conditions in Initialization
**Location:** `src/viewer/useViewer.ts`  
**Severity:** MEDIUM  
**Status:** ⚠️ POTENTIAL ISSUE

**Issue:**
- Model loading waits for viewer with polling loop
- Viewer initialization is async
- Race condition possible if viewer not ready

**Code:**
```typescript
// useViewer.ts - loadFromFile
while (!currentViewer && attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 100))
  attempts++
  currentViewer = sharedViewer
}
```

**Recommendation:** Use promise-based initialization or event system

---

### 10. Missing Error Handling
**Location:** Multiple files  
**Severity:** MEDIUM  
**Status:** ⚠️ INCOMPLETE

**Issues:**
- Some async operations lack try-catch blocks
- Some null checks are missing
- Some error cases not handled gracefully

**Files with Good Error Handling:**
- ✅ `src/viewer/postprocessing/PostProcessingSystem.ts` - Has error handling
- ✅ `src/utils/webExport.ts` - Has comprehensive error handling

**Files Needing Improvement:**
- ⚠️ `src/viewer/ViewerCanvas.tsx` - Some operations lack error handling
- ⚠️ `src/viewer/hooks/` - Need to verify error handling

---

## 🔵 LOW PRIORITY / CODE QUALITY

### 11. TypeScript Type Safety
**Location:** Multiple files  
**Severity:** LOW  
**Status:** ⚠️ NEEDS IMPROVEMENT

**Issues:**
- Some `any` types used
- Type assertions with `@ts-ignore` found
- Some implicit any types

**Recommendation:** Improve type definitions gradually

---

### 12. Code Duplication
**Location:** Multiple files  
**Severity:** LOW  
**Status:** ⚠️ TECHNICAL DEBT

**Issues:**
- Duplicate shadow systems (ShadowManager, CSMShadowSystem, ShadowSystemCoordinator)
- Duplicate water systems (WaterSystem, StandaloneWaterSystem)
- Similar patterns repeated

**Recommendation:** Consolidate during refactoring

---

### 13. Console Warnings/Errors
**Location:** Multiple files  
**Severity:** LOW  
**Status:** ⚠️ NEEDS CLEANUP

**Issues:**
- Many `console.warn()` and `console.error()` calls
- Some are intentional (debugging)
- Some may indicate real issues

**Recommendation:** Review and clean up unnecessary console logs

---

## 📊 Summary Statistics

### Bug Count by Severity
- **CRITICAL:** 3 bugs (TypeScript errors, shadows, face editing)
- **HIGH:** 3 bugs (Path tracer, ground projection, SSR/AO)
- **MEDIUM:** 3 issues (Memory leaks, race conditions, error handling)
- **LOW:** 3 issues (Type safety, duplication, console logs)

### Bug Count by Status
- **NOT FIXED:** 5 bugs
- **IN PROGRESS:** 2 bugs
- **PENDING:** 2 bugs
- **NEEDS VERIFICATION:** 3 issues

---

## 🎯 Recommended Fix Order

### Phase 1: Critical Fixes (1-2 days)
1. ✅ Fix TypeScript compilation errors (3 errors)
2. ✅ Fix shadows disappearing with post-processing
3. ✅ Fix face editing (add missing handlers)

### Phase 2: High Priority (2-3 days)
4. ✅ Fix Path Tracer GPU mode
5. ✅ Fix Ground Projection issues
6. ✅ Fix SSR/AO visibility

### Phase 3: Medium Priority (1-2 days)
7. ✅ Verify memory leak cleanup
8. ✅ Fix race conditions in initialization
9. ✅ Improve error handling

### Phase 4: Code Quality (Ongoing)
10. ✅ Improve type safety
11. ✅ Consolidate duplicate systems
12. ✅ Clean up console logs

---

## 📝 Notes

- Most bugs are localized to specific systems
- Some bugs may be fixed during refactoring
- Error handling is generally good but could be improved
- Memory management is mostly good but needs verification
- TypeScript errors are blocking and should be fixed first

---

**Next Steps:**
1. Fix TypeScript errors immediately
2. Fix shadows disappearing bug
3. Add face editing handlers
4. Continue with high priority bugs

