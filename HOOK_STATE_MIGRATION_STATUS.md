# Hook State Migration Status

## ✅ COMPLETED - Using `useState` (Triggers Re-renders)

1. **`useThreeScene`** ✅
   - Uses: `useState<ThreeSceneResult | null>(null)`
   - Status: Working correctly

2. **`useThreeControls`** ✅
   - Uses: `useState<ThreeControlsResult | null>(null)`
   - Status: Working correctly

3. **`useThreeLighting`** ✅
   - Uses: `useState<ThreeLightingResult | null>(null)`
   - Status: Working correctly (re-initialization loop fixed)

4. **`useThreeEffects`** ✅
   - Uses: `useState<ThreeEffectsResult | null>(null)`
   - Status: Just fixed by user

## ❌ REMAINING - Still Using `useRef` (Doesn't Trigger Re-renders)

These hooks need to be converted to `useState` so dependent hooks can re-render when they become available:

1. **`useThreeShadows`** ❌
   - Currently: `useRef<ThreeShadowsResult | null>(null)`
   - Returns: `shadowsRef.current`
   - Issue: Doesn't trigger re-render when result becomes available

2. **`useThreeModelLoader`** ❌
   - Currently: `useRef<ThreeModelLoaderResult | null>(null)`
   - Returns: `loaderRef.current`
   - Issue: Doesn't trigger re-render when result becomes available

3. **`useThreeObjectManager`** ❌
   - Currently: `useRef<ThreeObjectManagerResult | null>(null)`
   - Returns: `managerRef.current`
   - Issue: Doesn't trigger re-render when result becomes available

4. **`useThreeAnimation`** ❌ **CRITICAL**
   - Currently: `useRef<ThreeAnimationResult | null>(null)`
   - Returns: `animationRef.current`
   - Issue: **This is why animation hook isn't initializing!** When `animationRef.current` is set, React doesn't re-render, so `animationConfig` useMemo doesn't re-evaluate, and `ViewerInstance` never gets built.

## Current Problem

The `animationConfig` useMemo in `ViewerCanvas.tsx` depends on `effectsResult`, but even when `effectsResult` becomes available (now fixed with `useState`), the `animationResult` from `useThreeAnimation` never triggers a re-render because it uses `useRef`.

This means:
1. ✅ `effectsResult` becomes available → triggers re-render
2. ✅ `animationConfig` useMemo re-evaluates → creates config
3. ❌ `useThreeAnimation(animationConfig)` runs, but `animationRef.current` doesn't trigger re-render
4. ❌ `hookBasedViewer` useMemo never sees `animationResult` as available
5. ❌ `ViewerInstance` never gets built

## Solution

Convert all remaining hooks (`useThreeShadows`, `useThreeModelLoader`, `useThreeObjectManager`, `useThreeAnimation`) to use `useState` instead of `useRef`, following the same pattern as the fixed hooks.

## Pattern to Follow

```typescript
// OLD (useRef - doesn't trigger re-render):
const resultRef = useRef<ResultType | null>(null)
// ... in useEffect ...
resultRef.current = result
return resultRef.current

// NEW (useState - triggers re-render):
const [result, setResult] = useState<ResultType | null>(null)
const resultRef = useRef<ResultType | null>(null) // Keep for cleanup access
// ... in useEffect ...
resultRef.current = result // Store in ref for cleanup
setResult(result) // Store in state to trigger re-render
// ... in cleanup ...
setResult(null) // Set state to null on cleanup
return result
```












