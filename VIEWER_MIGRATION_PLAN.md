# ViewerCanvas Migration Plan

## Current Status

- ✅ All 8 hooks created
- ✅ All hook calls added
- ✅ ViewerInstance built from hooks
- ✅ Error handling and validation added
- ✅ Feature flag implemented
- ✅ Ready for testing

## Migration Phases

### Phase 1: Testing & Validation (Current)

**Goal**: Validate hook-based viewer works correctly

**Actions**:
1. ✅ Feature flag added (`useHookBasedViewer: true`)
2. ⏳ Test in browser
3. ⏳ Verify all systems work
4. ⏳ Compare with existing path
5. ⏳ Fix any issues

**Success Criteria**:
- Hook-based viewer initializes correctly
- All systems work (controls, lighting, shadows, etc.)
- No regressions vs existing path
- Performance is acceptable

### Phase 2: Gradual Rollout

**Goal**: Roll out hook-based viewer to all users

**Actions**:
1. Keep feature flag enabled
2. Monitor for errors
3. Gather performance metrics
4. Fix any issues found
5. Gradually increase confidence

**Success Criteria**:
- No critical errors
- Performance matches or exceeds existing
- User experience unchanged or improved
- Memory usage acceptable

### Phase 3: Make Primary

**Goal**: Make hook-based viewer the primary path

**Actions**:
1. Keep existing code as fallback
2. Make hook-based viewer default
3. Monitor closely
4. Fix issues quickly
5. Document differences

**Success Criteria**:
- Hook-based viewer stable
- Existing code rarely used
- No major issues
- Ready for cleanup

### Phase 4: Cleanup

**Goal**: Remove old initialization code

**Actions**:
1. Remove feature flag
2. Remove old initialization code
3. Clean up unused code
4. Optimize further
5. Update documentation

**Success Criteria**:
- Old code removed
- Codebase simplified
- Performance improved
- Maintenance easier

## Feature Flag Control

### Enable Hook-Based Viewer
```javascript
useAppStore.getState().setUseHookBasedViewer(true)
```

### Disable (Use Old Code)
```javascript
useAppStore.getState().setUseHookBasedViewer(false)
```

### Check Status
```javascript
console.log('Hook-based viewer:', useAppStore.getState().useHookBasedViewer)
```

## Testing Checklist

### Hook-Based Path
- [ ] Container ref available
- [ ] All hooks initialize
- [ ] ViewerInstance created
- [ ] Scene renders
- [ ] Controls work
- [ ] Lighting works
- [ ] Shadows work
- [ ] Post-processing works
- [ ] Model loading works
- [ ] Object selection works
- [ ] Animation loop runs
- [ ] No errors in console

### Existing Path (Fallback)
- [ ] Works when hooks not ready
- [ ] Works when feature flag disabled
- [ ] All systems functional
- [ ] No regressions

### Comparison
- [ ] Both paths produce same results
- [ ] Performance similar or better
- [ ] Memory usage acceptable
- [ ] No feature gaps

## Rollback Plan

If issues found:
1. Set `useHookBasedViewer: false` in console
2. Reload page
3. Existing code will run
4. Investigate and fix issues
5. Re-enable when fixed

## Notes

- Feature flag allows instant rollback
- Both paths can coexist
- Gradual migration is safe
- Testing is critical before cleanup














