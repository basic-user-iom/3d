# Test Hook-Based Viewer - Step by Step Guide

## Prerequisites
- Dev server running (`npm run dev`)
- Browser console open
- Feature flag enabled by default

## Test 1: Basic Initialization

### Steps
1. Open browser to `http://localhost:3000`
2. Open browser console (F12)
3. Check for initialization messages

### Expected Console Output
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

### Verify
```javascript
// In console
const viewer = getSharedViewer()
console.log('Viewer exists:', !!viewer)
console.log('Scene:', !!viewer?.scene)
console.log('Camera:', !!viewer?.camera)
console.log('Renderer:', !!viewer?.renderer)
```

## Test 2: Feature Flag Toggle

### Steps
1. Check current state
2. Disable hook-based viewer
3. Reload page
4. Re-enable hook-based viewer
5. Reload page

### Commands
```javascript
// Check current state
console.log('Hook-based viewer:', useAppStore.getState().useHookBasedViewer)

// Disable
useAppStore.getState().setUseHookBasedViewer(false)
// Reload page

// Enable
useAppStore.getState().setUseHookBasedViewer(true)
// Reload page
```

### Expected
- When disabled: Uses existing initialization
- When enabled: Uses hook-based initialization
- Both should render the same scene

## Test 3: Feature Functionality

### Camera Controls
- [ ] Orbit (drag) works
- [ ] Pan (middle mouse) works
- [ ] Zoom (scroll) works
- [ ] Camera bounds respected

### Lighting
- [ ] Ambient light visible
- [ ] Directional lights work
- [ ] Light helpers visible
- [ ] Light gizmos work

### Shadows
- [ ] Shadows render correctly
- [ ] Shadow system switches work
- [ ] Shadow plane visible/hidden correctly

### Post-Processing
- [ ] Post-processing effects work
- [ ] SSS works (if enabled)
- [ ] SSR works (if enabled)
- [ ] Bloom works
- [ ] Tone mapping works

### Model Loading
- [ ] Load GLTF model
- [ ] Load FBX model
- [ ] Load OBJ model
- [ ] Textures load correctly

### Object Selection
- [ ] Click to select works
- [ ] Transform controls appear
- [ ] Selection highlights work
- [ ] Deselection works

### Animation
- [ ] Scene animates smoothly
- [ ] No frame drops
- [ ] Animation loop runs continuously

## Test 4: Error Handling

### Test Scenarios
1. **Container ref delay**
   - Should wait for container
   - Should initialize when ready

2. **Missing dependencies**
   - Should fall back to existing initialization
   - Should log which hooks are missing

3. **Validation failure**
   - Should catch errors
   - Should fall back gracefully
   - Should log error details

4. **Cleanup on unmount**
   - Should stop animation
   - Should dispose resources
   - Should not leak memory

## Test 5: Performance

### Check Memory
```javascript
// In console
performance.memory // Chrome only
// Check for memory leaks over time
```

### Check Frame Rate
- Open browser DevTools Performance tab
- Record for 30 seconds
- Check for frame drops
- Check for long tasks

### Compare Paths
1. Test with hook-based viewer
2. Test with existing initialization
3. Compare performance metrics
4. Should be similar or better

## Test 6: Edge Cases

### Rapid Toggle
- Toggle feature flag rapidly
- Should not crash
- Should handle state changes

### Container Resize
- Resize browser window
- Should update renderer size
- Should maintain aspect ratio

### Multiple Initializations
- Unmount and remount component
- Should clean up properly
- Should re-initialize correctly

## Troubleshooting

### Issue: Hooks not initializing
**Check:**
- Container ref available?
- Feature flag enabled?
- Console for errors?

**Fix:**
- Ensure container is mounted
- Check `containerReady` state
- Verify feature flag

### Issue: ViewerInstance not created
**Check:**
- All hooks returning results?
- Validation passing?
- Console for validation errors?

**Fix:**
- Check hook results
- Verify all dependencies
- Check validation logs

### Issue: Features not working
**Check:**
- ViewerInstance has required properties?
- Systems initialized?
- Console for errors?

**Fix:**
- Verify ViewerInstance structure
- Check system initialization
- Review error logs

## Success Criteria

✅ All tests pass
✅ No console errors
✅ Features work correctly
✅ Performance acceptable
✅ No memory leaks
✅ Both paths work identically

## Next Steps After Testing

1. **If All Tests Pass:**
   - Make hook-based viewer default
   - Remove feature flag
   - Remove old initialization code

2. **If Issues Found:**
   - Document issues
   - Fix problems
   - Re-test

3. **If Performance Issues:**
   - Profile performance
   - Optimize bottlenecks
   - Re-test














