# ViewerCanvas Hooks - Testing Checklist

## Pre-Testing Status

### ✅ All Hooks Created
- [x] useThreeScene
- [x] useThreeControls
- [x] useThreeLighting
- [x] useThreeShadows
- [x] useThreeEffects
- [x] useThreeModelLoader
- [x] useThreeObjectManager
- [x] useThreeAnimation

### ✅ Integration Complete
- [x] All hooks called in ViewerCanvas
- [x] ViewerInstance built from hook results
- [x] Error handling and validation added
- [x] Feature flag implemented
- [x] Null safety fixes applied

## Testing Checklist

### 1. Initial Load
- [ ] Page loads without errors
- [ ] No console errors about null configs
- [ ] Container ref becomes available
- [ ] Hooks initialize in correct order
- [ ] ViewerInstance is created successfully

### 2. Hook Initialization
- [ ] useThreeScene initializes when container ready
- [ ] useThreeControls initializes after scene
- [ ] useThreeLighting initializes after scene
- [ ] useThreeShadows initializes after lighting
- [ ] useThreeEffects initializes after scene
- [ ] useThreeModelLoader initializes after scene
- [ ] useThreeObjectManager initializes after controls
- [ ] useThreeAnimation initializes after all

### 3. ViewerInstance Creation
- [ ] All hook results are non-null
- [ ] ViewerInstance has all required properties
- [ ] Scene renders correctly
- [ ] Camera works
- [ ] Controls work (orbit, pan, zoom)
- [ ] Renderer displays scene

### 4. Feature Flag Testing
- [ ] Hook-based viewer works when flag is `true`
- [ ] Existing initialization works when flag is `false`
- [ ] Can toggle flag in console
- [ ] Both paths produce same results

### 5. System Functionality
- [ ] Lighting system works
- [ ] Shadows work
- [ ] Post-processing works
- [ ] Model loading works
- [ ] Object selection works
- [ ] Animation loop runs

### 6. Error Handling
- [ ] Errors are caught and logged
- [ ] Fallback to existing initialization works
- [ ] No crashes on invalid configs
- [ ] Validation catches missing properties

### 7. Performance
- [ ] No performance degradation
- [ ] Memory usage is acceptable
- [ ] No memory leaks
- [ ] Cleanup works correctly

## Browser Console Commands

### Check Hook Status
```javascript
// Check if hooks are ready
const viewer = getSharedViewer()
console.log('Viewer:', viewer)
console.log('Scene:', viewer?.scene)
console.log('Camera:', viewer?.camera)
console.log('Renderer:', viewer?.renderer)
```

### Test Feature Flag
```javascript
// Enable hook-based viewer
useAppStore.getState().setUseHookBasedViewer(true)

// Disable hook-based viewer
useAppStore.getState().setUseHookBasedViewer(false)

// Check current state
console.log('Hook-based viewer:', useAppStore.getState().useHookBasedViewer)
```

### Check Hook Results
```javascript
// This will be available if hooks are working
// Check console logs for hook initialization messages
```

## Expected Console Output

### Successful Initialization
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
```

### Fallback Initialization
```
[ViewerCanvas] Using existing initialization (hooks not ready: scene, controls, ...)
```

## Common Issues to Watch For

1. **Null Config Errors**: Should be fixed now
2. **Timing Issues**: Container ref might not be ready on first render
3. **Dependency Array Issues**: Should use optional chaining
4. **Memory Leaks**: Check cleanup functions
5. **Type Errors**: Should be resolved with proper types

## Next Steps After Testing

1. **If All Tests Pass**:
   - Make hook-based viewer primary
   - Remove feature flag
   - Remove old initialization code

2. **If Issues Found**:
   - Fix issues
   - Re-test
   - Document fixes

3. **Performance Optimization**:
   - Profile performance
   - Optimize if needed
   - Compare with existing path

## Notes

- All hooks are null-safe
- Feature flag allows easy rollback
- Both paths can coexist during testing
- Detailed logging helps with debugging














