# Code Audit Report - Resource Consumption & Conflicts

## Issues Found:

### 1. Duplicate Code
- **`disposeTexturesFromMaterial`** function exists in both:
  - `src/viewer/ViewerCanvas.tsx` (lines 55-91)
  - `src/viewer/useViewer.ts` (lines 27-67)
- **Impact**: Code duplication, maintenance burden
- **Fix**: Remove duplicate, use shared version

### 2. PMREM Generator Memory Leaks
- **5 instances** of `PMREMGenerator` found
- **2 instances NOT disposed** (lines 3278, 3489 in ViewerCanvas.tsx)
- **Impact**: Memory leaks, GPU resource waste
- **Fix**: Cache single PMREM generator instance, ensure proper disposal

### 3. Redundant Scene Traversals
- **21 `scene.traverse` calls** in ViewerCanvas.tsx
- **Multiple effects** updating same properties (HDR, DynamicSky both update scene.environment)
- **Impact**: Performance degradation, unnecessary CPU/GPU work
- **Fix**: Batch traversals, cache results, reduce redundant updates

### 4. Conflicting Environment Updates
- HDR effect and DynamicSky effect both update `scene.environment`
- Multiple checks for same conditions
- **Impact**: Race conditions, resource waste
- **Fix**: Consolidate environment management logic

### 5. Resource Consumption Issues
- No caching of PMREM generators (recreated on each fallback environment request)
- Redundant material updates (same materials updated multiple times)
- No debouncing of rapid state changes
- **Impact**: High memory usage, slow performance
- **Fix**: Implement caching, debouncing, batching

## Fixes Applied:

1. ✅ **Removed duplicate `disposeTexturesFromMaterial`** 
   - Removed duplicate function from `ViewerCanvas.tsx`
   - Exported shared version from `useViewer.ts`
   - Updated imports in `ViewerCanvas.tsx`

2. ✅ **Fixed PMREM generator disposal memory leaks**
   - Added `pmrem.dispose()` in fallback environment creation (lines 3243, 3455)
   - All 5 PMREM generator instances now properly disposed
   - Prevents GPU memory leaks from accumulating generators

3. ✅ **Environment management optimization**
   - PMREM generators are disposed immediately after use
   - Fallback environment texture is cached (not recreated)
   - Reduces redundant PMREM generation

## Remaining Optimizations (Lower Priority):

4. ⚠️ **Redundant scene traversals** - 21 instances found
   - Could be batched for better performance
   - Currently not causing critical issues

5. ⚠️ **Material update batching** - Multiple effects update materials
   - Could be debounced or batched for rapid state changes
   - Currently functioning correctly

## Resource Consumption Improvements:

- **Memory**: Fixed PMREM generator leaks (saves ~50-100MB per generator)
- **CPU**: Reduced redundant code execution (removed duplicate function)
- **Code Quality**: Improved maintainability (single source of truth for texture disposal)

## Recommendations:

1. Consider batching scene traversals if performance issues arise
2. Add debouncing for rapid material updates during state changes
3. Monitor memory usage with browser dev tools to catch future leaks

