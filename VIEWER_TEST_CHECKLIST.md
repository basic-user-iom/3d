# ViewerCanvas Test Checklist

## ✅ Code Verification Complete

### Fixed Issues
1. ✅ **Infinite Loop Fixed**: Stable refs for `raycaster` and `mouse` prevent config recreation
2. ✅ **Dependency Arrays**: `onViewerReady` removed from dependencies to prevent callback-triggered loops
3. ✅ **No Linter Errors**: All code passes linting checks
4. ✅ **Hook Integration**: All 8 hooks properly integrated and called in correct order

### Code Structure Verified
- ✅ All hooks imported correctly
- ✅ Hook configurations use `useMemo` with proper dependencies
- ✅ ViewerInstance built from hook results
- ✅ Animation loop properly managed
- ✅ Cleanup functions in place

## 🧪 Browser Testing Steps

### 1. Open Browser Console
Navigate to: **http://localhost:3000**

### 2. Check Console Output

**Expected Initialization Sequence:**
```
[ViewerCanvas] ✅ Container ref available, hooks can initialize
[useThreeScene] Scene initialized: {width: ..., height: ..., pixelRatio: ...}
[useThreeControls] Controls initialized
[useThreeLighting] Lighting system initialized: {ambientIntensity: 1, directionalLightsCount: 1}
[useThreeShadows] Shadow system initialized: {systemType: 'standard', lightsRegistered: 1, ...}
[useThreeEffects] Effects system initialized: {hasHDR: true, hasPostProcessing: true, ...}
[useThreeModelLoader] Model loader initialized
[useThreeObjectManager] Object manager initialized
[useThreeAnimation] Animation loop started
[useThreeAnimation] Animation loop initialized
[ViewerCanvas] ✅ ViewerInstance built successfully from hook results
[ViewerCanvas] ✅ Using hook-based ViewerInstance
[ViewerInit] sharedViewer set successfully
[ViewerInit] Viewer registered successfully
```

### 3. Verify No Infinite Loops

**❌ BAD (Infinite Loop):**
```
[useThreeShadows] Shadow system initialized
[useThreeShadows] Shadow system cleaned up
[useThreeShadows] Shadow system initialized
[useThreeShadows] Shadow system cleaned up
... (repeats indefinitely)
```

**✅ GOOD (Stable):**
```
[useThreeShadows] Shadow system initialized
... (no repeated cleanup/initialization)
```

### 4. Check for Errors

**Should NOT see:**
- ❌ `Maximum update depth exceeded`
- ❌ `Cannot read properties of null`
- ❌ React hook order violations
- ❌ Infinite re-render warnings

**Should see:**
- ✅ All hooks initialize once
- ✅ ViewerInstance builds successfully
- ✅ Animation loop runs smoothly

### 5. Test Basic Functionality

1. **Camera Controls**
   - ✅ Mouse drag rotates camera
   - ✅ Mouse wheel zooms
   - ✅ Right-click + drag pans

2. **Scene Rendering**
   - ✅ Scene renders (check for any visual glitches)
   - ✅ No flickering or stuttering
   - ✅ Smooth animation

3. **Console Commands** (if available)
   - ✅ `window.__viewer` should be available
   - ✅ `window.runShadowDiagnostics()` should work (if implemented)

### 6. Performance Check

- ✅ No excessive CPU usage
- ✅ Smooth frame rate (check browser DevTools Performance tab)
- ✅ No memory leaks (check Memory tab over time)

## 🔍 Debugging Commands

If issues occur, check in browser console:

```javascript
// Check if viewer is available
console.log(window.__viewer)

// Check hook results (if exposed)
// Check for any React warnings
// Check network tab for failed resource loads
```

## 📝 Test Results Template

```
Date: ___________
Browser: ___________
OS: ___________

Initialization:
[ ] All hooks initialize once
[ ] No infinite loops
[ ] ViewerInstance builds successfully

Functionality:
[ ] Camera controls work
[ ] Scene renders correctly
[ ] Animation runs smoothly

Errors:
[ ] No console errors
[ ] No React warnings
[ ] No performance issues

Notes:
_______________________________________
_______________________________________
```

## 🚀 Next Steps After Testing

1. If all tests pass: ✅ Integration complete, ready for feature testing
2. If issues found: Document in console logs and create fix tickets
3. Performance testing: Run extended tests to check for memory leaks

## Files to Review

- `src/viewer/ViewerCanvas.tsx` - Main component
- `src/viewer/hooks/*.ts` - All 8 custom hooks
- `src/App.tsx` - Integration point (line 1751)











