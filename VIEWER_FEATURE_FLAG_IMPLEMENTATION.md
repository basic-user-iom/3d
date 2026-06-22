# ViewerCanvas Feature Flag Implementation

## Feature Flag Added

### Implementation

Added `useHookBasedViewer` feature flag to control initialization path:

```typescript
// In useAppStore.ts
export interface AppState {
  // ... other properties
  useHookBasedViewer: boolean
  setUseHookBasedViewer: (enabled: boolean) => void
}

// Initial state
useHookBasedViewer: true, // Default to true - hook-based viewer is ready
setUseHookBasedViewer: (enabled) => set({ useHookBasedViewer: enabled }),
```

### Usage in ViewerCanvas

```typescript
const { useHookBasedViewer } = useAppStore()

useEffect(() => {
  // Use hook-based viewer if available AND feature flag enabled
  if (hookBasedViewer && useHookBasedViewer) {
    // Use hook-based viewer
  } else {
    // Use existing initialization
    if (!useHookBasedViewer) {
      console.log('[ViewerCanvas] Feature flag disabled - using existing initialization')
    }
  }
}, [hookBasedViewer, useHookBasedViewer])
```

## Benefits

- ✅ **Gradual Rollout**: Enable/disable hook-based viewer easily
- ✅ **Easy Rollback**: Can switch back to old code instantly
- ✅ **A/B Testing**: Compare both paths side-by-side
- ✅ **Safe Migration**: Test in production with feature flag
- ✅ **Debugging**: Can disable to isolate issues

## Control Methods

### Browser Console
```javascript
// Enable hook-based viewer
useAppStore.getState().setUseHookBasedViewer(true)

// Disable hook-based viewer (use old code)
useAppStore.getState().setUseHookBasedViewer(false)

// Check current state
console.log('Hook-based viewer enabled:', useAppStore.getState().useHookBasedViewer)
```

### UI Control (Future)
- Add toggle in settings/developer panel
- Allow per-user or per-session control
- Add analytics to track usage

## Migration Strategy

### Phase 1: Testing (Current)
- Feature flag: `true` (default)
- Hook-based viewer used when hooks ready
- Existing code as fallback
- Monitor for issues

### Phase 2: Validation
- Test thoroughly in browser
- Compare both paths
- Fix any issues found
- Gather performance metrics

### Phase 3: Rollout
- Keep feature flag enabled
- Monitor for errors
- Gradually increase usage
- Remove old code when stable

### Phase 4: Cleanup
- Remove feature flag
- Remove old initialization code
- Optimize further

## Testing

### Test Hook-Based Path
1. Ensure feature flag is `true`
2. Verify hooks initialize
3. Check ViewerInstance creation
4. Test all systems

### Test Existing Path
1. Set feature flag to `false`
2. Verify existing initialization runs
3. Compare behavior
4. Check for regressions

### Compare Both Paths
1. Test same scenarios in both paths
2. Compare performance
3. Check memory usage
4. Verify feature parity

## Notes

- Default is `true` - hook-based viewer ready for use
- Feature flag allows instant rollback if needed
- Both paths can coexist during migration
- Easy to test and validate














