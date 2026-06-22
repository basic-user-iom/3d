# ViewerCanvas Ref Timing Fix

## Issue Identified (Perplexity Guidance)

**Problem**: `containerRef.current` is `null` during the first render and only becomes available after React renders the component to the DOM.

**Impact**: Hooks that depend on `containerRef.current` receive `null` config initially, and may not re-initialize when the ref becomes available.

## Solution Implemented

### 1. Container Availability Tracking
Added state to track when container ref becomes available:

```typescript
const [containerReady, setContainerReady] = useState(false)

useEffect(() => {
  if (containerRef.current) {
    if (!containerReady) {
      setContainerReady(true)
      console.log('[ViewerCanvas] ✅ Container ref available, hooks can initialize')
    }
  } else {
    if (containerReady) {
      setContainerReady(false)
      console.log('[ViewerCanvas] ⚠️ Container ref lost, hooks will re-initialize when available')
    }
  }
})
```

### 2. Updated Hook Config
Updated scene config to check both `containerRef.current` and `containerReady`:

```typescript
const sceneConfig = containerRef.current && containerReady ? {
  container: containerRef.current,
  // ... config
} : null
```

## How It Works

1. **Initial Render**: `containerRef.current` is `null`, `containerReady` is `false`
2. **After Render**: `useEffect` runs, detects `containerRef.current` is available
3. **State Update**: Sets `containerReady` to `true`
4. **Hook Re-initialization**: Hooks receive non-null config and initialize
5. **ViewerInstance Creation**: `useMemo` detects all hooks ready and creates ViewerInstance

## Benefits

- ✅ Ensures hooks re-initialize when container becomes available
- ✅ Prevents hooks from trying to use null container
- ✅ Provides clear logging for debugging
- ✅ Follows Perplexity best practices for ref timing

## Testing

To verify the fix works:

1. Open browser console
2. Look for: `[ViewerCanvas] ✅ Container ref available, hooks can initialize`
3. Verify hooks initialize after this message
4. Check that ViewerInstance is created successfully

## Notes

- Effect runs on every render (no dependency array) to catch ref changes immediately
- State update triggers re-render, which allows hooks to receive new config
- Hooks handle null configs gracefully and return null until ready














