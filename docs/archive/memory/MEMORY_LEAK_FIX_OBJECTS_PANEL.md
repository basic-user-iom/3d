# Memory Leak Fix: ObjectsPanel.tsx

## Issue
**File**: `src/components/ObjectsPanel.tsx`  
**Lines**: 237-277  
**Problem**: The `pendingTimeouts` array accumulates timeout IDs indefinitely when the condition `(hasModels && currentTree.length === 0)` persists. Since `checkSceneChanges()` runs every 200ms, new timeouts are continuously added to the array even after they complete, causing unbounded memory growth.

## Root Cause
1. `checkSceneChanges()` runs every 200ms (line 270)
2. If `hasModels && currentTree.length === 0` is true, a new timeout is added every 200ms
3. Timeouts complete after 100ms, but references remain in `pendingTimeouts` array
4. Array grows without bound until component unmount
5. This wastes memory, especially if the condition persists for long periods

## Fix Applied

### 1. Added Dedicated Tracking Variable
- Added `pendingEmptyTreeTimeout` to track if a timeout is already pending for the empty tree condition
- Prevents adding duplicate timeouts when condition persists

### 2. Prevent Duplicate Timeouts
- Only schedule a new timeout if `pendingEmptyTreeTimeout` is `null`
- Prevents the array from growing when the condition persists

### 3. Cleanup on Timeout Completion
- When timeout completes, it:
  - Clears the `pendingEmptyTreeTimeout` reference
  - Removes itself from the `pendingTimeouts` array
  - Prevents memory accumulation

### 4. Early Cancellation
- If tree is no longer empty, immediately cancel pending timeout
- Removes timeout from array and clears reference
- Prevents unnecessary timeout execution

### 5. Enhanced Cleanup
- Cleanup function now also clears `pendingEmptyTreeTimeout` reference
- Ensures no dangling references remain

## Code Changes

**Before:**
```typescript
if (currentTree.length === 0) {
  const timeoutId = setTimeout(updateTree, 100)
  pendingTimeouts.push(timeoutId)
}
```

**After:**
```typescript
if (currentTree.length === 0) {
  // Only add a new timeout if we don't already have one pending
  if (!pendingEmptyTreeTimeout) {
    const timeoutId = setTimeout(() => {
      updateTree()
      // Clear the reference when timeout completes
      pendingEmptyTreeTimeout = null
      // Remove from array (filter out completed timeout)
      const index = pendingTimeouts.indexOf(timeoutId)
      if (index > -1) {
        pendingTimeouts.splice(index, 1)
      }
    }, 100)
    pendingTimeouts.push(timeoutId)
    pendingEmptyTreeTimeout = timeoutId
  }
} else {
  // Tree is no longer empty - clear pending timeout if exists
  if (pendingEmptyTreeTimeout) {
    clearTimeout(pendingEmptyTreeTimeout)
    const index = pendingTimeouts.indexOf(pendingEmptyTreeTimeout)
    if (index > -1) {
      pendingTimeouts.splice(index, 1)
    }
    pendingEmptyTreeTimeout = null
  }
}
```

## Benefits
- ✅ **Prevents unbounded array growth** - Only one timeout pending at a time
- ✅ **Automatic cleanup** - Timeouts remove themselves from array when complete
- ✅ **Early cancellation** - Cancels pending timeout when condition no longer applies
- ✅ **Memory efficient** - Array size stays bounded (max 1 timeout for this condition)
- ✅ **No functional changes** - Same behavior, just more efficient

## Status
✅ **FIXED** - Memory leak resolved, array growth is now bounded


