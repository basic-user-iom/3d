# Perplexity Query: React Hooks Initialization Issue

## Problem Description

I'm refactoring a large Three.js React component (`ViewerCanvas.tsx`, 11,000+ lines) into smaller custom hooks. The hooks are initializing, but some hooks are not completing initialization, and the ViewerInstance is not being built.

## Current Situation

### Hooks Status
- ✅ `useThreeScene` - Initializes successfully
- ✅ `useThreeControls` - Initializes successfully  
- ✅ `useThreeLighting` - Initializes successfully
- ✅ `useThreeShadows` - Initializes successfully
- ✅ `useThreeEffects` - Initializes successfully
- ✅ `useThreeModelLoader` - Initializes successfully
- ✅ `useThreeObjectManager` - Initializes successfully
- ❓ `useThreeAnimation` - May not be initializing (depends on effectsResult)

### Console Output
```
[ViewerCanvas] ⏳ Hooks are initializing, waiting for them to be ready...
{containerAvailable: true, containerReady: false, sceneResult: false, controlsResult: false, ...}
[useThreeScene] Scene initialized
```

### Hook Dependency Chain
```
useThreeScene (no deps)
  ↓
useThreeControls (depends on: sceneResult)
  ↓
useThreeLighting (depends on: sceneResult)
  ↓
useThreeShadows (depends on: sceneResult, controlsResult, lightingResult)
  ↓
useThreeEffects (depends on: sceneResult, controlsResult)
  ↓
useThreeModelLoader (depends on: sceneResult)
  ↓
useThreeObjectManager (depends on: sceneResult, controlsResult)
  ↓
useThreeAnimation (depends on: sceneResult, controlsResult, effectsResult)
```

## Code Structure

### Hook Configuration Pattern
```typescript
// Configs are created conditionally based on previous hook results
const sceneConfig = containerRef.current && containerReady ? { ... } : null
const sceneResult = useThreeScene(sceneConfig)

const controlsConfig = sceneResult ? { ... } : null
const controlsResult = useThreeControls(controlsConfig)
```

### Guard Logic
```typescript
// Guard prevents old initialization when hooks are initializing
if (hookBasedViewer === null && useHookBasedViewer && !isInitializedRef.current) {
  const containerAvailable = containerRef.current !== null
  const hooksInitializing = (containerAvailable && !sceneResult) || 
                            (sceneResult && !controlsResult) ||
                            // ... more conditions
  if (hooksInitializing) {
    console.log('[ViewerCanvas] ⏳ Hooks are initializing, waiting for them to be ready...')
    return // Early return - don't run old initialization
  }
}
```

### useMemo for ViewerInstance
```typescript
const hookBasedViewer = useMemo(() => {
  if (!sceneResult || !controlsResult || ... || !animationResult) {
    return null
  }
  // Build ViewerInstance from hook results
  return viewer
}, [sceneResult, controlsResult, lightingResult, shadowsResult, effectsResult, modelLoaderResult, objectManagerResult, animationResult])
```

## Questions for Perplexity

1. **React Hooks Initialization Timing**: Why might some hooks not be initializing even though their dependencies (configs) become available? The hooks use `useEffect` with dependency arrays like `[config ? 'initialized' : null]`.

2. **useMemo Re-evaluation**: The `useMemo` for `hookBasedViewer` includes all hook results in its dependency array. Should it re-evaluate when `animationResult` changes from `null` to a valid result?

3. **Guard Logic Effectiveness**: The guard logic checks if hooks are initializing, but it seems like hooks might be stuck in an initializing state. Is there a better pattern for detecting when hooks are ready vs. still initializing?

4. **React Render Cycles**: How many render cycles should it take for all 8 hooks to initialize? Currently, it seems like hooks are not completing initialization even after multiple render cycles.

5. **Best Practices**: What are the best practices for managing complex hook dependency chains in React? Should I use a different pattern (e.g., context, state machine, or different hook structure)?

## Technical Details

- **React Version**: 18
- **Three.js Version**: 0.162
- **TypeScript**: Yes
- **Build Tool**: Vite 5
- **Pattern**: Custom hooks with conditional configs based on previous hook results

## Expected Behavior

All 8 hooks should initialize in sequence, and once all are ready, the `hookBasedViewer` should be built from their results. The ViewerInstance should then be set to `viewerRef.current` and the `onViewerReady` callback should be called.

## Actual Behavior

Hooks appear to initialize (based on console logs), but the ViewerInstance is not being built, suggesting that either:
1. Not all hooks are completing initialization
2. The `useMemo` is not re-evaluating when hooks become ready
3. The guard logic is preventing the hook-based path from being taken














