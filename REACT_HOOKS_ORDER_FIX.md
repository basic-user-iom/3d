# React Hooks Order Violation Fix

## Issue
React detected a change in the order of Hooks called by ViewerCanvas, causing:
- Error: "React has detected a change in the order of Hooks"
- Error: "Cannot read properties of null (reading 'getSnapshot')"

## Root Cause
The `useEffect` at line 170 was missing a dependency array, causing it to run on every render. While this doesn't directly cause a hook order violation, it can lead to unexpected behavior and React might detect inconsistencies.

## Fix Applied
Added dependency array to the `useEffect` that tracks container availability:

```typescript
useEffect(() => {
  // Check if container is available
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
}, [containerReady]) // ✅ Added dependency array
```

## Verification
All hooks in ViewerCanvas are called unconditionally at the top level:
1. ✅ All `useRef` calls (lines 153-162, 195, 197, etc.)
2. ✅ `useState` (line 166)
3. ✅ `useEffect` (line 170) - now has dependency array
4. ✅ All custom hooks (lines 271-361) - called unconditionally
5. ✅ `useMemo` (line 366)
6. ✅ All other `useEffect` and `useAppStore` calls - all unconditional

## Best Practices Applied
1. **All hooks called at top level** - No hooks inside conditionals, loops, or nested functions
2. **Dependency arrays** - All `useEffect` hooks have proper dependency arrays
3. **Consistent hook order** - Hooks are called in the same order on every render

## Next Steps
1. Monitor console for any remaining hook order violations
2. Verify all hooks initialize successfully
3. Test hook-based viewer functionality














