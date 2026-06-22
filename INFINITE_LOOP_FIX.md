# Infinite Re-render Loop Fix

## Issue Identified

The hooks were being cleaned up and re-initialized repeatedly in an infinite loop, causing:
- `Maximum update depth exceeded` errors
- Hooks initializing and cleaning up continuously
- ViewerInstance being built and destroyed repeatedly

## Root Causes

### 1. **objectManagerConfig Creating New Objects**
The `objectManagerConfig` was creating new `THREE.Raycaster()` and `THREE.Vector2()` objects on every render when dependencies changed. This caused the config object reference to change, triggering `useThreeObjectManager` to re-initialize.

**Location**: `src/viewer/ViewerCanvas.tsx` lines 224-243

**Problem**:
```typescript
const objectManagerConfig = useMemo(() => {
  // ...
  const raycaster = new THREE.Raycaster()  // ❌ New object every time
  const mouse = new THREE.Vector2()         // ❌ New object every time
  return { raycaster, mouse, ... }
}, [sceneResult, controlsResult, effectsResult, lightingResult])
```

### 2. **onViewerReady Callback in Dependency Array**
The `useEffect` that handles `hookBasedViewer` included `onViewerReady` in its dependency array. If the parent component doesn't memoize this callback, it could be a new function reference on every render, causing the effect to re-run.

**Location**: `src/viewer/ViewerCanvas.tsx` line 419

**Problem**:
```typescript
useEffect(() => {
  // ...
}, [hookBasedViewer, animationResult, onViewerReady])  // ❌ onViewerReady may change
```

## Fixes Applied

### Fix 1: Use Refs for Raycaster and Mouse

**Solution**: Created stable refs for `raycaster` and `mouse` that are initialized once and reused.

```typescript
// Create stable refs for raycaster and mouse (used in objectManagerConfig)
const raycasterRef = useRef<THREE.Raycaster | null>(null)
const mouseRef = useRef<THREE.Vector2 | null>(null)

// Initialize once
useEffect(() => {
  if (!raycasterRef.current) {
    raycasterRef.current = new THREE.Raycaster()
  }
  if (!mouseRef.current) {
    mouseRef.current = new THREE.Vector2()
  }
}, [])

// Use refs in config
const objectManagerConfig = useMemo(() => {
  if (!sceneResult || !controlsResult || !effectsResult || !lightingResult) return null
  if (!raycasterRef.current || !mouseRef.current) return null
  
  return {
    // ...
    raycaster: raycasterRef.current,  // ✅ Stable reference
    mouse: mouseRef.current,          // ✅ Stable reference
    // ...
  }
}, [sceneResult, controlsResult, effectsResult, lightingResult])
```

### Fix 2: Remove onViewerReady from Dependencies

**Solution**: Removed `onViewerReady` from the dependency array and added an eslint-disable comment explaining why.

```typescript
useEffect(() => {
  if (hookBasedViewer && animationResult) {
    viewerRef.current = hookBasedViewer
    onViewerReady?.(hookBasedViewer)
    console.log('[ViewerCanvas] ✅ Using hook-based ViewerInstance')
    
    return () => {
      // Stop animation loop on cleanup
      if (animationResult) {
        try {
          animationResult.stop()
        } catch (error) {
          console.error('[ViewerCanvas] ❌ Error stopping animation:', error)
        }
      }
    }
  }
  // NOTE: onViewerReady is intentionally excluded from dependencies to prevent infinite loops
  // It's a callback prop that may change on every render in the parent component
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hookBasedViewer, animationResult])  // ✅ Removed onViewerReady
```

## Expected Behavior After Fix

1. **Hooks initialize once** - No repeated initialization/cleanup cycles
2. **Stable configs** - `objectManagerConfig` only changes when actual dependencies change
3. **Stable effects** - `useEffect` for `hookBasedViewer` only runs when `hookBasedViewer` or `animationResult` actually change
4. **No infinite loops** - Console should show hooks initializing once, then staying initialized

## Testing

### Console Output to Verify

**Before Fix** (Infinite Loop):
```
[useThreeShadows] Shadow system initialized
[useThreeShadows] Shadow system cleaned up
[useThreeShadows] Shadow system initialized
[useThreeShadows] Shadow system cleaned up
... (repeats indefinitely)
```

**After Fix** (Stable):
```
[ViewerCanvas] ✅ Container ref available, hooks can initialize
[useThreeScene] Scene initialized
[useThreeControls] Controls initialized
[useThreeLighting] Lighting system initialized
[useThreeShadows] Shadow system initialized
[useThreeEffects] Effects system initialized
[useThreeModelLoader] Model loader initialized
[useThreeObjectManager] Object manager initialized
[useThreeAnimation] Animation loop initialized
[ViewerCanvas] ✅ ViewerInstance built successfully from hook results
[ViewerCanvas] ✅ Using hook-based ViewerInstance
... (no repeated cleanup/initialization)
```

### Manual Testing Steps

1. **Open browser console** and check for:
   - ✅ Hooks initialize once (not repeatedly)
   - ✅ No "Maximum update depth exceeded" errors
   - ✅ ViewerInstance builds successfully
   - ✅ Animation loop starts and runs smoothly

2. **Interact with the viewer**:
   - ✅ Camera controls work
   - ✅ Scene renders correctly
   - ✅ No performance issues or stuttering

3. **Check React DevTools**:
   - ✅ Component renders normally (not stuck in render loop)
   - ✅ State updates are stable

## Files Modified

- `src/viewer/ViewerCanvas.tsx`
  - Added `raycasterRef` and `mouseRef` (lines 92-93)
  - Added `useEffect` to initialize refs (lines 227-235)
  - Updated `objectManagerConfig` to use refs (lines 238-253)
  - Removed `onViewerReady` from dependency array (line 419)

## Related Issues Fixed Previously

- ✅ Hook dependency arrays (removed hook results from dependencies)
- ✅ Method calls in dependency arrays (use refs to track previous values)
- ✅ useState migration (all hooks now use useState for results)

## Status

✅ **FIXED** - Infinite loop should be resolved. Ready for browser testing.












