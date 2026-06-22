# Hook-Based Viewer Fix Applied

## Issue Found

The `useEffect` that checks `hookBasedViewer` had an empty dependency array `[]`, causing it to only run once on mount. This meant:
1. Hooks return `null` on first render (they use `useEffect` internally)
2. `hookBasedViewer` is `null` initially
3. `useEffect` runs once, sees `hookBasedViewer` is `null`, falls back to existing initialization
4. Hooks initialize in next render cycle, but `useEffect` doesn't re-run
5. Hook-based viewer never gets used

## Fix Applied

Updated the dependency array to include:
- `hookBasedViewer` - so it re-runs when hooks become ready
- `useHookBasedViewer` - so it re-runs when feature flag changes
- `onViewerReady` - callback dependency
- All hook results - for completeness

## Expected Behavior After Fix

1. Component renders
2. Hooks called (return `null`)
3. `hookBasedViewer` useMemo returns `null`
4. `useEffect` runs, sees `hookBasedViewer` is `null`, falls back (but doesn't initialize yet)
5. Next render cycle: hooks initialize via `useEffect`
6. `hookBasedViewer` useMemo recalculates (now has valid ViewerInstance)
7. `useEffect` re-runs (because `hookBasedViewer` changed)
8. Hook-based viewer is used ✅

## Testing

After this fix, the console should show:
```
[ViewerCanvas] ✅ Container ref available, hooks can initialize
[useThreeScene] Scene initialized
[useThreeControls] Controls initialized
...
[ViewerCanvas] ✅ ViewerInstance built successfully from hook results
[ViewerCanvas] ✅ Using hook-based ViewerInstance
```

Instead of:
```
[ViewerCanvas] Using existing initialization (hooks not ready: ...)
```














