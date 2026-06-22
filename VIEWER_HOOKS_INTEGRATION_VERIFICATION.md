# ViewerCanvas Hooks Integration - Verification Plan

## Integration Status

### ✅ Completed
1. All 8 hooks created and integrated
2. ViewerInstance built from hook results
3. Feature flag implemented
4. Null safety fixes applied
5. Error handling added

### 🔍 Verification Needed

## Critical Integration Points

### 1. Hook Initialization Order
The hooks must initialize in this order:
1. `useThreeScene` - Provides scene, camera, renderer
2. `useThreeControls` - Depends on camera, renderer
3. `useThreeLighting` - Depends on scene
4. `useThreeShadows` - Depends on scene, camera, renderer, lights
5. `useThreeEffects` - Depends on scene, camera, renderer
6. `useThreeModelLoader` - Depends on scene
7. `useThreeObjectManager` - Depends on scene, controls
8. `useThreeAnimation` - Depends on all

### 2. ViewerInstance Construction
The `hookBasedViewer` is built using `useMemo` when:
- All hook results are non-null
- All critical properties are validated
- No errors occur during construction

### 3. Feature Flag Integration
- `useHookBasedViewer` from store controls which path is used
- If `true` and hooks ready → use hook-based viewer
- If `false` or hooks not ready → use existing initialization

### 4. onViewerReady Callback
- Called when hook-based viewer is ready
- Passes the ViewerInstance to parent component
- Must be called before animation starts

## Potential Issues to Check

### Issue 1: Container Ref Timing
**Problem**: Container ref might not be available on first render
**Solution**: `containerReady` state tracks when container is available
**Status**: ✅ Fixed with containerReady tracking

### Issue 2: Hook Dependency Chain
**Problem**: Hooks might try to initialize before dependencies are ready
**Solution**: Configs are `null` until dependencies are available
**Status**: ✅ Fixed with conditional config creation

### Issue 3: ViewerInstance Validation
**Problem**: ViewerInstance might be created with missing properties
**Solution**: Comprehensive validation before construction
**Status**: ✅ Fixed with validation checks

### Issue 4: Animation Loop
**Problem**: Animation might not start or might start twice
**Solution**: Animation hook manages its own lifecycle
**Status**: ✅ Fixed with animation hook

### Issue 5: Cleanup
**Problem**: Resources might not be cleaned up properly
**Solution**: Each hook handles its own cleanup
**Status**: ✅ Fixed with cleanup functions

## Testing Checklist

### Phase 1: Basic Initialization
- [ ] Page loads without errors
- [ ] Container ref becomes available
- [ ] All hooks initialize
- [ ] ViewerInstance is created
- [ ] Scene renders

### Phase 2: Feature Verification
- [ ] Camera controls work
- [ ] Lighting works
- [ ] Shadows work
- [ ] Post-processing works
- [ ] Model loading works
- [ ] Object selection works
- [ ] Animation loop runs

### Phase 3: Feature Flag Testing
- [ ] Hook-based viewer works when flag is `true`
- [ ] Existing initialization works when flag is `false`
- [ ] Can toggle flag without errors
- [ ] Both paths produce same results

### Phase 4: Edge Cases
- [ ] Handles container ref delay
- [ ] Handles missing dependencies
- [ ] Handles validation failures
- [ ] Handles cleanup on unmount
- [ ] Handles re-initialization

## Debugging Commands

### Check Hook Status
```javascript
// In browser console
const viewer = getSharedViewer()
console.log('Viewer:', viewer)
console.log('Scene:', viewer?.scene)
console.log('Camera:', viewer?.camera)
console.log('Renderer:', viewer?.renderer)
console.log('Controls:', viewer?.controls)
```

### Check Feature Flag
```javascript
console.log('Hook-based viewer enabled:', useAppStore.getState().useHookBasedViewer)
```

### Toggle Feature Flag
```javascript
// Enable
useAppStore.getState().setUseHookBasedViewer(true)

// Disable
useAppStore.getState().setUseHookBasedViewer(false)
```

### Check Hook Results
```javascript
// This requires accessing internal state
// Check console logs for hook initialization messages
```

## Expected Behavior

### Successful Initialization
1. Container ref becomes available
2. `useThreeScene` initializes
3. Other hooks initialize in order
4. `hookBasedViewer` is created
5. `onViewerReady` is called
6. Animation loop starts
7. Scene renders

### Fallback Behavior
1. If hooks not ready or flag disabled
2. Existing initialization runs
3. Old ViewerInstance is created
4. Animation loop starts
5. Scene renders

## Next Steps

1. **Start Dev Server** - Verify no build errors
2. **Browser Testing** - Test hook-based initialization
3. **Functionality Test** - Verify all features work
4. **Performance Check** - Monitor memory and performance
5. **Compare Paths** - Ensure both paths work identically

## Notes

- Feature flag allows safe testing
- Both paths can coexist
- Detailed logging helps debugging
- Validation prevents invalid ViewerInstance
- Cleanup ensures no memory leaks














