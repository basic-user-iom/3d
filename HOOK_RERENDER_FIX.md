# Hook Re-render Fix

## Issue
Hooks were using `useRef` to store results, which doesn't trigger React re-renders. This meant:
- `useThreeScene` would initialize and set `sceneRef.current = result`
- But React doesn't know the value changed
- Dependent hooks' configs (like `controlsConfig`) don't re-evaluate
- Other hooks never initialize

## Root Cause
```typescript
// Before (doesn't trigger re-render):
const sceneRef = useRef<ThreeSceneResult | null>(null)
// ... later ...
sceneRef.current = result
return sceneRef.current // React doesn't know this changed
```

## Fix Applied

### Changed to useState
```typescript
// After (triggers re-render):
const [sceneResult, setSceneResult] = useState<ThreeSceneResult | null>(null)
const sceneResultRef = useRef<ThreeSceneResult | null>(null) // For cleanup access

// ... later ...
sceneResultRef.current = result // Store in ref for cleanup
setSceneResult(result) // Store in state to trigger re-render
return sceneResult // React knows this changed
```

### Why Both?
- **useState**: Triggers re-render so dependent hooks update
- **useRef**: Provides stable reference for cleanup (avoids dependency issues)

## Expected Behavior

After fix:
1. `useThreeScene` initializes
2. `setSceneResult(result)` triggers re-render
3. `sceneResult` updates in ViewerCanvas
4. `controlsConfig` useMemo re-evaluates (because `sceneResult` changed)
5. `useThreeControls` receives non-null config
6. All dependent hooks initialize in sequence

## Testing

Check console for:
- `[useThreeScene] Scene initialized` ✅
- `[useThreeControls] Controls initialized` ✅ (should appear now)
- `[useThreeLighting] Lighting system initialized` ✅
- All 8 hooks initializing successfully ✅

## Status

✅ **Fixed** - `useThreeScene` now uses `useState` to trigger re-renders, allowing dependent hooks to initialize.














