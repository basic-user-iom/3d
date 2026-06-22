# Hook Initialization Issue Analysis

## Problem Identified

The hooks have a guard that prevents re-initialization:

```typescript
// In useThreeEffects, useThreeObjectManager, etc.
if (effectsRef.current) {
  console.log('[useThreeEffects] Effects system already initialized, reusing')
  return
}
```

## Root Cause

1. **Initial State**: When `config` is `null`, hooks don't initialize (early return)
2. **Config Becomes Available**: When `config` changes from `null` to an object, the dependency array changes from `null` to `'initialized'`
3. **Expected Behavior**: `useEffect` should re-run and initialize the hook
4. **Actual Behavior**: Hooks may not be re-running, or the guard is preventing initialization

## Dependency Array Pattern

All hooks use this pattern:
```typescript
}, [
  config ? 'initialized' : null
])
```

This should work, but there might be a timing issue where:
- React batches updates
- Hooks don't re-run when config changes
- The guard prevents re-initialization even when it should happen

## Console Evidence

From the console logs:
- ✅ `useThreeScene` initializes
- ⏳ Other hooks show "Hooks are initializing" message
- ❌ No logs for `useThreeShadows`, `useThreeEffects`, `useThreeObjectManager`, `useThreeAnimation` completing

## Potential Solutions

### Solution 1: Remove Guard (Allow Re-initialization)
Remove the guard that prevents re-initialization, but add cleanup logic:

```typescript
useEffect(() => {
  if (!config) {
    // Cleanup if config becomes null
    if (effectsRef.current) {
      effectsRef.current.cleanup()
      effectsRef.current = null
    }
    return
  }

  // Always re-initialize when config is available
  // (cleanup will be called automatically by useEffect return)
  // ... initialization code ...
}, [config ? 'initialized' : null])
```

### Solution 2: Use Config Object Reference in Dependency Array
Instead of using a primitive string, use the config object itself (but this might cause unnecessary re-runs):

```typescript
}, [config])
```

### Solution 3: Use a Stable Config Identifier
Create a stable identifier for the config based on its contents:

```typescript
const configId = useMemo(() => {
  if (!config) return null
  return `${config.scene?.uuid || ''}-${config.camera?.uuid || ''}`
}, [config?.scene?.uuid, config?.camera?.uuid])
```

### Solution 4: Check if Config Actually Changed
Only initialize if the config is meaningfully different:

```typescript
const prevConfigRef = useRef<ThreeEffectsConfig | null>(null)

useEffect(() => {
  if (!config) return
  
  // Check if config actually changed
  if (prevConfigRef.current === config) {
    return // Config hasn't changed, skip
  }
  
  prevConfigRef.current = config
  
  // Initialize...
}, [config])
```

## Recommended Fix

**Use Solution 1** - Remove the guard and allow re-initialization, but ensure proper cleanup:

```typescript
useEffect(() => {
  if (!config) {
    // Cleanup when config becomes null
    if (effectsRef.current) {
      effectsRef.current.cleanup()
      effectsRef.current = null
    }
    return
  }

  // Cleanup previous initialization if it exists
  if (effectsRef.current) {
    effectsRef.current.cleanup()
    effectsRef.current = null
  }

  // Initialize with new config
  // ... initialization code ...
  
  effectsRef.current = result
}, [config ? 'initialized' : null])
```

This ensures:
1. Hooks re-initialize when config changes from `null` to object
2. Proper cleanup happens before re-initialization
3. No stale state from previous initializations

## Testing

After applying the fix, verify:
1. All 8 hooks initialize in sequence
2. ViewerInstance is built successfully
3. No memory leaks from multiple initializations
4. Cleanup is called properly when config changes














