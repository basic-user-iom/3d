# ViewerCanvas Hook-Based Initialization Testing Guide

## Testing Strategy (Perplexity Best Practices)

Based on Perplexity's guidance:
- **Test the component, not isolated hooks** - Test ViewerCanvas as a whole
- **Use console logging** - Verify hook initialization through logs
- **Check hook readiness** - Ensure all hooks return non-null when ready

## Hook Initialization Flow

### Hook Dependency Chain
1. **useThreeScene** - Requires: `containerRef.current`
2. **useThreeControls** - Requires: `sceneResult` (camera, renderer)
3. **useThreeLighting** - Requires: `sceneResult` (scene)
4. **useThreeShadows** - Requires: `sceneResult`, `controlsResult`, `lightingResult`
5. **useThreeEffects** - Requires: `sceneResult`, `controlsResult`
6. **useThreeModelLoader** - Requires: `sceneResult`
7. **useThreeObjectManager** - Requires: `sceneResult`, `controlsResult`
8. **useThreeAnimation** - Requires: `sceneResult`, `controlsResult`, `effectsResult`

### Expected Console Logs

#### When Hooks Are Ready
```
[ViewerCanvas] ✅ Using hook-based ViewerInstance
[ViewerCanvas] Hook-based viewer details: { hasScene: true, hasCamera: true, ... }
[ViewerCanvas] ✅ Hook-based viewer ready callback completed
[useThreeAnimation] Animation loop started
```

#### When Hooks Are Not Ready
```
[ViewerCanvas] Using existing initialization (hooks not ready: scene, controls, ...)
[ViewerCanvas] Hook status: { scene: false, controls: false, ... }
```

## Testing Checklist

### 1. Initial Load Test
- [ ] Open application
- [ ] Check console for hook initialization logs
- [ ] Verify hook-based viewer is used (if all hooks ready)
- [ ] Verify existing initialization is used (if hooks not ready)
- [ ] Check that viewer renders correctly

### 2. Hook Readiness Test
- [ ] Verify `containerRef.current` exists (required for scene hook)
- [ ] Check that scene hook initializes first
- [ ] Verify controls hook initializes after scene
- [ ] Check that all dependent hooks initialize in order
- [ ] Verify all hooks return non-null when ready

### 3. ViewerInstance Test
- [ ] Verify `viewerRef.current` is set
- [ ] Check that all ViewerInstance properties are present
- [ ] Verify `onViewerReady` callback is called
- [ ] Check that animation loop starts
- [ ] Verify no errors in console

### 4. System Integration Test
- [ ] Test scene rendering
- [ ] Test camera controls
- [ ] Test lighting system
- [ ] Test shadow system
- [ ] Test post-processing
- [ ] Test model loading
- [ ] Test object selection
- [ ] Test animation loop

### 5. Cleanup Test
- [ ] Unmount component
- [ ] Verify animation loop stops
- [ ] Check that hooks cleanup properly
- [ ] Verify no memory leaks

## Diagnostic Commands

### Check Hook Status
```javascript
// In browser console
const viewer = window.viewerRef?.current
console.log('Viewer status:', {
  exists: !!viewer,
  hasScene: !!viewer?.scene,
  hasCamera: !!viewer?.camera,
  hasRenderer: !!viewer?.renderer,
  hasControls: !!viewer?.controls
})
```

### Force Hook Re-initialization
```javascript
// Force re-render to test hook initialization
// (Component will re-initialize hooks if dependencies change)
```

## Common Issues

### Issue: Hooks Not Initializing
**Symptoms**: Console shows "hooks not ready"
**Causes**:
- `containerRef.current` is null
- Hook dependencies not met
- Config is null

**Solutions**:
- Ensure container element exists
- Check hook dependency chain
- Verify configs are passed correctly

### Issue: Both Initialization Paths Run
**Symptoms**: Both hook-based and existing initialization run
**Causes**:
- Early return not working
- useEffect dependencies incorrect

**Solutions**:
- Verify early return in useEffect
- Check useEffect dependencies
- Ensure hook-based viewer check happens first

### Issue: Animation Loop Not Starting
**Symptoms**: No rendering, animation loop not running
**Causes**:
- Animation hook not ready
- Animation loop not started

**Solutions**:
- Check animationResult is not null
- Verify animationResult.start() is called
- Check animation hook initialization

## Success Criteria

✅ All hooks initialize successfully
✅ Hook-based viewer is created when all hooks ready
✅ Existing initialization used as fallback
✅ No errors in console
✅ Viewer renders correctly
✅ All systems work (controls, lighting, shadows, etc.)
✅ Animation loop runs
✅ Cleanup works properly

## Next Steps After Testing

1. **If Tests Pass**: Switch to hook-based initialization as primary
2. **If Issues Found**: Fix issues and retest
3. **When Stable**: Remove old initialization code
4. **Optimize**: Add memoization, optimize performance














